//! Windows Graphics Capture sem borda — o backend do Windows 11.
//!
//! O crate `windows-capture` roda a sessão numa thread própria com laço de
//! mensagens, e entrega cada quadro num callback. Aqui o callback só copia o
//! quadro para uma caixa compartilhada e avisa; quem transmite lê da caixa no
//! ritmo dele. A caixa guarda **um** quadro: se o encoder atrasar, o quadro
//! velho é substituído pelo novo, que é o comportamento certo para vídeo ao
//! vivo (atraso acumulado é pior que quadro perdido).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use windows::Win32::UI::WindowsAndMessaging::IsWindow;
use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::{GraphicsCaptureApi, InternalCaptureControl};
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    GraphicsCaptureItemType, MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

use super::{Alvo, Capturador, Erro, Quadro};

/// Quanto uma miniatura espera pelo primeiro quadro. O WGC entrega o primeiro
/// em um ou dois vsyncs; meio segundo é folga para máquina lenta sem travar a
/// grade quando uma janela não repinta (conteúdo protegido devolve nada).
const ESPERA_DA_MINIATURA: Duration = Duration::from_millis(500);

/// A propriedade `IsBorderRequired` existe nesta versão do Windows? É o que
/// separa "WGC sem borda" de "WGC com borda amarela", e portanto Win 11 de
/// Win 10 para os nossos fins.
pub fn sem_borda_disponivel() -> bool {
    GraphicsCaptureApi::is_border_settings_supported().unwrap_or(false)
}

/// O que a thread de captura e quem transmite compartilham.
#[derive(Default)]
struct Caixa {
    quadro: Mutex<Option<Quadro>>,
    chegou: Condvar,
    /// A fonte fechou (o `Closed` da sessão): a partir daqui não vem mais nada.
    encerrada: AtomicBool,
}

type ErroDoHandler = Box<dyn std::error::Error + Send + Sync>;

/// O callback do `windows-capture`: recebe o quadro na thread de captura.
struct Entregador {
    caixa: Arc<Caixa>,
    /// Buffer reaproveitado para tirar o padding das linhas, quando há.
    sobra: Vec<u8>,
}

impl GraphicsCaptureApiHandler for Entregador {
    type Flags = Arc<Caixa>;
    type Error = ErroDoHandler;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            caixa: ctx.flags,
            sobra: Vec::new(),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _controle: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        let largura = frame.width();
        let altura = frame.height();
        let buffer = frame.buffer()?;
        let bgra = buffer.as_nopadding_buffer(&mut self.sobra).to_vec();
        let mut guarda = self.caixa.quadro.lock().unwrap_or_else(|e| e.into_inner());
        *guarda = Some(Quadro {
            largura,
            altura,
            bgra,
        });
        drop(guarda);
        self.caixa.chegou.notify_all();
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.caixa.encerrada.store(true, Ordering::Release);
        self.caixa.chegou.notify_all();
        Ok(())
    }
}

/// Uma sessão WGC aberta. Fechar (drop) para a thread de captura.
pub struct Sessao {
    caixa: Arc<Caixa>,
    controle: Option<CaptureControl<Entregador, ErroDoHandler>>,
}

impl Sessao {
    pub fn abrir(alvo: Alvo) -> Result<Self, Erro> {
        let caixa = Arc::new(Caixa::default());
        let controle = match alvo {
            Alvo::Janela(hwnd) => {
                // O handle pode ter sido reciclado desde a enumeração; a
                // conversão para item de captura falharia com um erro
                // genérico, e "a janela fechou" é a mensagem certa.
                if !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
                    return Err(Erro::FonteSumiu);
                }
                iniciar(Window::from_raw_hwnd(hwnd.0), caixa.clone())?
            }
            Alvo::Monitor(hmonitor) => {
                iniciar(Monitor::from_raw_hmonitor(hmonitor.0), caixa.clone())?
            }
        };
        Ok(Self {
            caixa,
            controle: Some(controle),
        })
    }
}

fn iniciar<T>(item: T, caixa: Arc<Caixa>) -> Result<CaptureControl<Entregador, ErroDoHandler>, Erro>
where
    T: TryInto<GraphicsCaptureItemType> + Send + 'static,
{
    let settings = Settings::new(
        item,
        // O cursor faz parte do que se mostra: apontar para algo na tela é
        // metade do motivo de compartilhá-la.
        CursorCaptureSettings::WithCursor,
        // A razão de este backend existir. Só chegamos aqui quando a
        // propriedade é suportada (ver `sem_borda_disponivel`).
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        caixa,
    );
    Entregador::start_free_threaded(settings).map_err(|e| Erro::Falha(e.to_string()))
}

impl Capturador for Sessao {
    fn proximo_quadro(&mut self, limite: Duration) -> Result<Option<Quadro>, Erro> {
        let fim = Instant::now() + limite;
        let mut guarda = self.caixa.quadro.lock().unwrap_or_else(|e| e.into_inner());
        loop {
            if let Some(quadro) = guarda.take() {
                return Ok(Some(quadro));
            }
            if self.caixa.encerrada.load(Ordering::Acquire) {
                return Err(Erro::FonteSumiu);
            }
            // A thread de captura morreu por erro (o `Closed` não dispara
            // nesse caso): tratar como fonte perdida, e não esperar para
            // sempre por um quadro que não vem.
            if self.controle.as_ref().is_some_and(|c| c.is_finished()) {
                return Err(Erro::FonteSumiu);
            }
            let agora = Instant::now();
            if agora >= fim {
                return Ok(None);
            }
            let (nova, _) = self
                .caixa
                .chegou
                .wait_timeout(guarda, fim - agora)
                .unwrap_or_else(|e| e.into_inner());
            guarda = nova;
        }
    }
}

impl Drop for Sessao {
    fn drop(&mut self) {
        if let Some(controle) = self.controle.take() {
            // Erro ao parar é a thread já morta — não há o que fazer com ele.
            let _ = controle.stop();
        }
    }
}

/// Um quadro só, para a miniatura: abre, espera o primeiro, fecha.
pub fn um_quadro(alvo: Alvo) -> Option<Quadro> {
    let mut sessao = Sessao::abrir(alvo).ok()?;
    sessao.proximo_quadro(ESPERA_DA_MINIATURA).ok().flatten()
}
