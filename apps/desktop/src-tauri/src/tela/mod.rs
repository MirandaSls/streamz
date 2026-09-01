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
//! Este módulo é a metade "o que existe". A metade "capture isto" vem depois,
//! e as duas juntas é que substituem o `getDisplayMedia` no app de desktop.
//!
//! Fora do Windows a lista sai vazia de propósito: a web trata lista vazia como
//! "sem backend nativo" e cai no `getDisplayMedia` de sempre, que é o caminho
//! do navegador e do desenvolvimento em Linux/macOS.

use serde::Serialize;

#[cfg(windows)]
mod fontes;
#[cfg(windows)]
mod icone;

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
