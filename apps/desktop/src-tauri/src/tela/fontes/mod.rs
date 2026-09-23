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

// O macOS entra neste módulo desde que o `tela/mod.rs` passou a compilá-lo sob
// o cfg `tela_nativa` (Windows **e** macOS), e a enumeração nativa de lá ainda
// não existe: quem a escreve é o mesmo cartão do `SCShareableContent` que
// preenche `captura/mac`. Até ele chegar, esta `plataforma` honesta — nada a
// listar, nada a resolver — é o que faz o alvo do macOS compilar, em vez de a
// fachada chamar funções de um módulo inexistente.
//
// Ninguém transmite por este caminho de qualquer forma: `captura::mac::abrir`
// recusa com uma frase. O que se vê hoje no app de macOS é o `getDisplayMedia`
// do webview, como antes deste módulo existir para o alvo: `capacidades_de_tela`
// consulta `Backend::implementado()` e, com o backend do macOS ainda não
// implementado, responde `nativo: false` — decisão do `tela/mod.rs`, não deste
// arquivo.
#[cfg(target_os = "macos")]
mod macos {
    use super::{Alvo, Fonte};

    pub fn monitores() -> Vec<Fonte> {
        Vec::new()
    }

    pub fn janelas() -> Vec<Fonte> {
        Vec::new()
    }

    pub fn alvo(_id: &str) -> Option<Alvo> {
        None
    }

    /// `false` porque nenhum id chega aqui: sem enumeração não há `Fonte` a
    /// clicar. Responder `true` trocaria a recusa verdadeira — a da captura,
    /// que diz que o backend do macOS não existe — por uma mentira ("restaure
    /// a janela") sobre uma janela que ninguém escolheu.
    pub fn minimizada(_id: &str) -> bool {
        false
    }
}

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

/// A fonte é uma janela que não está desenhando nada — minimizada no Windows?
///
/// Quem inicia a transmissão pergunta isto antes de abrir a captura: sem
/// quadro nenhum, o outro lado ficaria em "Carregando a transmissão…" para
/// sempre. Recusar com uma frase é melhor que transmitir o nada.
pub fn minimizada(id: &str) -> bool {
    plataforma::minimizada(id)
}
