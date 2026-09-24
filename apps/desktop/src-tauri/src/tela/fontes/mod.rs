//! "O que existe para transmitir", por plataforma.
//!
//! A fachada abaixo é o contrato, e é por isso que ela mora num arquivo sem
//! `use` de sistema nenhum: quem chama — o `tela/mod.rs` e a `transmissao` —
//! não sabe o que é `HWND` nem o que é `CGWindowID`. O `Fonte::id` é uma
//! string opaca que **só** o módulo da plataforma sabe ler, e a tradução dela
//! para o `Alvo` da captura acontece aqui dentro, em `alvo`.

use super::captura::Alvo;
use super::Fonte;

#[cfg(windows)]
mod windows;

// `self::` é obrigatório: sem ele o caminho seria ambíguo com o crate
// `windows`, que tem exatamente o mesmo nome do módulo.
#[cfg(windows)]
use self::windows as plataforma;

// No macOS a enumeração vem do `SCShareableContent` do ScreenCaptureKit — o
// mesmo framework que a `captura/mac` usa para transmitir, de modo que a grade
// só oferece o que a captura consegue abrir. Sem macOS 13+ ou sem a permissão
// de Gravação de Tela as listas saem vazias, e quem decide entre a grade nativa
// e o `getDisplayMedia` do webview é o `capacidades_de_tela` do `tela/mod.rs`,
// não este arquivo.
#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
use self::macos as plataforma;

/// Os monitores ligados, com o principal em primeiro lugar.
pub fn monitores() -> Vec<Fonte> {
    plataforma::monitores()
}

/// As janelas que valem ser oferecidas na grade — a plataforma é que decide
/// o que é "uma janela de aplicativo" e o que é entulho.
pub fn janelas() -> Vec<Fonte> {
    plataforma::janelas()
}

/// Resolve o id de uma `Fonte` no alvo da captura, **revalidando**: `None`
/// quando a janela fechou entre a enumeração e o clique.
pub fn alvo(id: &str) -> Option<Alvo> {
    plataforma::alvo(id)
}

/// A fonte é uma janela que não está desenhando nada — minimizada no Windows,
/// minimizada, escondida ou em outro Space no macOS?
///
/// Quem inicia a transmissão pergunta isto antes de abrir a captura: sem
/// quadro nenhum, o outro lado ficaria em "Carregando a transmissão…" para
/// sempre. Recusar com uma frase é melhor que transmitir o nada.
pub fn minimizada(id: &str) -> bool {
    plataforma::minimizada(id)
}
