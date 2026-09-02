//! Fontes de compartilhamento de tela: quais janelas e monitores existem.
//!
//! **Por que isto mora no Rust e não na web.** `getDisplayMedia` é uma API de
//! *gesto*: ela abre o seletor do próprio navegador e devolve uma captura já
//! escolhida. Não existe "listar janelas" nem "capture esta aqui" — enumerar o
//! que o usuário tem aberto é privilégio de aplicação nativa, e é justamente o
//! que falta para a grade de miniaturas do Discord. O `ScreenCaptureStarting`
//! do WebView2 também não resolve: ele só deixa *permitir ou cancelar*, nunca
//! escolher a fonte.
//!
//! Este módulo é a metade "o que existe" (`fontes`). A metade "capture isto"
//! é `captura`, com os dois backends sem borda amarela; `transmissao` publica
//! o que foi capturado na sala do LiveKit, e as três juntas é que substituem
//! o `getDisplayMedia` no app de desktop.
//!
//! Fora do Windows a lista sai vazia e `capacidades_de_tela` responde
//! `nativo: false` de propósito: a web trata isso como "sem backend nativo" e
//! cai no `getDisplayMedia` de sempre, que é o caminho do navegador e do
//! desenvolvimento em Linux/macOS.

use serde::Serialize;

#[cfg(windows)]
mod captura;
#[cfg(windows)]
mod fontes;
#[cfg(windows)]
mod icone;
#[cfg(windows)]
mod transmissao;

/// Uma janela ou um monitor que o usuário pode transmitir.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fonte {
    /// Estável dentro de uma sessão do seletor, não entre sessões: um `HWND`
    /// pode ser reciclado depois que a janela fecha. É por isso que a captura
    /// revalida a fonte em vez de confiar no id vindo da web.
    pub id: String,
    pub tipo: TipoDeFonte,
    /// O título da janela, ou o nome do monitor ("Tela 1").
    pub titulo: String,
    /// Nome do executável dono da janela, sem extensão ("chrome", "Code").
    /// `None` para monitores e para processos que não deixam abrir o handle.
    pub app: Option<String>,
    /// Ícone do executável como data URL PNG, pronto para `<img src>`.
    /// `None` quando o executável não tem ícone — a web desenha um genérico.
    pub icone: Option<String>,
    pub largura: u32,
    pub altura: u32,
    /// Só para monitores: qual é o principal, para ordenar a aba "Telas".
    pub principal: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TipoDeFonte {
    Janela,
    Monitor,
}

/// Lista o que dá para transmitir agora.
///
/// Roda fora da thread principal: enumerar janelas é rápido, mas extrair o
/// ícone de cada executável abre e decodifica um recurso por processo, e com
/// trinta janelas abertas isso é tempo suficiente para a interface engasgar se
/// fosse na thread da janela.
#[tauri::command]
pub async fn fontes_de_tela() -> Result<Vec<Fonte>, String> {
    tauri::async_runtime::spawn_blocking(listar)
        .await
        .map_err(|e| format!("falha ao listar fontes de tela: {e}"))
}

#[cfg(windows)]
fn listar() -> Vec<Fonte> {
    let mut todas = fontes::monitores();
    todas.extend(fontes::janelas());
    todas
}

#[cfg(not(windows))]
fn listar() -> Vec<Fonte> {
    Vec::new()
}

/// O que a captura nativa consegue nesta máquina — o seletor decide por isto
/// se mostra a grade de miniaturas ou o botão do `getDisplayMedia`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capacidades {
    /// Há backend nativo (só no Windows).
    pub nativo: bool,
    /// `"wgc"` (Windows 11, janela isolada) ou `"dxgi"` (Windows 10, recorte
    /// do monitor). `None` sem backend.
    pub backend: Option<&'static str>,
    /// Compartilhar uma **janela** mostra o que estiver por cima dela. É o
    /// caso do DXGI, e o seletor avisa o usuário antes de ele escolher.
    pub janela_recortada: bool,
}

#[tauri::command]
pub fn capacidades_de_tela() -> Capacidades {
    capacidades()
}

#[cfg(windows)]
fn capacidades() -> Capacidades {
    let backend = captura::backend();
    Capacidades {
        nativo: true,
        backend: Some(backend.nome()),
        janela_recortada: backend == captura::Backend::Dxgi,
    }
}

#[cfg(not(windows))]
fn capacidades() -> Capacidades {
    Capacidades {
        nativo: false,
        backend: None,
        janela_recortada: false,
    }
}

/// Miniaturas ao vivo das fontes pedidas, na mesma ordem, como data URLs JPEG.
/// `None` onde não deu (janela minimizada, conteúdo protegido, fonte que
/// sumiu): a grade mostra o ícone do app no lugar.
///
/// A web chama isto em laço enquanto o seletor está aberto — a próxima
/// chamada só depois de a anterior voltar, o que dá o ritmo natural (uma
/// varredura leva de cem milissegundos a um segundo, conforme o número de
/// janelas). Roda fora da thread principal e uma varredura por vez: duas
/// sessões de captura da mesma janela ao mesmo tempo é o que o WGC menos
/// gosta.
#[tauri::command]
pub async fn miniaturas_de_tela(ids: Vec<String>) -> Result<Vec<Option<String>>, String> {
    tauri::async_runtime::spawn_blocking(move || miniaturas(&ids))
        .await
        .map_err(|e| format!("falha ao gerar miniaturas: {e}"))
}

#[cfg(windows)]
fn miniaturas(ids: &[String]) -> Vec<Option<String>> {
    use base64::Engine as _;
    use std::sync::Mutex;

    static UMA_POR_VEZ: Mutex<()> = Mutex::new(());
    let _guarda = UMA_POR_VEZ.lock().unwrap_or_else(|e| e.into_inner());

    // Quem não resolve (fonte que sumiu) fica de fora da captura e volta
    // `None` na posição dele — a ordem da resposta é a do pedido.
    let alvos: Vec<(usize, captura::Alvo)> = ids
        .iter()
        .enumerate()
        .filter_map(|(i, id)| fontes::alvo(id).map(|alvo| (i, alvo)))
        .collect();
    let so_alvos: Vec<captura::Alvo> = alvos.iter().map(|(_, alvo)| *alvo).collect();
    let jpegs = captura::miniaturas(&so_alvos);

    let mut saida: Vec<Option<String>> = vec![None; ids.len()];
    for ((i, _), jpeg) in alvos.iter().zip(jpegs) {
        saida[*i] = jpeg.map(|bytes| {
            format!(
                "data:image/jpeg;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            )
        });
    }
    saida
}

#[cfg(not(windows))]
fn miniaturas(ids: &[String]) -> Vec<Option<String>> {
    vec![None; ids.len()]
}

/// A transmissão em curso, gerenciada pelo Tauri (`app.manage`). Fora do
/// Windows é um marcador vazio: os comandos respondem que não há captura
/// nativa e a web fica no `getDisplayMedia`.
#[cfg(windows)]
pub use transmissao::Transmissao;

#[cfg(not(windows))]
#[derive(Default)]
pub struct Transmissao;

#[cfg(not(windows))]
impl Transmissao {
    pub fn encerrar(&self) {}
}

/// Começa a transmitir a fonte `pedido.fonteId` na sala do LiveKit como o
/// participante do token (`<userId>#tela`). Trocar de fonte é chamar de novo.
/// Quando a transmissão acaba sozinha (janela fechada, sala caída), a web
/// recebe o evento `tela:encerrada` com o motivo.
#[cfg(windows)]
#[tauri::command]
pub async fn iniciar_tela(
    app: tauri::AppHandle,
    estado: tauri::State<'_, Transmissao>,
    pedido: transmissao::Pedido,
) -> Result<(), String> {
    transmissao::iniciar(app, &estado, pedido).await
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn iniciar_tela(
    _app: tauri::AppHandle,
    _estado: tauri::State<'_, Transmissao>,
    _pedido: serde_json::Value,
) -> Result<(), String> {
    Err("Captura de tela nativa só existe no Windows".to_string())
}

/// Para a transmissão em curso (se houver) e tira o `#tela` da sala.
#[cfg(windows)]
#[tauri::command]
pub async fn parar_tela(estado: tauri::State<'_, Transmissao>) -> Result<(), String> {
    transmissao::parar(&estado).await;
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn parar_tela(_estado: tauri::State<'_, Transmissao>) -> Result<(), String> {
    Ok(())
}
