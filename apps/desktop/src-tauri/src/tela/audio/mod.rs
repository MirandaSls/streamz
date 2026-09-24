//! Som do sistema para a captura de tela — o "compartilhar áudio do sistema".
//!
//! A fachada aqui é o contrato: o que sai deste módulo é **sempre i16 estéreo
//! a 48 kHz**, que é o que a faixa de áudio publicada espera. Como cada
//! sistema chega lá é problema do módulo da plataforma; a matemática comum —
//! reduzir a dois canais e reamostrar — mora em `mistura`, fora de qualquer
//! `#[cfg]`, para poder ser testada em qualquer host.

// Num alvo sem backend de som do sistema (nem Windows nem macOS) ninguém
// consome o contrato abaixo — e é assim mesmo: o módulo continua compilando
// para que os testes de `mistura` rodem em qualquer host, e não para ser
// usado ali.
#![cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]

mod mistura;

#[cfg(windows)]
mod windows;

// `self::` é obrigatório: sem ele o caminho seria ambíguo com o crate
// `windows`, que tem exatamente o mesmo nome do módulo.
#[cfg(windows)]
pub use self::windows::Loopback;

// ScreenCaptureKit: o som do sistema chega por um `SCStream` só de áudio.
#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
pub use self::macos::Loopback;

/// A taxa e o número de canais que saem daqui, sempre.
pub const TAXA: u32 = 48_000;
pub const CANAIS: u16 = 2;

/// O que pode dar errado no loopback. Sem mensagem de propósito: o áudio da
/// tela é acessório da transmissão, e quem lê só precisa decidir entre
/// reabrir e desistir — o vídeo segue nos dois casos.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErroDeAudio {
    /// O dispositivo de saída padrão mudou ou sumiu: reabrir.
    DispositivoInvalidado,
    /// Qualquer outra coisa (sem dispositivo de saída, formato estranho).
    Falha,
}

/// Este alvo sabe capturar o som do sistema? No Windows, sempre: o loopback
/// do WASAPI é do próprio sistema, não depende de driver de terceiro.
#[cfg(windows)]
pub fn disponivel() -> bool {
    true
}

/// No macOS, a partir do 13: é quando o ScreenCaptureKit ganhou captura de
/// áudio. Antes disso a captura nativa nem é oferecida (a web segue no
/// `getDisplayMedia`), mas a pergunta é feita de novo aqui para que marcar
/// "compartilhar áudio" num sistema velho só deixe a faixa de fora.
#[cfg(target_os = "macos")]
pub fn disponivel() -> bool {
    crate::tela::sck::sistema_atende()
}

/// Sem backend de som do sistema neste alvo. Quem transmite continua com o
/// vídeo e simplesmente não publica a faixa de áudio — marcar a caixa
/// "compartilhar áudio" não pode derrubar a transmissão inteira.
#[cfg(not(any(windows, target_os = "macos")))]
pub fn disponivel() -> bool {
    false
}
