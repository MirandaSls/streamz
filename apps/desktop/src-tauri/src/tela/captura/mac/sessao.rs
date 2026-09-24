//! Uma sessão `SCStream`: o filtro, a configuração, a fila de despacho e o
//! objeto Objective-C que recebe os quadros e os empurra na `Caixa`.
//!
//! O ScreenCaptureKit **empurra** quadro, como o WGC: cada um chega num
//! callback, numa fila de despacho nossa, e quem transmite puxa da `Caixa` no
//! ritmo dele. O limite de fps não precisa de `Ritmo` aqui — o
//! `minimumFrameInterval` da configuração é respeitado pelo próprio sistema,
//! antes de o quadro existir, que é exatamente onde o custo está.
//!
//! Tudo o que roda dentro de um callback (o método do delegate, o bloco de um
//! completion handler) está atrás de `catch_unwind` e não usa `unwrap`: um
//! pânico ali atravessaria o runtime do Objective-C, e o que se ganha
//! derrubando o processo por um quadro ruim é nada.

use std::panic::{self, AssertUnwindSafe};
use std::sync::mpsc::sync_channel;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use block2::RcBlock;
use dispatch2::{DispatchQueue, DispatchQueueAttr, DispatchRetained};
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, AnyThread, DefinedClass};
use objc2_core_foundation::{CFDictionary, CFNumber, CFType};
use objc2_core_media::{CMSampleBuffer, CMTime};
use objc2_core_video::{
    kCVPixelFormatType_32BGRA, kCVReturnSuccess, CVPixelBufferGetBaseAddress,
    CVPixelBufferGetBytesPerRow, CVPixelBufferGetHeight, CVPixelBufferGetPixelFormatType,
    CVPixelBufferGetWidth, CVPixelBufferLockBaseAddress, CVPixelBufferLockFlags,
    CVPixelBufferUnlockBaseAddress,
};
use objc2_foundation::{NSArray, NSError, NSObject, NSObjectProtocol, NSString};
use objc2_screen_capture_kit::{
    SCContentFilter, SCFrameStatus, SCRunningApplication, SCScreenshotManager, SCShareableContent,
    SCStream, SCStreamConfiguration, SCStreamDelegate, SCStreamFrameInfoStatus, SCStreamOutput,
    SCStreamOutputType, SCWindow,
};

use super::super::caixa::Caixa;
use super::super::{copiar_sem_padding, Alvo, Capturador, Erro, Quadro};
use crate::tela::sck::{self, Enviavel};

/// Quanto esperar o `SCShareableContent` ao abrir a captura. Mais folgado que
/// o da grade: aqui o usuário já clicou e espera a transmissão, e desistir
/// cedo é pior que esperar um `replayd` lento.
const LIMITE_DO_CONTEUDO: Duration = Duration::from_secs(3);

/// Quanto esperar o `startCapture` responder. Na primeira captura depois do
/// login o `replayd` pode levar um segundo acordando; mais que isso é ele
/// travado, e a transmissão recusa com uma frase em vez de girar para sempre.
const LIMITE_DO_INICIO: Duration = Duration::from_secs(5);

/// Quanto o `Drop` espera o `stopCapture`. Curto: fechar uma sessão acontece
/// na thread da transmissão (ou da varredura de miniaturas), e ela não pode
/// ficar presa num sistema que não responde.
const LIMITE_DA_PARADA: Duration = Duration::from_secs(1);

/// Quanto uma miniatura espera: o primeiro quadro de uma sessão curta
/// (macOS 13) ou a foto do `SCScreenshotManager` (14+). Janela que não
/// repinta nesse prazo fica com o ícone do app.
const ESPERA_DA_MINIATURA: Duration = Duration::from_millis(500);

/// De quanto em quanto tempo a transmissão confere se a fonte ainda existe. O
/// `SCStream` de uma janela fechada nem sempre chama `didStopWithError` — às
/// vezes só para de entregar, e a transmissão repetiria o último quadro para
/// sempre. Uma vez por segundo basta, e poupa o `CGWindowList` a 60 fps.
const INTERVALO_DA_CHECAGEM: Duration = Duration::from_secs(1);

/// Rótulo da fila de despacho, que aparece no Instruments e em crash logs.
const ROTULO_DA_FILA: &str = "streamz.tela.captura";

/// Em que resolução pedir os quadros ao sistema.
#[derive(Debug, Clone, Copy)]
pub(super) enum Resolucao {
    /// A da fonte, em pixels (pontos × escala do display): a transmissão.
    Nativa,
    /// Cabendo neste retângulo, sem ampliar: a miniatura. O sistema reduz na
    /// GPU antes de o quadro chegar até nós, em vez de copiarmos a tela
    /// inteira para jogar quase tudo fora.
    Caber { largura: u32, altura: u32 },
}

impl Resolucao {
    /// Largura e altura em pixels para a configuração. `None` para uma fonte
    /// sem área (janela de 0 pontos, display com modo esquisito).
    fn medidas(self, largura: f64, altura: f64) -> Option<(usize, usize)> {
        if !(largura.is_finite() && altura.is_finite() && largura >= 1.0 && altura >= 1.0) {
            return None;
        }
        let fator = match self {
            Resolucao::Nativa => 1.0,
            Resolucao::Caber {
                largura: max_l,
                altura: max_a,
            } => (f64::from(max_l) / largura)
                .min(f64::from(max_a) / altura)
                .min(1.0),
        };
        // O `as usize` de float satura; o `max(1.0)` garante que a redução
        // de uma janela muito estreita não vire zero.
        Some((
            (largura * fator).round().max(1.0) as usize,
            (altura * fator).round().max(1.0) as usize,
        ))
    }
}

/// O que o objeto Objective-C guarda: a caixa onde entrega e o buffer do
/// próximo quadro.
struct Estado {
    caixa: Arc<Caixa>,
    /// Buffer pronto para o próximo quadro: o de um quadro que ninguém chegou
    /// a tirar da caixa. Mutex e não `Cell` porque os ivars precisam ser
    /// `Sync`; a fila é serial, então ele nunca é disputado de verdade.
    reserva: Mutex<Vec<u8>>,
}

define_class!(
    // SAFETY:
    // - NSObject não tem exigências para subclasses.
    // - `StreamzSaidaDeVideo` não implementa `Drop`.
    // - As assinaturas abaixo são as dos protocolos em
    //   `objc2-screen-capture-kit` (`SCStreamOutput`, `SCStreamDelegate`).
    #[unsafe(super(NSObject))]
    #[ivars = Estado]
    struct StreamzSaidaDeVideo;

    unsafe impl NSObjectProtocol for StreamzSaidaDeVideo {}

    unsafe impl SCStreamOutput for StreamzSaidaDeVideo {
        #[unsafe(method(stream:didOutputSampleBuffer:ofType:))]
        fn chegou_amostra(
            &self,
            _stream: &SCStream,
            amostra: &CMSampleBuffer,
            tipo: SCStreamOutputType,
        ) {
            let _ = panic::catch_unwind(AssertUnwindSafe(|| self.receber(amostra, tipo)));
        }
    }

    unsafe impl SCStreamDelegate for StreamzSaidaDeVideo {
        // O sistema parou o stream por conta própria: a janela fechou, o
        // display sumiu, a permissão foi revogada ou o usuário clicou em
        // "Parar" no indicador de gravação da barra de menus. Nada disso tem
        // volta dentro desta sessão.
        #[unsafe(method(stream:didStopWithError:))]
        fn parou_com_erro(&self, _stream: &SCStream, _erro: &NSError) {
            let _ = panic::catch_unwind(AssertUnwindSafe(|| self.ivars().caixa.encerrar()));
        }
    }
);

impl StreamzSaidaDeVideo {
    fn new(caixa: Arc<Caixa>) -> Retained<Self> {
        let this = Self::alloc().set_ivars(Estado {
            caixa,
            reserva: Mutex::new(Vec::new()),
        });
        // SAFETY: o `init` do NSObject, depois dos ivars inicializados.
        unsafe { msg_send![super(this), init] }
    }

    /// O corpo do callback de quadro, na fila serial da sessão.
    fn receber(&self, amostra: &CMSampleBuffer, tipo: SCStreamOutputType) {
        if tipo != SCStreamOutputType::Screen {
            return;
        }
        let estado = self.ivars();
        let mut reserva = estado.reserva.lock().unwrap_or_else(|e| e.into_inner());
        let mut bgra = std::mem::take(&mut *reserva);
        if bgra.capacity() == 0 {
            if let Some(livre) = estado.caixa.tomar_livre() {
                bgra = livre;
            }
        }
        match ler_amostra(amostra, &mut bgra) {
            Some((largura, altura)) => {
                let antigo = estado.caixa.entregar(Quadro {
                    largura,
                    altura,
                    bgra,
                });
                // Quadro que o encoder não chegou a pegar: o buffer dele é o
                // próximo.
                if let Some(antigo) = antigo {
                    *reserva = antigo.bgra;
                }
            }
            None => *reserva = bgra,
        }
    }
}

/// O `SCFrameStatus` do quadro, lido do dicionário de anexos da amostra.
/// `None` quando o anexo não está lá ou não tem a forma esperada.
fn status_do_quadro(amostra: &CMSampleBuffer) -> Option<isize> {
    // SAFETY: getter de um CMSampleBuffer válido; `false` = não criar o array.
    let anexos = unsafe { amostra.sample_attachments_array(false) }?;
    if anexos.count() < 1 {
        return None;
    }
    // SAFETY: índice 0 < count. O elemento é um objeto CF que vive enquanto o
    // array (retido acima) vive, e o tipo é conferido pelo `downcast_ref`.
    let primeiro = unsafe { anexos.value_at_index(0).cast::<CFType>().as_ref() }?;
    let dicionario = primeiro.downcast_ref::<CFDictionary>()?;
    // SAFETY: constante exportada pelo framework; NSString é toll-free
    // bridged com CFString, que é o tipo das chaves desse dicionário.
    let chave: *const NSString = unsafe { SCStreamFrameInfoStatus };
    // SAFETY: a chave é um ponteiro válido; o valor, se houver, vive enquanto
    // o dicionário vive, e o tipo é conferido pelo `downcast_ref`.
    let valor = unsafe { dicionario.value(chave.cast()).cast::<CFType>().as_ref() }?;
    valor.downcast_ref::<CFNumber>()?.as_isize()
}

/// Copia a imagem BGRA da amostra para `bgra`, sem o padding das linhas, e
/// devolve largura e altura. `None` quando não há o que copiar — quadro
/// ocioso ou em branco, formato inesperado, buffer que não travou.
///
/// Quadro `Idle` é o sistema dizendo "nada mudou": não tem imagem, e
/// entregá-lo apagaria a transmissão. Sem o anexo de status (a amostra de uma
/// foto do `SCScreenshotManager` pode não trazê-lo), vale ter imagem.
fn ler_amostra(amostra: &CMSampleBuffer, bgra: &mut Vec<u8>) -> Option<(u32, u32)> {
    if let Some(status) = status_do_quadro(amostra) {
        if status != SCFrameStatus::Complete.0 {
            return None;
        }
    }
    // SAFETY: getter de um CMSampleBuffer válido; o retorno é retido.
    let imagem = unsafe { amostra.image_buffer() }?;
    if CVPixelBufferGetPixelFormatType(&imagem) != kCVPixelFormatType_32BGRA {
        return None;
    }
    // SAFETY: trava só leitura; destravada abaixo em todos os caminhos.
    let travou = unsafe { CVPixelBufferLockBaseAddress(&imagem, CVPixelBufferLockFlags::ReadOnly) };
    if travou != kCVReturnSuccess {
        return None;
    }
    let largura = CVPixelBufferGetWidth(&imagem);
    let altura = CVPixelBufferGetHeight(&imagem);
    let passo = CVPixelBufferGetBytesPerRow(&imagem);
    let base = CVPixelBufferGetBaseAddress(&imagem);
    let medidas = (
        u32::try_from(largura).ok(),
        u32::try_from(altura).ok(),
        u32::try_from(passo).ok(),
    );
    let copiou = match medidas {
        (Some(l), Some(a), Some(p))
            if !base.is_null() && l > 0 && a > 0 && passo >= largura.saturating_mul(4) =>
        {
            // SAFETY: com o buffer travado, `base` aponta para `altura`
            // linhas de `passo` bytes; a última tem ao menos os `largura * 4`
            // bytes de pixel. O slice não passa disso e morre antes do unlock.
            let origem = unsafe {
                std::slice::from_raw_parts(
                    base.cast::<u8>().cast_const(),
                    (altura - 1) * passo + largura * 4,
                )
            };
            copiar_sem_padding(origem, l, a, p, bgra).then_some((l, a))
        }
        _ => None,
    };
    // SAFETY: par do lock acima, com as mesmas flags.
    unsafe {
        CVPixelBufferUnlockBaseAddress(&imagem, CVPixelBufferLockFlags::ReadOnly);
    }
    copiou
}

/// O `u64` opaco do `Alvo` volta a ser `CGWindowID`/`CGDirectDisplayID`.
/// Fora de `u32` não é um id que o `fontes` do macOS tenha posto ali.
fn id_do_alvo(bruto: u64) -> Result<u32, Erro> {
    u32::try_from(bruto).map_err(|_| Erro::FonteSumiu)
}

/// Filtro e configuração para capturar `alvo` — os mesmos para o stream e
/// para a foto do `SCScreenshotManager`.
fn preparar(
    conteudo: &SCShareableContent,
    alvo: Alvo,
    fps: Option<u32>,
    resolucao: Resolucao,
) -> Result<(Retained<SCContentFilter>, Retained<SCStreamConfiguration>), Erro> {
    let (filtro, largura_px, altura_px) = match alvo {
        Alvo::Janela(bruto) => {
            let id = id_do_alvo(bruto)?;
            let janela = sck::achar_janela(conteudo, id).ok_or(Erro::FonteSumiu)?;
            // SAFETY: getter sem efeito colateral de um SCWindow válido.
            let frame = unsafe { janela.frame() };
            // O `frame` é em pontos; a escala que vale é a do display onde a
            // janela está, senão numa tela Retina sairia meia resolução.
            let escala = sck::escala_do_display(sck::display_da_janela(frame));
            // SAFETY: init de um objeto recém-alocado com um SCWindow válido.
            // "Independente do desktop" é a janela isolada, mesmo coberta.
            let filtro = unsafe {
                SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), &janela)
            };
            (
                filtro,
                frame.size.width * escala,
                frame.size.height * escala,
            )
        }
        Alvo::Monitor(bruto) => {
            let id = id_do_alvo(bruto)?;
            let display = sck::achar_display(conteudo, id).ok_or(Erro::FonteSumiu)?;
            // SAFETY: getters sem efeito colateral de um SCDisplay válido.
            let (largura_pt, altura_pt) = unsafe { (display.width(), display.height()) };
            let escala = sck::escala_do_display(id);
            // O próprio Streamz fica de fora: sem isso a janela com a prévia
            // da transmissão aparece dentro da transmissão, em espelho
            // infinito. Não achar o nosso app (não deveria acontecer) só
            // deixa de excluí-lo.
            let excluidos: Vec<Retained<SCRunningApplication>> =
                sck::meu_app(conteudo).into_iter().collect();
            let apps = NSArray::from_retained_slice(&excluidos);
            let nenhuma = NSArray::<SCWindow>::from_slice(&[]);
            // SAFETY: init de um objeto recém-alocado com argumentos válidos.
            let filtro = unsafe {
                SCContentFilter::initWithDisplay_excludingApplications_exceptingWindows(
                    SCContentFilter::alloc(),
                    &display,
                    &apps,
                    &nenhuma,
                )
            };
            (
                filtro,
                largura_pt as f64 * escala,
                altura_pt as f64 * escala,
            )
        }
    };
    let (largura, altura) = resolucao
        .medidas(largura_px, altura_px)
        .ok_or_else(|| Erro::Falha("a fonte escolhida não tem área para capturar".into()))?;

    // SAFETY: construtor e setters de um SCStreamConfiguration recém-criado,
    // ainda não compartilhado com o sistema.
    let config = unsafe { SCStreamConfiguration::new() };
    unsafe {
        config.setWidth(largura);
        config.setHeight(altura);
        // O mesmo BGRA que o Windows entrega e o `Quadro` promete: a
        // conversão para o YUV do encoder lê exatamente esta ordem.
        config.setPixelFormat(kCVPixelFormatType_32BGRA);
        // Janela que cresce depois de a sessão abrir é reduzida para caber,
        // em vez de cortada no canto; e a miniatura de uma janela precisa
        // disso para caber no tamanho pequeno que pedimos.
        config.setScalesToFit(true);
        // O cursor faz parte do que se mostra: apontar para algo na tela é
        // metade do motivo de compartilhá-la.
        config.setShowsCursor(true);
        // Poucos quadros em voo: a caixa só guarda um, e buffer a mais no
        // pool do sistema é memória de vídeo parada.
        config.setQueueDepth(5);
        if let Some(fps) = fps {
            let fps = fps.clamp(1, 240) as i32;
            config.setMinimumFrameInterval(CMTime::new(1, fps));
        }
    }
    if objc2::available!(macos = 14.0) {
        // Sem isto, no 14+ a janela redimensionada seria esticada para o
        // tamanho do quadro; com isto, sobra tarja. No 13 a propriedade não
        // existe e o comportamento é o do sistema.
        // SAFETY: setter de uma configuração válida, só no 14+.
        unsafe { config.setPreservesAspectRatio(true) };
    }
    Ok((filtro, config))
}

/// A frase de quando o `SCShareableContent` não veio: sem permissão é a causa
/// que o usuário pode resolver, e merece ser dita pelo nome.
fn sem_conteudo() -> Erro {
    if sck::tem_permissao() {
        Erro::Falha("o macOS não respondeu com as janelas e telas disponíveis".into())
    } else {
        Erro::Falha(
            "o Streamz não tem permissão de Gravação de Tela (Ajustes do Sistema › \
             Privacidade e Segurança)"
                .into(),
        )
    }
}

/// Uma sessão `SCStream` aberta. Fechar (drop) para o stream.
pub(super) struct Sessao {
    caixa: Arc<Caixa>,
    stream: Enviavel<Retained<SCStream>>,
    /// `Option` para o `Drop` poder decidir se solta ou vaza (ver lá).
    saida: Enviavel<Option<Retained<StreamzSaidaDeVideo>>>,
    /// A fila dos callbacks. Guardada para viver tanto quanto o stream.
    _fila: DispatchRetained<DispatchQueue>,
    alvo: Alvo,
    checada: Instant,
}

impl Sessao {
    /// Abre a captura de `alvo`. `fps` limita a entrega (transmissão); `None`
    /// entrega no ritmo do sistema (miniatura).
    pub(super) fn abrir(alvo: Alvo, fps: Option<u32>, resolucao: Resolucao) -> Result<Self, Erro> {
        if !sck::sistema_atende() {
            return Err(Erro::Falha(
                "a captura de tela nativa precisa do macOS 13 ou mais novo".into(),
            ));
        }
        // Sem permissão, pedir o conteúdo abriria o diálogo do sistema no
        // meio de uma transmissão; quem pede a permissão é o seletor.
        if !sck::tem_permissao() {
            return Err(sem_conteudo());
        }
        autoreleasepool(|_| {
            let conteudo = sck::conteudo_completo(LIMITE_DO_CONTEUDO).ok_or_else(sem_conteudo)?;
            Self::abrir_em(&conteudo, alvo, fps, resolucao)
        })
    }

    /// Como `abrir`, com o `SCShareableContent` já em mãos — a varredura de
    /// miniaturas pede um só para todas as fontes.
    fn abrir_em(
        conteudo: &SCShareableContent,
        alvo: Alvo,
        fps: Option<u32>,
        resolucao: Resolucao,
    ) -> Result<Self, Erro> {
        let (filtro, config) = preparar(conteudo, alvo, fps, resolucao)?;
        let caixa = Arc::new(Caixa::default());
        let saida = StreamzSaidaDeVideo::new(caixa.clone());

        // SAFETY: init de um objeto recém-alocado com filtro e configuração
        // válidos. O delegate é referência fraca no SCStream; quem o mantém
        // vivo é a `Sessao`, que guarda `saida`.
        let stream = unsafe {
            SCStream::initWithFilter_configuration_delegate(
                SCStream::alloc(),
                &filtro,
                &config,
                Some(ProtocolObject::<dyn SCStreamDelegate>::from_ref(&*saida)),
            )
        };
        // Serial: os quadros chegam em ordem e o callback nunca roda em
        // paralelo consigo mesmo.
        let fila = DispatchQueue::new(ROTULO_DA_FILA, DispatchQueueAttr::SERIAL);
        // SAFETY: stream válido; a saída implementa o protocolo e vive tanto
        // quanto a sessão; a fila é nossa e serial.
        unsafe {
            stream.addStreamOutput_type_sampleHandlerQueue_error(
                ProtocolObject::<dyn SCStreamOutput>::from_ref(&*saida),
                SCStreamOutputType::Screen,
                Some(&*fila),
            )
        }
        .map_err(|e| {
            Erro::Falha(format!(
                "o macOS recusou a saída de vídeo da captura: {}",
                e.localizedDescription()
            ))
        })?;

        let sessao = Self {
            caixa,
            stream: Enviavel(stream),
            saida: Enviavel(Some(saida)),
            _fila: fila,
            alvo,
            checada: Instant::now(),
        };
        // Se o início falhar, o `Drop` da sessão já montada faz a limpeza.
        iniciar(&sessao.stream.0)?;
        Ok(sessao)
    }

    /// A fonte ainda existe? Ver `INTERVALO_DA_CHECAGEM`.
    fn fonte_existe(&self) -> bool {
        match self.alvo {
            Alvo::Janela(bruto) => id_do_alvo(bruto).is_ok_and(sck::janela_existe),
            Alvo::Monitor(bruto) => id_do_alvo(bruto).is_ok_and(sck::display_ativo),
        }
    }
}

/// Liga o stream e espera o sistema confirmar, com prazo.
fn iniciar(stream: &SCStream) -> Result<(), Erro> {
    // Capacidade 1 e `try_send`: o handler roda uma vez, numa fila do
    // sistema, e não pode bloquear nem entrar em pânico — se o prazo já
    // venceu e o receptor morreu, o envio falha calado.
    let (tx, rx) = sync_channel::<Option<String>>(1);
    let bloco = RcBlock::new(move |erro: *mut NSError| {
        let _ = panic::catch_unwind(AssertUnwindSafe(|| {
            // SAFETY: `erro` é nulo ou um NSError válido durante o handler.
            let mensagem = unsafe { erro.as_ref() }.map(|e| e.localizedDescription().to_string());
            let _ = tx.try_send(mensagem);
        }));
    });
    // SAFETY: stream válido; o bloco é copiado pelo framework e a assinatura
    // do fechamento bate com a do completion handler.
    unsafe { stream.startCaptureWithCompletionHandler(Some(&*bloco)) };
    match rx.recv_timeout(LIMITE_DO_INICIO) {
        Ok(None) => Ok(()),
        Ok(Some(mensagem)) => Err(Erro::Falha(format!(
            "o macOS recusou iniciar a captura: {mensagem}"
        ))),
        Err(_) => Err(Erro::Falha(
            "o macOS não respondeu ao iniciar a captura de tela".into(),
        )),
    }
}

/// Para o stream e espera a confirmação até `LIMITE_DA_PARADA`. `true` se o
/// sistema respondeu (com ou sem erro — erro aqui é "já estava parado").
fn parar(stream: &SCStream) -> bool {
    let (tx, rx) = sync_channel::<()>(1);
    let bloco = RcBlock::new(move |_erro: *mut NSError| {
        let _ = tx.try_send(());
    });
    // SAFETY: idem `iniciar`.
    unsafe { stream.stopCaptureWithCompletionHandler(Some(&*bloco)) };
    rx.recv_timeout(LIMITE_DA_PARADA).is_ok()
}

impl Capturador for Sessao {
    fn proximo_quadro(&mut self, limite: Duration) -> Result<Option<Quadro>, Erro> {
        if self.checada.elapsed() >= INTERVALO_DA_CHECAGEM {
            self.checada = Instant::now();
            if !self.fonte_existe() {
                return Err(Erro::FonteSumiu);
            }
        }
        // A morte do stream chega pela própria caixa (`encerrar`, no
        // `didStopWithError`); não há thread nossa para vigiar.
        self.caixa.proximo(limite, &|| true)
    }

    fn reciclar(&mut self, quadro: Quadro) {
        self.caixa.devolver_livre(quadro.bgra);
    }
}

impl Drop for Sessao {
    fn drop(&mut self) {
        autoreleasepool(|_| {
            let parou = parar(&self.stream.0);
            if let Some(saida) = self.saida.0.take() {
                // SAFETY: stream e saída válidos; erro aqui é a saída já
                // removida, e não há o que fazer com ele.
                let _ = unsafe {
                    self.stream.0.removeStreamOutput_type_error(
                        ProtocolObject::<dyn SCStreamOutput>::from_ref(&*saida),
                        SCStreamOutputType::Screen,
                    )
                };
                // Se o sistema não confirmou a parada, um callback ainda pode
                // estar a caminho na fila — e o SCStream não documenta se
                // retém a saída. Vazar um objeto pequeno nesse caso raro é
                // melhor que arriscar um callback num objeto já solto.
                if !parou {
                    std::mem::forget(saida);
                }
            }
        });
    }
}

/// Miniatura no macOS 13: abre uma sessão curta, espera o primeiro quadro e
/// fecha.
pub(super) fn um_quadro(
    conteudo: &SCShareableContent,
    alvo: Alvo,
    resolucao: Resolucao,
) -> Option<Quadro> {
    let mut sessao = Sessao::abrir_em(conteudo, alvo, None, resolucao).ok()?;
    sessao.proximo_quadro(ESPERA_DA_MINIATURA).ok().flatten()
}

/// Miniatura no macOS 14+: uma foto só pelo `SCScreenshotManager`, sem
/// montar stream. Pede a amostra (e não o `CGImage`) porque ela chega no
/// mesmo BGRA do stream e passa pela mesma cópia — sem contexto de bitmap
/// nem conversão de espaço de cor. `None` abaixo do 14.
pub(super) fn fotografar(
    conteudo: &SCShareableContent,
    alvo: Alvo,
    resolucao: Resolucao,
) -> Option<Quadro> {
    if !objc2::available!(macos = 14.0) {
        return None;
    }
    let (filtro, config) = preparar(conteudo, alvo, None, resolucao).ok()?;
    // Ver `iniciar` sobre a capacidade 1 e o `try_send`. A cópia do quadro
    // acontece dentro do handler: a amostra é do sistema e só vale ali.
    let (tx, rx) = sync_channel::<Option<Quadro>>(1);
    let bloco = RcBlock::new(move |amostra: *mut CMSampleBuffer, _erro: *mut NSError| {
        let quadro = panic::catch_unwind(AssertUnwindSafe(|| {
            // SAFETY: `amostra` é nula ou um CMSampleBuffer válido durante o
            // handler.
            let amostra = unsafe { amostra.as_ref() }?;
            let mut bgra = Vec::new();
            let (largura, altura) = ler_amostra(amostra, &mut bgra)?;
            Some(Quadro {
                largura,
                altura,
                bgra,
            })
        }))
        .ok()
        .flatten();
        let _ = tx.try_send(quadro);
    });
    // SAFETY: método de classe do 14+ (conferido acima); filtro e
    // configuração válidos; o bloco é copiado pelo framework.
    unsafe {
        SCScreenshotManager::captureSampleBufferWithFilter_configuration_completionHandler(
            &filtro,
            &config,
            Some(&*bloco),
        );
    }
    rx.recv_timeout(ESPERA_DA_MINIATURA).ok().flatten()
}
