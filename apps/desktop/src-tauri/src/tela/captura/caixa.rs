//! A caixa de **um** quadro entre a thread que captura e a que transmite.
//!
//! É o encontro entre uma thread que **empurra** quadro e outra que **puxa** —
//! o modelo do WGC (callback na thread de captura do `windows-capture`) e o do
//! `SCStream` do macOS (callback numa fila de despacho própria). Por isso ela
//! mora aqui, no neutro, e não dentro do backend de uma plataforma só.
//!
//! A caixa guarda **um** quadro: se o encoder atrasar, o quadro velho é
//! substituído pelo novo, que é o comportamento certo para vídeo ao vivo
//! (atraso acumulado é pior que quadro perdido). O buffer do quadro
//! substituído não é jogado fora — volta para quem captura encher de novo, em
//! vez de uma alocação de ~15 MB por quadro em 1440p.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use super::{Erro, Quadro};

/// O que a thread de captura e quem transmite compartilham.
#[derive(Default)]
pub struct Caixa {
    quadro: Mutex<Option<Quadro>>,
    chegou: Condvar,
    /// A fonte fechou (o `Closed` da sessão): a partir daqui não vem mais nada.
    encerrada: AtomicBool,
    /// Buffer de um quadro que o encoder já consumiu (`Capturador::reciclar`),
    /// para o callback encher no lugar de alocar outro.
    livre: Mutex<Option<Vec<u8>>>,
}

impl Caixa {
    /// Põe o quadro e devolve o que ele substituiu, se havia — um quadro que o
    /// encoder não chegou a pegar, e cujo buffer serve ao próximo.
    pub fn entregar(&self, quadro: Quadro) -> Option<Quadro> {
        let mut guarda = self.quadro.lock().unwrap_or_else(|e| e.into_inner());
        let antigo = guarda.replace(quadro);
        drop(guarda);
        self.chegou.notify_all();
        antigo
    }

    /// A fonte fechou: daqui em diante `proximo` devolve `Erro::FonteSumiu`.
    pub fn encerrar(&self) {
        self.encerrada.store(true, Ordering::Release);
        self.chegou.notify_all();
    }

    /// O buffer que o encoder devolveu, se houver, para a captura encher.
    pub fn tomar_livre(&self) -> Option<Vec<u8>> {
        self.livre.lock().unwrap_or_else(|e| e.into_inner()).take()
    }

    pub fn devolver_livre(&self, bgra: Vec<u8>) {
        *self.livre.lock().unwrap_or_else(|e| e.into_inner()) = Some(bgra);
    }

    /// Espera até `limite` por um quadro novo.
    ///
    /// `viva` é a checagem extra que só a plataforma sabe fazer — no WGC, "a
    /// thread de captura ainda está de pé?" —, e ela é consultada a cada volta
    /// do laço, não só na entrada. Ela é chamada **com o mutex do quadro
    /// seguro**: quem a implementa não pode tocar nesta `Caixa` lá dentro, sob
    /// pena de travar o processo contra si mesmo.
    pub fn proximo(
        &self,
        limite: Duration,
        viva: &dyn Fn() -> bool,
    ) -> Result<Option<Quadro>, Erro> {
        let fim = Instant::now() + limite;
        let mut guarda = self.quadro.lock().unwrap_or_else(|e| e.into_inner());
        loop {
            if let Some(quadro) = guarda.take() {
                return Ok(Some(quadro));
            }
            if self.encerrada.load(Ordering::Acquire) {
                return Err(Erro::FonteSumiu);
            }
            // A thread de captura morreu por erro (o `Closed` não dispara
            // nesse caso): tratar como fonte perdida, e não esperar para
            // sempre por um quadro que não vem.
            if !viva() {
                return Err(Erro::FonteSumiu);
            }
            let agora = Instant::now();
            if agora >= fim {
                return Ok(None);
            }
            let (nova, _) = self
                .chegou
                .wait_timeout(guarda, fim - agora)
                .unwrap_or_else(|e| e.into_inner());
            guarda = nova;
        }
    }
}
