//! Windows Graphics Capture sem borda — o backend do Windows 11.
//!
//! O crate `windows-capture` roda a sessão numa thread própria com laço de
//! mensagens, e entrega cada quadro num callback. Aqui o callback só copia o
//! quadro para uma caixa compartilhada e avisa; quem transmite lê da caixa no
//! ritmo dele. A caixa guarda **um** quadro: se o encoder atrasar, o quadro
//! velho é substituído pelo novo, que é o comportamento certo para vídeo ao
//! vivo (atraso acumulado é pior que quadro perdido).
//!
//! **O custo está na leitura, então o limite de fps vem antes dela.** Cada
//! quadro lido é uma cópia GPU→CPU da tela inteira; o WGC entrega um por
//! composição (144 por segundo num monitor de 144 Hz). A sessão pede ao
//! sistema o intervalo mínimo do preset (`MinUpdateInterval`, Windows 11
//! 24H2 em diante) e, onde o sistema não sabe, o `Ritmo` descarta o quadro
//! adiantado no callback **sem** tocar na textura. A textura de staging e o
//! `Vec` do quadro são reaproveitados entre quadros.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Device, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ,
};
use windows::Win32::Graphics::Gdi::{RedrawWindow, RDW_ALLCHILDREN, RDW_INVALIDATE};
use windows::Win32::UI::WindowsAndMessaging::IsWindow;
use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::d3d11::StagingTexture;
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::{GraphicsCaptureApi, InternalCaptureControl};
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    GraphicsCaptureItemType, MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

use super::{copiar_sem_padding, intervalo_do_fps, Alvo, Capturador, Erro, Quadro, Ritmo};

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
    /// Buffer de um quadro que o encoder já consumiu (`Capturador::reciclar`),
    /// para o callback encher no lugar de alocar outro.
    livre: Mutex<Option<Vec<u8>>>,
}

/// O que a sessão passa ao callback ao nascer.
struct Flags {
    caixa: Arc<Caixa>,
    ritmo: Ritmo,
}

type ErroDoHandler = Box<dyn std::error::Error + Send + Sync>;

/// A textura de staging reaproveitada e o dispositivo em que ela foi criada.
struct Staging {
    textura: StagingTexture,
    dispositivo: ID3D11Device,
}

// SAFETY: a textura e o dispositivo só são usados dentro de
// `on_frame_arrived`, sempre na thread de captura do `windows-capture` (o
// handler vive atrás do mutex do crate). O D3D11 é livre de thread por
// contrato; o `Send` só existe porque o handler nasce numa thread e roda em
// outra.
unsafe impl Send for Staging {}

/// O callback do `windows-capture`: recebe o quadro na thread de captura.
struct Entregador {
    caixa: Arc<Caixa>,
    ritmo: Ritmo,
    staging: Option<Staging>,
    /// Buffer pronto para o próximo quadro: o de um quadro que ninguém chegou
    /// a tirar da caixa, ou um devolvido pelo encoder.
    reserva: Vec<u8>,
}

impl GraphicsCaptureApiHandler for Entregador {
    type Flags = Flags;
    type Error = ErroDoHandler;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            caixa: ctx.flags.caixa,
            ritmo: ctx.flags.ritmo,
            staging: None,
            reserva: Vec::new(),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _controle: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        // O marcapasso antes de qualquer toque na textura: quadro adiantado
        // sai daqui de graça. O carimbo é o do sistema (100 ns desde uma
        // origem fixa), o mesmo relógio do `MinUpdateInterval`, e não sofre
        // com o atraso variável até o callback rodar. Sem carimbo, o quadro
        // passa — é o comportamento de antes.
        let agora = frame
            .timestamp()
            .ok()
            .and_then(|t| u64::try_from(t.Duration).ok())
            .map(|ticks| Duration::from_nanos(ticks.saturating_mul(100)));
        if let Some(agora) = agora {
            if !self.ritmo.falta(agora).is_zero() {
                return Ok(());
            }
        }

        let largura = frame.width();
        let altura = frame.height();
        let mut bgra = std::mem::take(&mut self.reserva);
        if bgra.capacity() == 0 {
            if let Some(livre) = self
                .caixa
                .livre
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take()
            {
                bgra = livre;
            }
        }
        if !self.ler(frame, &mut bgra)? {
            self.reserva = bgra;
            return Ok(());
        }
        if let Some(agora) = agora {
            self.ritmo.marcar(agora);
        }

        let mut guarda = self.caixa.quadro.lock().unwrap_or_else(|e| e.into_inner());
        let antigo = guarda.replace(Quadro {
            largura,
            altura,
            bgra,
        });
        drop(guarda);
        self.caixa.chegou.notify_all();
        // Quadro que o encoder não chegou a pegar: o buffer dele é o próximo.
        if let Some(antigo) = antigo {
            self.reserva = antigo.bgra;
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.caixa.encerrada.store(true, Ordering::Release);
        self.caixa.chegou.notify_all();
        Ok(())
    }
}

impl Entregador {
    /// Copia a textura do quadro para `bgra`: o mesmo que o `Frame::buffer`
    /// do crate faz, mas com a textura de staging reaproveitada — o crate
    /// cria uma nova (~15 MB de memória de driver em 1440p) a cada quadro.
    /// `false` quando o mapeamento veio menor que o quadro e ele foi
    /// descartado.
    fn ler(&mut self, frame: &Frame, bgra: &mut Vec<u8>) -> Result<bool, ErroDoHandler> {
        let desc = *frame.desc();
        let serve = self.staging.as_ref().is_some_and(|s| {
            let d = s.textura.desc();
            d.Width == desc.Width
                && d.Height == desc.Height
                && d.Format == desc.Format
                && s.dispositivo == *frame.device()
        });
        if !serve {
            // A janela mudou de tamanho (o crate recria o pool, e o quadro
            // vem com a textura nova) ou é o primeiro quadro. Soltar a velha
            // antes de criar a nova evita ter as duas ao mesmo tempo.
            self.staging = None;
            self.staging = Some(Staging {
                textura: StagingTexture::new(frame.device(), desc.Width, desc.Height, desc.Format)?,
                dispositivo: frame.device().clone(),
            });
        }
        let Some(staging) = self.staging.as_mut() else {
            return Ok(false);
        };
        let contexto = frame.device_context();
        let textura = staging.textura.texture();
        // O mapeamento do crate (`MappedStagingTexture`) não é público, então
        // o `Map`/`Unmap` é feito aqui. A staging nunca fica mapeada fora
        // deste método: a cópia do quadro seguinte exige isso.
        let mut mapeado = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            contexto.CopyResource(textura, frame.as_raw_texture());
            contexto.Map(textura, 0, D3D11_MAP_READ, 0, Some(&mut mapeado))?;
        }
        let (largura, altura, passo) =
            (desc.Width as usize, desc.Height as usize, mapeado.RowPitch);
        let copiou = if mapeado.pData.is_null() || altura == 0 || (passo as usize) < largura * 4 {
            false
        } else {
            // SAFETY: o `Map` de uma textura `largura`×`altura` entrega
            // `altura` linhas de `passo` bytes; a última linha tem ao menos os
            // `largura * 4` bytes de pixel. O slice não passa disso e morre
            // antes do `Unmap`.
            let origem = unsafe {
                std::slice::from_raw_parts(
                    mapeado.pData.cast::<u8>(),
                    (altura - 1) * passo as usize + largura * 4,
                )
            };
            copiar_sem_padding(origem, desc.Width, desc.Height, passo, bgra)
        };
        unsafe {
            contexto.Unmap(textura, 0);
        }
        Ok(copiou)
    }
}

/// Uma sessão WGC aberta. Fechar (drop) para a thread de captura.
pub struct Sessao {
    caixa: Arc<Caixa>,
    controle: Option<CaptureControl<Entregador, ErroDoHandler>>,
}

impl Sessao {
    /// `fps` limita a entrega (transmissão); `None` entrega tudo (miniatura).
    pub fn abrir(alvo: Alvo, fps: Option<u32>) -> Result<Self, Erro> {
        let caixa = Arc::new(Caixa::default());
        let controle = match alvo {
            Alvo::Janela(hwnd) => {
                // O handle pode ter sido reciclado desde a enumeração; a
                // conversão para item de captura falharia com um erro
                // genérico, e "a janela fechou" é a mensagem certa.
                if !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
                    return Err(Erro::FonteSumiu);
                }
                let controle = iniciar(Window::from_raw_hwnd(hwnd.0), caixa.clone(), fps)?;
                cutucar(hwnd);
                controle
            }
            Alvo::Monitor(hmonitor) => {
                iniciar(Monitor::from_raw_hmonitor(hmonitor.0), caixa.clone(), fps)?
            }
        };
        Ok(Self {
            caixa,
            controle: Some(controle),
        })
    }
}

fn iniciar<T>(
    item: T,
    caixa: Arc<Caixa>,
    fps: Option<u32>,
) -> Result<CaptureControl<Entregador, ErroDoHandler>, Erro>
where
    T: TryInto<GraphicsCaptureItemType> + Send + 'static,
{
    let ritmo = fps.map_or_else(Ritmo::livre, Ritmo::descartando);
    let settings = Settings::new(
        item,
        // O cursor faz parte do que se mostra: apontar para algo na tela é
        // metade do motivo de compartilhá-la.
        CursorCaptureSettings::WithCursor,
        // A razão de este backend existir. Só chegamos aqui quando a
        // propriedade é suportada (ver `sem_borda_disponivel`).
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        intervalo_minimo(fps),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        Flags { caixa, ritmo },
    );
    Entregador::start_free_threaded(settings).map_err(|e| Erro::Falha(e.to_string()))
}

/// O intervalo mínimo que a sessão pede ao sistema.
///
/// **Só quando o sistema sabe.** A propriedade `MinUpdateInterval` é mais
/// nova que a `IsBorderRequired` (Windows 11 24H2 contra 21H2): pedir onde
/// ela não existe faz o `windows-capture` recusar a sessão inteira, e aí
/// fica o `Default` com o `Ritmo` fazendo o trabalho no callback.
///
/// 15/16 do intervalo, um pouco abaixo do limiar do `Ritmo` (7/8): assim o
/// sistema nunca entrega um quadro que o `Ritmo` descartaria — o descartado
/// seria justamente o último de uma rajada (fim de uma rolagem), e a
/// transmissão ficaria parada no penúltimo até a fonte repintar.
fn intervalo_minimo(fps: Option<u32>) -> MinimumUpdateIntervalSettings {
    match fps {
        Some(fps)
            if GraphicsCaptureApi::is_minimum_update_interval_supported().unwrap_or(false) =>
        {
            MinimumUpdateIntervalSettings::Custom(intervalo_do_fps(fps).mul_f64(15.0 / 16.0))
        }
        _ => MinimumUpdateIntervalSettings::Default,
    }
}

/// Pede à janela que se redesenhe, logo depois de abrir a captura.
///
/// **É a diferença entre "janela" e "tela inteira" no tempo até o primeiro
/// quadro.** O WGC de monitor entrega quadro a cada composição do desktop, que
/// nunca para; o de janela só entrega quando *aquela* janela repinta. Uma
/// janela parada — um editor sem foco, um leitor de PDF, um jogo pausado —
/// pode ficar segundos sem repintar, e nesse intervalo a faixa já está
/// publicada mas sem imagem: é o "Carregando a transmissão…" que não sai.
/// Marcar a janela como suja põe um `WM_PAINT` na fila dela e o quadro chega
/// na composição seguinte.
///
/// Sem `RDW_UPDATENOW` de propósito: essa bandeira manda a mensagem em
/// sincronia, e uma janela travada prenderia a nossa thread junto. Assim o
/// pedido é só enfileirado; se a outra aplicação estiver ocupada, o quadro
/// atrasa em vez de nos travar. Falhar aqui não é erro — no pior caso é o
/// comportamento de antes.
fn cutucar(hwnd: HWND) {
    unsafe {
        let _ = RedrawWindow(Some(hwnd), None, None, RDW_INVALIDATE | RDW_ALLCHILDREN);
    }
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

    fn reciclar(&mut self, quadro: Quadro) {
        *self.caixa.livre.lock().unwrap_or_else(|e| e.into_inner()) = Some(quadro.bgra);
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
    let mut sessao = Sessao::abrir(alvo, None).ok()?;
    sessao.proximo_quadro(ESPERA_DA_MINIATURA).ok().flatten()
}
