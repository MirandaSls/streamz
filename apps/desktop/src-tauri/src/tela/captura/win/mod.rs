//! Captura no Windows: os dois backends, e a borda entre o `Alvo` neutro e os
//! handles do sistema.
//!
//! **Dois backends, escolhidos em tempo de execução, e a razão é a borda
//! amarela.** A Windows Graphics Capture (WGC) desenha uma moldura amarela em
//! volta do que está sendo capturado como aviso de segurança. A partir do
//! Windows 11 a sessão aceita `IsBorderRequired = false`; no Windows 10 a
//! propriedade não existe e a API recusa desligar. Então:
//!
//! - **WGC sem borda** quando a propriedade existe (Windows 11). Captura a
//!   janela isolada, mesmo coberta por outras.
//! - **DXGI Desktop Duplication** quando não existe (Windows 10). Duplica o
//!   monitor inteiro — nunca desenha borda — e, para janela, recorta o quadro
//!   no retângulo dela. O recorte mostra o que estiver por cima da janela; é
//!   a mesma limitação do Discord no Windows 10, e o seletor avisa (ver
//!   `Backend::janela_recortada`).
//!
//! A decisão é por **capacidade** (a propriedade `IsBorderRequired` existe na
//! `GraphicsCaptureSession`?), e não por número de build: é exatamente a
//! pergunta que interessa, e não depende de uma tabela de versões que um dia
//! fica velha.
//!
//! As miniaturas da grade saem pelo mesmo caminho da transmissão, e é aqui que
//! isso se paga: uma biblioteca de screenshot genérica usaria WGC com borda, e
//! a moldura amarela piscaria em cada janela enquanto o seletor estivesse
//! aberto.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};

use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::HMONITOR;

use super::{escala, Alvo, Backend, Capturador, Erro, Ritmo};

mod dxgi;
mod wgc;

/// O número opaco do `Alvo` volta a ser `HWND` aqui, na borda — quem o pôs lá
/// foi o `fontes` deste mesmo alvo.
///
/// `HWND` e `HMONITOR` são identificadores opacos do sistema, não ponteiros
/// para memória nossa: é por isso que cabem num `u64` sem mentira, e que
/// atravessar thread com eles é o uso normal deles (qualquer thread pode
/// consultar uma janela pelo handle).
fn hwnd_de(bruto: u64) -> HWND {
    HWND(bruto as usize as *mut c_void)
}

fn hmonitor_de(bruto: u64) -> HMONITOR {
    HMONITOR(bruto as usize as *mut c_void)
}

/// Qual dos dois backends esta máquina usa (ver o cabeçalho). Quem guarda a
/// resposta por processo é o `captura::backend()`.
pub fn backend() -> Backend {
    if wgc::sem_borda_disponivel() {
        Backend::Wgc
    } else {
        Backend::Dxgi
    }
}

pub fn abrir(alvo: Alvo, fps: u32) -> Result<Box<dyn Capturador>, Erro> {
    match super::backend() {
        Backend::Wgc => Ok(Box::new(wgc::Sessao::abrir(alvo, Some(fps))?)),
        Backend::Dxgi => Ok(Box::new(dxgi::Duplicacao::abrir(
            alvo,
            Ritmo::puxando(fps),
        )?)),
        // Inalcançável: o `backend()` daqui só devolve os dois de cima. Um
        // `Err` em vez de `unreachable!` porque isto roda na thread de captura,
        // e derrubá-la em pânico seria pior que recusar a transmissão.
        Backend::Sck => Err(Erro::Falha("backend de captura inesperado".into())),
    }
}

pub fn miniaturas(alvos: &[Alvo], cancelar: &AtomicBool) -> Vec<Option<Vec<u8>>> {
    match super::backend() {
        Backend::Wgc => {
            let mut saida: Vec<Option<Vec<u8>>> = vec![None; alvos.len()];
            for (i, alvo) in alvos.iter().enumerate() {
                if cancelar.load(Ordering::Acquire) {
                    break;
                }
                saida[i] = wgc::um_quadro(*alvo).and_then(|q| escala::jpeg(&q));
            }
            saida
        }
        Backend::Dxgi => dxgi::miniaturas(alvos, cancelar),
        // Ver `abrir`: sem miniatura a grade cai no ícone do app.
        Backend::Sck => vec![None; alvos.len()],
    }
}
