//! Captura no macOS (ScreenCaptureKit) — **esqueleto**.
//!
//! As três funções da fachada existem porque o `captura/mod.rs` delega a
//! `plataforma::…` sem `#[cfg]`: sem elas não haveria a quem delegar no alvo
//! do macOS. Elas fazem **este módulo** compilar, e só ele — o resto do `tela`
//! também entra no macOS pelo cfg `tela_nativa`, e o `fontes` e a
//! `transmissao` precisaram cada um do ramo que lhes faltava (lista vazia lá,
//! laço de áudio vazio no outro). O conteúdo real — `SCShareableContent`,
//! `SCStream` e o delegate que empurra quadro na `Caixa` a partir da fila de
//! despacho — é de outro cartão. Até lá, abrir uma captura recusa com uma
//! frase em vez de mentir, e a grade fica sem miniatura (o que ela já sabe
//! tratar: cai no ícone do app).
//!
//! O `Alvo` que chega aqui vai carregar `CGWindowID`/`CGDirectDisplayID` no
//! `u64` — nunca handle do Windows —, postos pelo `fontes` do macOS quando ele
//! existir; hoje ele não resolve id nenhum, então nada chega.

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
