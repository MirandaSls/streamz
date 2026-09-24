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
//! Quem **compila** este módulo é o cfg `tela_nativa`, posto pelo `build.rs`
//! (Windows e macOS). Nos outros alvos a lista sai vazia e
//! `capacidades_de_tela` responde `nativo: false` de propósito: a web trata
//! isso como "sem backend nativo" e cai no `getDisplayMedia` de sempre, que é
//! o caminho do navegador e do desenvolvimento em Linux.
//!
//! Compilar, porém, não é a mesma coisa que funcionar: enquanto o backend do
//! macOS não estiver todo de pé, `nativo` **não** é o mesmo que
//! `cfg(tela_nativa)` — ver `capacidades`.

use serde::Serialize;

// `audio` fica **fora** do `cfg` de propósito. A metade testável dele —
// `audio::mistura`, a reamostragem e a redução a dois canais — não toca
// sistema nenhum, mas enquanto o módulo inteiro era `#[cfg(windows)]` os
// quatro `#[test]` dela não rodavam em lugar algum: não neste servidor, não
// em máquina de build. Compilar o módulo em todo alvo é o que faz
// `cargo test` alcançá-los; o que é de plataforma (o `Loopback`) continua
// atrás de `#[cfg]` lá dentro.
mod audio;
#[cfg(tela_nativa)]
mod captura;
#[cfg(tela_nativa)]
mod fontes;
#[cfg(tela_nativa)]
mod icone;
// Helpers do ScreenCaptureKit (permissão, `SCShareableContent`, escala do
// display). `fontes`, `captura`, `audio` e `icone` chamam
// `crate::tela::sck::*` do lado macOS deles, daí `pub(crate)` em vez de
// privado ao módulo.
#[cfg(target_os = "macos")]
pub(crate) mod sck;
#[cfg(tela_nativa)]
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

#[cfg(tela_nativa)]
fn listar() -> Vec<Fonte> {
    let mut todas = fontes::monitores();
    todas.extend(fontes::janelas());
    todas
}

#[cfg(not(tela_nativa))]
fn listar() -> Vec<Fonte> {
    Vec::new()
}

/// O que a captura nativa consegue nesta máquina — o seletor decide por isto
/// se mostra a grade de miniaturas ou o botão do `getDisplayMedia`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capacidades {
    /// Há backend de captura que **funciona** nesta máquina — e não "o
    /// módulo `tela` compilou neste alvo". Ver `capacidades`.
    pub nativo: bool,
    /// `"wgc"` (Windows 11, janela isolada), `"dxgi"` (Windows 10, recorte do
    /// monitor) ou `"sck"` (macOS, ScreenCaptureKit). `None` sem backend.
    pub backend: Option<&'static str>,
    /// Compartilhar uma **janela** mostra o que estiver por cima dela. É o
    /// caso do DXGI, e o seletor avisa o usuário antes de ele escolher.
    pub janela_recortada: bool,
    /// Dá para levar o som do sistema junto?
    ///
    /// Não é a mesma pergunta que `nativo`: no Windows o loopback do WASAPI é
    /// do próprio sistema e vale sempre; no macOS só do 13 em diante, porque
    /// o `capturesAudio` do ScreenCaptureKit não existe no 12. Com `false` o
    /// seletor esconde a caixa "compartilhar áudio" em vez de oferecer uma
    /// opção que a transmissão ignoraria em silêncio.
    pub audio_do_sistema: bool,
    /// O sistema exige autorização para capturar a tela, e ela está dada?
    pub permissao: Permissao,
}

/// O eixo da autorização de captura — que existe em uns sistemas e não em
/// outros, e por isso não cabia num `bool`.
///
/// O macOS pede autorização de **gravação de tela** (TCC) e, sem ela, o
/// `SCShareableContent` responde erro `-3801`: a grade ficaria em "Nenhuma
/// janela aberta" para sempre, sem dizer por quê — é para esse silêncio que
/// este campo existe. O Windows não tem equivalente (quem está na sessão pode
/// capturar a sessão), daí `NaoPrecisa`, que a web lê como "não mostre nada
/// sobre permissão".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Permissao {
    NaoPrecisa,
    Concedida,
    Faltando,
}

#[tauri::command]
pub fn capacidades_de_tela() -> Capacidades {
    capacidades()
}

/// Pede a autorização de gravação de tela ao usuário.
///
/// No macOS chama `CGRequestScreenCaptureAccess`, que dispara o diálogo do
/// sistema **só na primeira vez**; depois disso (permissão já concedida,
/// negada ou já perguntada antes) ela abre direto os Ajustes > Privacidade e
/// devolve `false` sem perguntar de novo — daí não dar para tratar o retorno
/// como "o usuário concedeu agora". O TCC também só passa a valer depois de o
/// app **reiniciar**: conceder a chave nos Ajustes não muda nada no processo
/// já rodando, e é por isso que a web, ao ver `Faltando` depois de chamar
/// isto, oferece um botão "Reiniciar" em vez de tentar de novo no mesmo
/// processo. Roda em `spawn_blocking` porque `CGRequestScreenCaptureAccess`
/// bloqueia até o usuário responder ao diálogo (ou devolve na hora, se não há
/// diálogo a mostrar).
///
/// Nos outros alvos não existe o que pedir — `NaoPrecisa` já cobre isso —
/// então devolve `true` direto.
#[tauri::command]
pub async fn pedir_permissao_de_tela() -> bool {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(sck::pedir_permissao)
            .await
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// **O invariante:** `nativo` quer dizer "há backend de captura que funciona",
/// nunca "o módulo `tela` compilou neste alvo". A web decide por ele entre a
/// grade de miniaturas nossa e o `getDisplayMedia` do webview, e prometer a
/// grade onde nada captura é entregar uma lista vazia para sempre — foi o que
/// o macOS passou a fazer quando este módulo saiu do `#[cfg(windows)]` para o
/// `tela_nativa` com o `captura::mac` ainda em esqueleto.
///
/// Por isso a resposta vem do backend (`Backend::implementado`), e não do
/// `cfg`: no dia em que o `captura::mac` também estiver implementado, o
/// macOS vira `nativo: true` com tudo o que vem junto — backend, recorte,
/// som, permissão — sem ninguém precisar lembrar deste arquivo.
#[cfg(tela_nativa)]
fn capacidades() -> Capacidades {
    let backend = captura::backend();
    if !backend.implementado() {
        return sem_captura_nativa();
    }
    Capacidades {
        nativo: true,
        backend: Some(backend.nome()),
        // Quem sabe se a janela sai recortada é o backend; repetir a
        // comparação com o DXGI aqui seria uma segunda verdade para manter.
        janela_recortada: backend.janela_recortada(),
        // Idem para o som: a resposta por plataforma já mora no `audio`.
        audio_do_sistema: audio::disponivel(),
        permissao: permissao(),
    }
}

/// O Windows não tem o eixo da autorização: quem está na sessão pode capturar
/// a sessão, sem nada a pedir a ninguém.
#[cfg(all(tela_nativa, not(target_os = "macos")))]
fn permissao() -> Permissao {
    Permissao::NaoPrecisa
}

/// No macOS a resposta vem do TCC de verdade, via
/// `CGPreflightScreenCaptureAccess` (`sck::tem_permissao`) — sem chamar
/// `CGRequestScreenCaptureAccess`, que dispararia o diálogo do sistema; isto
/// aqui só lê o estado atual.
#[cfg(all(tela_nativa, target_os = "macos"))]
fn permissao() -> Permissao {
    if sck::tem_permissao() {
        Permissao::Concedida
    } else {
        Permissao::Faltando
    }
}

#[cfg(not(tela_nativa))]
fn capacidades() -> Capacidades {
    sem_captura_nativa()
}

/// A resposta de quem não captura: ou o alvo nem tem o módulo (Linux, celular),
/// ou tem e o backend dele ainda não funciona (macOS, hoje). É uma só porque
/// para a web os dois casos são o mesmo caso — e duas cópias dela acabariam
/// divergindo no campo que a web ainda não lê.
///
/// `backend: None` inclusive onde há um nome a dizer: o campo é "qual API está
/// fazendo a captura", e aqui não há captura. Sem backend também não há som a
/// levar junto nem autorização a pedir — quem captura neste alvo é o
/// `getDisplayMedia` do webview, que negocia o consentimento dele por conta.
fn sem_captura_nativa() -> Capacidades {
    Capacidades {
        nativo: false,
        backend: None,
        janela_recortada: false,
        audio_do_sistema: false,
        permissao: Permissao::NaoPrecisa,
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

#[cfg(tela_nativa)]
fn miniaturas(ids: &[String]) -> Vec<Option<String>> {
    use base64::Engine as _;

    // Uma transmissão está sendo aberta: nem começar (ver `SemMiniaturas`).
    if SEM_MINIATURAS.load(std::sync::atomic::Ordering::Acquire) {
        return vec![None; ids.len()];
    }
    let _guarda = UMA_VARREDURA.lock().unwrap_or_else(|e| e.into_inner());

    // Quem não resolve (fonte que sumiu) fica de fora da captura e volta
    // `None` na posição dele — a ordem da resposta é a do pedido.
    let alvos: Vec<(usize, captura::Alvo)> = ids
        .iter()
        .enumerate()
        .filter_map(|(i, id)| fontes::alvo(id).map(|alvo| (i, alvo)))
        .collect();
    let so_alvos: Vec<captura::Alvo> = alvos.iter().map(|(_, alvo)| *alvo).collect();
    let jpegs = captura::miniaturas(&so_alvos, &SEM_MINIATURAS);

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

#[cfg(not(tela_nativa))]
fn miniaturas(ids: &[String]) -> Vec<Option<String>> {
    vec![None; ids.len()]
}

/// Uma varredura de miniaturas por vez: duas sessões de captura da mesma
/// janela ao mesmo tempo é o que o WGC menos gosta.
#[cfg(tela_nativa)]
static UMA_VARREDURA: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Enquanto isto está levantado, a grade não gera miniatura nenhuma — e a
/// varredura que já estava rodando desiste na fonte seguinte.
#[cfg(tela_nativa)]
static SEM_MINIATURAS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// **Onde estava boa parte do atraso ao transmitir uma janela.**
///
/// O seletor mantém as miniaturas ao vivo enquanto está aberto, e ele só
/// fecha depois que a transmissão foi ao ar — ou seja, a varredura continua
/// girando durante todo o início da captura definitiva, abrindo e fechando
/// uma sessão de captura por janela, inclusive na janela que o usuário
/// acabou de escolher. No WGC isso é um dispositivo D3D novo por miniatura
/// disputando o mesmo alvo; no DXGI é pior, porque cada duplicação derruba a
/// anterior do mesmo monitor.
///
/// Esta guarda levanta a bandeira, **espera a varredura em curso sair**
/// (a de dentro desiste na próxima fonte, então a espera é curta) e só
/// devolve o controle quando o caminho está livre. Ao ser derrubada, as
/// miniaturas voltam — o seletor pode ter continuado aberto porque a
/// transmissão falhou.
#[cfg(tela_nativa)]
pub struct SemMiniaturas;

#[cfg(tela_nativa)]
impl SemMiniaturas {
    /// Bloqueia até a varredura em curso terminar: chame de `spawn_blocking`.
    fn erguer() -> Self {
        SEM_MINIATURAS.store(true, std::sync::atomic::Ordering::Release);
        drop(UMA_VARREDURA.lock().unwrap_or_else(|e| e.into_inner()));
        Self
    }
}

#[cfg(tela_nativa)]
impl Drop for SemMiniaturas {
    fn drop(&mut self) {
        SEM_MINIATURAS.store(false, std::sync::atomic::Ordering::Release);
    }
}

/// A transmissão em curso, gerenciada pelo Tauri (`app.manage`). Num alvo sem
/// captura nativa é um marcador vazio: os comandos respondem que não há
/// captura nativa e a web fica no `getDisplayMedia`.
#[cfg(tela_nativa)]
pub use transmissao::Transmissao;

#[cfg(not(tela_nativa))]
#[derive(Default)]
pub struct Transmissao;

#[cfg(not(tela_nativa))]
impl Transmissao {
    pub fn encerrar(&self) {}
}

/// Entra na sala como `<userId>#tela` **sem publicar nada**, para que o
/// clique na miniatura só tenha de publicar.
///
/// Abrir a conexão é a etapa mais cara do início: sinal `wss`, join, ICE,
/// DTLS. Feita no clique, ela é segundo(s) de tela preta; feita quando o
/// seletor abre, o usuário a paga enquanto escolhe o que transmitir. Falhar
/// aqui não é erro para ninguém — `iniciar_tela` conecta na hora, como antes.
#[cfg(tela_nativa)]
#[tauri::command]
pub async fn preparar_tela(
    estado: tauri::State<'_, Transmissao>,
    preparo: transmissao::Preparo,
) -> Result<(), String> {
    transmissao::preparar(&estado, preparo).await
}

#[cfg(not(tela_nativa))]
#[tauri::command]
pub async fn preparar_tela(
    _estado: tauri::State<'_, Transmissao>,
    _preparo: serde_json::Value,
) -> Result<(), String> {
    Err("Captura de tela nativa não existe neste sistema".to_string())
}

/// Desfaz a pré-conexão: o seletor fechou sem ninguém escolher fonte. Sem
/// isto o `#tela` ficaria na sala sem publicar até o LiveKit expirá-lo.
#[cfg(tela_nativa)]
#[tauri::command]
pub async fn descartar_tela(estado: tauri::State<'_, Transmissao>) -> Result<(), String> {
    transmissao::descartar(&estado).await;
    Ok(())
}

#[cfg(not(tela_nativa))]
#[tauri::command]
pub async fn descartar_tela(_estado: tauri::State<'_, Transmissao>) -> Result<(), String> {
    Ok(())
}

/// Começa a transmitir a fonte `pedido.fonteId` na sala do LiveKit como o
/// participante do token (`<userId>#tela`). Trocar de fonte é chamar de novo.
/// Quando a transmissão acaba sozinha (janela fechada, sala caída), a web
/// recebe o evento `tela:encerrada` com o motivo.
///
/// Devolve o tempo de cada etapa (ver `transmissao::Tempos`): é o que a web
/// imprime em `console.debug`, e é como se descobre qual delas ficou cara sem
/// ninguém ter um depurador aberto na máquina do usuário.
#[cfg(tela_nativa)]
#[tauri::command]
pub async fn iniciar_tela(
    app: tauri::AppHandle,
    estado: tauri::State<'_, Transmissao>,
    pedido: transmissao::Pedido,
) -> Result<transmissao::Tempos, String> {
    if fontes::minimizada(&pedido.fonte_id) {
        return Err(
            "Restaure a janela antes de transmitir: minimizada, ela não desenha nada para capturar"
                .to_string(),
        );
    }
    // As miniaturas param **antes** de a captura definitiva abrir, e só voltam
    // quando isto sai de cena. Ver `SemMiniaturas`.
    let guarda = tauri::async_runtime::spawn_blocking(SemMiniaturas::erguer)
        .await
        .map_err(|e| format!("falha ao pausar as miniaturas: {e}"))?;
    let resultado = transmissao::iniciar(app, &estado, pedido).await;
    drop(guarda);
    resultado
}

#[cfg(not(tela_nativa))]
#[tauri::command]
pub async fn iniciar_tela(
    _app: tauri::AppHandle,
    _estado: tauri::State<'_, Transmissao>,
    _pedido: serde_json::Value,
) -> Result<serde_json::Value, String> {
    Err("Captura de tela nativa não existe neste sistema".to_string())
}

/// Para a transmissão em curso (se houver) e tira o `#tela` da sala.
#[cfg(tela_nativa)]
#[tauri::command]
pub async fn parar_tela(estado: tauri::State<'_, Transmissao>) -> Result<(), String> {
    transmissao::parar(&estado).await;
    Ok(())
}

#[cfg(not(tela_nativa))]
#[tauri::command]
pub async fn parar_tela(_estado: tauri::State<'_, Transmissao>) -> Result<(), String> {
    Ok(())
}

/// Silencia (`mudo = true`) ou reativa só o áudio do sistema da transmissão,
/// sem parar a tela nem tocar no microfone. Sem transmissão com áudio, erro
/// dizendo isso — a web decide se mostra ou ignora.
#[cfg(tela_nativa)]
#[tauri::command]
pub async fn silenciar_audio_da_tela(
    estado: tauri::State<'_, Transmissao>,
    mudo: bool,
) -> Result<(), String> {
    estado.silenciar_audio(mudo).map(|_| ())
}

#[cfg(not(tela_nativa))]
#[tauri::command]
pub async fn silenciar_audio_da_tela(
    _estado: tauri::State<'_, Transmissao>,
    _mudo: bool,
) -> Result<(), String> {
    Ok(())
}
