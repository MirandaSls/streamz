//! Áudio do sistema pelo ScreenCaptureKit — a metade macOS do `audio`.
//!
//! O macOS não tem loopback de saída como o WASAPI: o som do sistema só chega
//! a um app por um `SCStream` com `capturesAudio`. O stream exige um filtro de
//! conteúdo e uma configuração de vídeo mesmo quando só o áudio interessa, então
//! o vídeo daqui é de 2×2 pixels e nenhuma saída de tela é registrada — o
//! framework descarta esses quadros sem nem chegar a nós.
//!
//! Ao contrário do WASAPI, o ScreenCaptureKit **empurra**: o som chega num
//! callback, numa fila do dispatch, no ritmo dele. A transmissão, por outro
//! lado, **puxa** (`ler` num laço, com sono quando não há nada). O que faz a
//! ponte é um buffer compartilhado com teto de ~1 s: o callback converte para
//! i16 estéreo a 48 kHz e acrescenta; `ler` esvazia.
//!
//! Troca de fone não invalida nada aqui — o ScreenCaptureKit segue o
//! dispositivo de saída sozinho. O que derruba o stream é o sistema (display
//! desligado, `replayd` reiniciado, permissão revogada), e isso chega em
//! `stream:didStopWithError:`: quem lê recebe `DispositivoInvalidado` e
//! reabre, ou `Falha` quando foi a permissão, que reabrir não resolve.

use std::collections::VecDeque;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::ptr::NonNull;
use std::sync::mpsc::sync_channel;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use block2::RcBlock;
use dispatch2::{DispatchQueue, DispatchQueueAttr, DispatchRetained};
use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, DefinedClass};
use objc2_core_audio_types::{
    kAudioFormatFlagIsFloat, kAudioFormatFlagIsNonInterleaved, kAudioFormatLinearPCM, AudioBuffer,
    AudioBufferList,
};
use objc2_core_foundation::CFRetained;
use objc2_core_media::{
    kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
    CMAudioFormatDescriptionGetStreamBasicDescription, CMBlockBuffer, CMSampleBuffer, CMTime,
};
use objc2_foundation::{NSArray, NSError};
use objc2_screen_capture_kit::{
    SCContentFilter, SCRunningApplication, SCStream, SCStreamConfiguration, SCStreamDelegate,
    SCStreamErrorCode, SCStreamOutput, SCStreamOutputType, SCWindow,
};

use super::mistura::{converter_para_estereo, planar_f32_para_estereo, Amostra, Reamostrador};
use super::{ErroDeAudio, CANAIS, TAXA};
use crate::tela::sck;

/// Teto do buffer entre o callback e `ler`: ~1 s de i16 estéreo a 48 kHz. Se
/// a transmissão empacar (rede, encoder), o som velho é que sai — mandar um
/// segundo de atraso acumulado seria pior do que perder um pedaço.
const TETO_DE_AMOSTRAS: usize = TAXA as usize * CANAIS as usize;

/// Quantos buffers cabem na `AudioBufferList` que passamos ao Core Media. O
/// ScreenCaptureKit entrega um por canal (planar) e pedimos dois canais; a
/// folga é para um formato que o sistema decida mandar diferente.
const MAX_BUFFERS: usize = 8;

/// Prazo para pedir o conteúdo compartilhável e para o stream confirmar que
/// começou. Sem permissão a resposta vem na hora (com erro); o prazo é só
/// para um `replayd` travado não prender a thread de áudio para sempre.
const PRAZO: Duration = Duration::from_secs(5);

/// Prazo para o stream confirmar a parada no `Drop`. Esperar evita que a
/// reabertura logo em seguida (troca de display) encontre o stream anterior
/// ainda de pé; não esperar para sempre evita travar o fim da transmissão.
const PRAZO_DE_PARADA: Duration = Duration::from_millis(500);

/// Prefixo dos processos do WebKit (`com.apple.WebKit.WebContent`,
/// `.GPU`, `.Networking`). O áudio da chamada, dentro do webview, toca por
/// eles e não pelo nosso processo — `excludesCurrentProcessAudio` não os
/// pega, e sem excluí-los quem assiste à tela ouviria a própria voz de volta.
const PREFIXO_WEBKIT: &str = "com.apple.WebKit";

/// O que o callback e `ler` dividem.
struct Estado {
    /// i16 estéreo intercalado a 48 kHz, pronto para a faixa.
    amostras: VecDeque<i16>,
    /// Posto pelo delegate quando o sistema derruba o stream.
    erro: Option<ErroDeAudio>,
    /// Taxa em que o sistema está entregando, para refazer o reamostrador
    /// quando ela mudar (pedimos 48 kHz, mas não é garantia).
    taxa: u32,
    reamostrador: Reamostrador,
    /// Rascunhos reaproveitados entre callbacks, para não alocar a cada ~10 ms.
    estereo: Vec<i16>,
    reamostrado: Vec<i16>,
}

impl Estado {
    fn novo() -> Self {
        Self {
            amostras: VecDeque::with_capacity(TETO_DE_AMOSTRAS),
            erro: None,
            taxa: TAXA,
            reamostrador: Reamostrador::new(TAXA, TAXA),
            estereo: Vec::new(),
            reamostrado: Vec::new(),
        }
    }
}

type Compartilhado = Arc<Mutex<Estado>>;

/// Trava sem entrar em pânico: um callback que tenha caído no meio (não deve,
/// mas o `catch_unwind` existe por isso) não pode calar o áudio de vez.
fn travar(estado: &Mutex<Estado>) -> MutexGuard<'_, Estado> {
    estado.lock().unwrap_or_else(|envenenado| envenenado.into_inner())
}

struct IvarsDaSaida {
    estado: Compartilhado,
}

define_class!(
    // SAFETY:
    // - NSObject não tem exigência de subclasse.
    // - `SaidaDeAudio` não implementa `Drop`; o `Arc` das ivars é solto pelo
    //   próprio objc2 no dealloc.
    #[unsafe(super(NSObject))]
    #[name = "StreamzSaidaDeAudio"]
    #[ivars = IvarsDaSaida]
    struct SaidaDeAudio;

    unsafe impl NSObjectProtocol for SaidaDeAudio {}

    unsafe impl SCStreamOutput for SaidaDeAudio {
        #[unsafe(method(stream:didOutputSampleBuffer:ofType:))]
        fn stream_didOutputSampleBuffer_ofType(
            &self,
            _stream: &SCStream,
            amostra: &CMSampleBuffer,
            tipo: SCStreamOutputType,
        ) {
            if tipo != SCStreamOutputType::Audio {
                return;
            }
            let estado = &self.ivars().estado;
            // Um pânico aqui desenrolaria para dentro do ScreenCaptureKit.
            // O código abaixo não indexa sem checar nem faz `unwrap`; isto é
            // o cinto de segurança para o que escapar.
            let _ = catch_unwind(AssertUnwindSafe(|| receber(amostra, estado)));
        }
    }

    unsafe impl SCStreamDelegate for SaidaDeAudio {
        #[unsafe(method(stream:didStopWithError:))]
        fn stream_didStopWithError(&self, _stream: &SCStream, erro: &NSError) {
            let estado = &self.ivars().estado;
            let _ = catch_unwind(AssertUnwindSafe(|| {
                // Sem permissão reabrir só repete o erro; o resto (display que
                // sumiu, `replayd` reiniciado) costuma passar na segunda.
                let codigo = erro.code();
                let motivo = if codigo == SCStreamErrorCode::UserDeclined.0 {
                    ErroDeAudio::Falha
                } else {
                    ErroDeAudio::DispositivoInvalidado
                };
                travar(estado).erro = Some(motivo);
            }));
        }
    }
);

impl SaidaDeAudio {
    fn nova(estado: Compartilhado) -> Retained<Self> {
        let this = Self::alloc().set_ivars(IvarsDaSaida { estado });
        // SAFETY: `init` do NSObject, com as ivars já postas.
        unsafe { msg_send![super(this), init] }
    }
}

/// A `AudioBufferList` do Core Media com espaço para mais de um buffer. O
/// tipo gerado tem `mBuffers: [AudioBuffer; 1]` (o array flexível do C); este
/// tem o mesmo começo de layout e só mais posições no fim, que é exatamente
/// o que o `buffer_list_size` informa ao Core Media.
#[repr(C)]
struct ListaDeBuffers {
    quantos: u32,
    buffers: [AudioBuffer; MAX_BUFFERS],
}

/// Converte um buffer de áudio do ScreenCaptureKit e o acrescenta ao estado.
/// Qualquer coisa fora do esperado descarta o pedaço em silêncio: é um
/// callback de ~10 ms, e o próximo chega logo.
fn receber(amostra: &CMSampleBuffer, estado: &Mutex<Estado>) {
    // SAFETY: getters sem efeito colateral de um CMSampleBuffer válido, que o
    // framework mantém vivo durante o callback.
    unsafe {
        if !amostra.is_valid() || !amostra.data_is_ready() {
            return;
        }
    }
    let Some(formato) = (unsafe { amostra.format_description() }) else {
        return;
    };
    // SAFETY: descrição de formato de áudio válida; o ponteiro devolvido vive
    // enquanto `formato` viver, e é copiado já aqui.
    let asbd = unsafe { CMAudioFormatDescriptionGetStreamBasicDescription(&formato) };
    if asbd.is_null() {
        return;
    }
    let asbd = unsafe { *asbd };
    // Pedimos float de 32 bits (é o que o ScreenCaptureKit entrega); outro
    // formato seria uma mudança do sistema que não sabemos converter.
    if asbd.mFormatID != kAudioFormatLinearPCM
        || asbd.mFormatFlags & kAudioFormatFlagIsFloat == 0
        || asbd.mBitsPerChannel != 32
    {
        return;
    }
    let planar = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0;
    let taxa = asbd.mSampleRate.round();
    if !(1.0..=f64::from(u32::MAX)).contains(&taxa) {
        return;
    }
    let taxa = taxa as u32;

    // SAFETY: estrutura de inteiros e ponteiros crus; tudo zero é válido.
    let mut lista: ListaDeBuffers = unsafe { std::mem::zeroed() };
    let mut bloco: *mut CMBlockBuffer = std::ptr::null_mut();
    // SAFETY: `lista` tem `size_of::<ListaDeBuffers>()` bytes e começa com o
    // layout de `AudioBufferList`; `bloco` recebe um CMBlockBuffer retido que
    // é nosso para soltar (ver abaixo).
    let status = unsafe {
        amostra.audio_buffer_list_with_retained_block_buffer(
            std::ptr::null_mut(),
            (&mut lista as *mut ListaDeBuffers).cast::<AudioBufferList>(),
            std::mem::size_of::<ListaDeBuffers>(),
            None,
            None,
            kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            &mut bloco,
        )
    };
    // O bloco é quem mantém vivos os bytes apontados por `lista`: segurá-lo
    // até o fim da função e soltá-lo no drop (é "Retained" no nome da função).
    // SAFETY: não nulo e com +1 de retenção que nos pertence.
    let _bloco = NonNull::new(bloco).map(|b| unsafe { CFRetained::from_raw(b) });
    if status != 0 {
        return;
    }

    let quantos = (lista.quantos as usize).min(MAX_BUFFERS);
    let buffers = lista.buffers.get(..quantos).unwrap_or(&[]);

    let mut e = travar(estado);
    let e = &mut *e;
    if taxa != e.taxa {
        e.taxa = taxa;
        e.reamostrador = Reamostrador::new(taxa, TAXA);
    }
    e.estereo.clear();
    if planar {
        // Um buffer por canal, cada um com um só canal de float.
        let canais: Vec<&[f32]> = buffers
            .iter()
            .filter(|b| !b.mData.is_null())
            .map(|b| {
                let n = b.mDataByteSize as usize / std::mem::size_of::<f32>();
                // SAFETY: `mData` aponta para `mDataByteSize` bytes vivos
                // enquanto `_bloco` viver, alinhados a 16 (flag acima).
                unsafe { std::slice::from_raw_parts(b.mData as *const f32, n) }
            })
            .collect();
        planar_f32_para_estereo(&canais, &mut e.estereo);
    } else if let Some(b) = buffers.first().filter(|b| !b.mData.is_null()) {
        // Intercalado: um buffer só, com todos os canais.
        let canais = (b.mNumberChannels as usize).max(1);
        // SAFETY: idem, como bytes.
        let bruto =
            unsafe { std::slice::from_raw_parts(b.mData as *const u8, b.mDataByteSize as usize) };
        converter_para_estereo(bruto, Amostra::F32, canais, &mut e.estereo);
    }
    if e.estereo.is_empty() {
        return;
    }
    e.reamostrado.clear();
    e.reamostrador.processar(&e.estereo, &mut e.reamostrado);
    e.amostras.extend(e.reamostrado.iter().copied());
    // O teto e o que entra são pares (L, R), então o excesso também é: o
    // descarte nunca desalinha os canais.
    let excesso = e.amostras.len().saturating_sub(TETO_DE_AMOSTRAS);
    if excesso > 0 {
        e.amostras.drain(..excesso);
    }
}

/// Um stream do ScreenCaptureKit só de áudio, sobre o display principal.
pub struct Loopback {
    stream: sck::Enviavel<Retained<SCStream>>,
    // Mantidos vivos junto do stream: o stream guarda o delegate como
    // referência fraca, e a fila é onde o callback roda.
    _saida: sck::Enviavel<Retained<SaidaDeAudio>>,
    _fila: DispatchRetained<DispatchQueue>,
    estado: Compartilhado,
}

impl Loopback {
    /// Abre a captura do som do sistema. `Falha` sem permissão de Gravação
    /// de Tela, em macOS anterior ao 13 ou se o stream não começar.
    pub fn abrir() -> Result<Self, ErroDeAudio> {
        if !sck::sistema_atende() {
            return Err(ErroDeAudio::Falha);
        }
        let conteudo = sck::conteudo(PRAZO).ok_or(ErroDeAudio::Falha)?;
        // O filtro de áudio do ScreenCaptureKit é por app, e o display é só o
        // pretexto que o filtro exige: o principal existe sempre.
        let display = sck::achar_display(&conteudo, sck::display_principal())
            .or_else(|| unsafe { conteudo.displays() }.to_vec().into_iter().next())
            .ok_or(ErroDeAudio::Falha)?;

        let mut excluidos: Vec<Retained<SCRunningApplication>> = unsafe { conteudo.applications() }
            .to_vec()
            .into_iter()
            .filter(|app| {
                // SAFETY: getter de um SCRunningApplication válido.
                let id = unsafe { app.bundleIdentifier() };
                id.to_string().starts_with(PREFIXO_WEBKIT)
            })
            .collect();
        // VERIFICAR: se os processos XPC do WebKit aparecem mesmo em
        // `SCShareableContent.applications` (a lista pode trazer só apps com
        // janela). Se não aparecerem, o eco da chamada volta e é preciso
        // outro caminho. E o custo conhecido: o Safari usa os mesmos
        // `com.apple.WebKit.*`, então o som de uma aba do Safari também
        // fica de fora.
        if let Some(eu) = sck::meu_app(&conteudo) {
            excluidos.push(eu);
        }
        let apps = NSArray::from_retained_slice(&excluidos);
        let janelas = NSArray::<SCWindow>::new();
        // SAFETY: init de classe com objetos válidos do mesmo conteúdo.
        let filtro = unsafe {
            SCContentFilter::initWithDisplay_excludingApplications_exceptingWindows(
                SCContentFilter::alloc(),
                &display,
                &apps,
                &janelas,
            )
        };

        // SAFETY: setters de uma configuração recém-criada, só nossa.
        let config = unsafe {
            let config = SCStreamConfiguration::new();
            config.setCapturesAudio(true);
            config.setExcludesCurrentProcessAudio(true);
            config.setSampleRate(TAXA as isize);
            config.setChannelCount(isize::from(CANAIS));
            // O stream não aceita existir sem vídeo; o mínimo que dá, e um
            // quadro por segundo no máximo, que ninguém vai ler.
            config.setWidth(2);
            config.setHeight(2);
            config.setMinimumFrameInterval(CMTime::new(1, 1));
            config
        };

        let estado: Compartilhado = Arc::new(Mutex::new(Estado::novo()));
        let saida = SaidaDeAudio::nova(estado.clone());
        let fila = DispatchQueue::new("dev.streamz.tela.audio", DispatchQueueAttr::SERIAL);

        // SAFETY: filtro e configuração válidos; o delegate é o mesmo objeto
        // da saída, mantido vivo por `Loopback`.
        let stream = unsafe {
            SCStream::initWithFilter_configuration_delegate(
                SCStream::alloc(),
                &filtro,
                &config,
                Some(ProtocolObject::from_ref(&*saida)),
            )
        };
        // Só áudio: sem saída de tela registrada, os quadros de 2×2 morrem
        // dentro do framework.
        // SAFETY: saída e fila vivas enquanto o stream viver (ver campos).
        unsafe {
            stream.addStreamOutput_type_sampleHandlerQueue_error(
                ProtocolObject::from_ref(&*saida),
                SCStreamOutputType::Audio,
                Some(&*fila),
            )
        }
        .map_err(|_| ErroDeAudio::Falha)?;

        iniciar(&stream)?;

        Ok(Self {
            stream: sck::Enviavel(stream),
            _saida: sck::Enviavel(saida),
            _fila: fila,
            estado,
        })
    }

    /// Acrescenta em `saida` tudo o que chegou desde a última leitura, já
    /// como i16 estéreo intercalado a 48 kHz. Sem nada novo, não acrescenta
    /// nada — não bloqueia, igual ao do Windows.
    pub fn ler(&mut self, saida: &mut Vec<i16>) -> Result<(), ErroDeAudio> {
        let mut e = travar(&self.estado);
        if let Some(erro) = e.erro {
            return Err(erro);
        }
        saida.extend(e.amostras.drain(..));
        Ok(())
    }
}

/// Liga o stream e espera a confirmação, com prazo. Recusa de permissão chega
/// aqui como erro, e só aqui dá para percebê-la antes de a transmissão
/// ficar esperando som que nunca vem.
fn iniciar(stream: &SCStream) -> Result<(), ErroDeAudio> {
    let (tx, rx) = sync_channel::<Result<(), ErroDeAudio>>(1);
    let bloco = RcBlock::new(move |erro: *mut NSError| {
        // SAFETY: `erro` é nulo ou um NSError válido durante o handler.
        let resultado = match unsafe { erro.as_ref() } {
            None => Ok(()),
            Some(_) => Err(ErroDeAudio::Falha),
        };
        let _ = tx.try_send(resultado);
    });
    // SAFETY: o bloco é copiado pelo framework; assinatura igual à do handler.
    unsafe { stream.startCaptureWithCompletionHandler(Some(&*bloco)) };
    rx.recv_timeout(PRAZO).unwrap_or(Err(ErroDeAudio::Falha))
}

impl Drop for Loopback {
    fn drop(&mut self) {
        let (tx, rx) = sync_channel::<()>(1);
        let bloco = RcBlock::new(move |_erro: *mut NSError| {
            // Parar um stream que o sistema já derrubou devolve erro; tanto faz.
            let _ = tx.try_send(());
        });
        // SAFETY: stream válido; o bloco é copiado pelo framework.
        unsafe { self.stream.0.stopCaptureWithCompletionHandler(Some(&*bloco)) };
        let _ = rx.recv_timeout(PRAZO_DE_PARADA);
    }
}
