//! Captura no macOS (ScreenCaptureKit) — **esqueleto**.
//!
//! As três funções da fachada existem para o neutro compilar no alvo do
//! macOS; o conteúdo real — `SCShareableContent`, `SCStream` e o delegate que
//! empurra quadro na `Caixa` a partir da fila de despacho — é de outro cartão.
//! Até lá, abrir uma captura recusa com uma frase em vez de mentir, e a grade
//! fica sem miniatura (o que ela já sabe tratar: cai no ícone do app).
//!
//! O `Alvo` que chega aqui carrega `CGWindowID`/`CGDirectDisplayID` no `u64`,
//! postos pelo `fontes` do macOS — nunca handle do Windows.

use std::sync::atomic::AtomicBool;

use super::{Alvo, Backend, Capturador, Erro};

/// Não há escolha a fazer: no macOS o backend é um só.
pub fn backend() -> Backend {
    Backend::Sck
}

pub fn abrir(_alvo: Alvo, _fps: u32) -> Result<Box<dyn Capturador>, Erro> {
    Err(Erro::Falha(
        "a captura de tela nativa do macOS ainda não está implementada".into(),
    ))
}

pub fn miniaturas(alvos: &[Alvo], _cancelar: &AtomicBool) -> Vec<Option<Vec<u8>>> {
    vec![None; alvos.len()]
}
