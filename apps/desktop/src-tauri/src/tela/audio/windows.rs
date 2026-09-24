//! Áudio do sistema por WASAPI em modo *loopback* — a metade Windows do
//! `audio`.
//!
//! O caminho preferido é o *process loopback* (Windows 10 build 20348 em
//! diante): captura tudo o que está tocando (jogo, vídeo, música) **menos** a
//! árvore de processos do próprio Streamz. Sem essa exclusão, as vozes da
//! chamada — tocadas pelos processos filhos do WebView2 — voltariam para os
//! outros participantes dentro do áudio da tela, como eco da própria voz.
//!
//! Onde o process loopback não existe ou falha, cai no loopback clássico do
//! dispositivo de **saída** padrão, que pega a mistura inteira (e, com ela, o
//! eco). Ali o formato é o do mixer do Windows — quase sempre float de 32
//! bits, estéreo, 48 kHz, mas não é garantia: placas de som e
//! "aprimoramentos" mudam taxa e número de canais. Por isso o que sai daqui é
//! sempre **i16 estéreo a 48 kHz**, que é o que a faixa de áudio publicada
//! espera.
//!
//! Trocar o dispositivo de saída (pôr o fone) invalida o cliente
//! (`AUDCLNT_E_DEVICE_INVALIDATED`): quem lê recebe `DispositivoInvalidado`
//! e reabre no novo padrão, senão o som morre em silêncio na troca de fone.

use std::ffi::c_void;
use std::sync::mpsc;
use std::time::Duration;

use windows::core::{implement, IUnknown, Interface, Ref, HRESULT, PCWSTR};
use windows::Win32::Media::Audio::{
    eConsole, eRender, ActivateAudioInterfaceAsync, IActivateAudioInterfaceAsyncOperation,
    IActivateAudioInterfaceCompletionHandler, IActivateAudioInterfaceCompletionHandler_Impl,
    IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_E_DEVICE_INVALIDATED, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
    AUDCLNT_STREAMFLAGS_LOOPBACK, AUDIOCLIENT_ACTIVATION_PARAMS, AUDIOCLIENT_ACTIVATION_PARAMS_0,
    AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK, AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE, VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
    WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, BLOB, CLSCTX_ALL, COINIT_MULTITHREADED,
};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Threading::{CreateEventW, GetCurrentProcessId};
use windows::Win32::System::Variant::VT_BLOB;

use super::mistura::{converter_para_estereo, Amostra, Reamostrador};
use super::{ErroDeAudio, TAXA};

/// Buffer pedido ao WASAPI, em unidades de 100 ns (200 ms). Folga para a
/// thread de leitura atrasar sem perder som; a latência real é a do mixer.
const BUFFER_100NS: i64 = 2_000_000;

/// Quanto esperar a ativação assíncrona do process loopback. Ela costuma
/// voltar em milissegundos; passar disso é sinal de que algo travou, e o
/// loopback clássico é melhor do que áudio nenhum.
const ESPERA_ATIVACAO: Duration = Duration::from_secs(2);

// Tags e subformatos do `mmreg.h`/`ksmedia.h`: `#define`s soltos que o crate
// `windows` só expõe com mais duas features ligadas para três constantes.
const WAVE_FORMAT_PCM: u16 = 1;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
const SUBFORMATO_PCM: windows::core::GUID =
    windows::core::GUID::from_u128(0x00000001_0000_0010_8000_00aa00389b71);
const SUBFORMATO_IEEE_FLOAT: windows::core::GUID =
    windows::core::GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);

impl From<windows::core::Error> for ErroDeAudio {
    fn from(e: windows::core::Error) -> Self {
        if e.code() == AUDCLNT_E_DEVICE_INVALIDATED {
            ErroDeAudio::DispositivoInvalidado
        } else {
            ErroDeAudio::Falha
        }
    }
}

/// Um cliente de loopback aberto: de processo (sem o Streamz) ou, no
/// fallback, sobre o dispositivo de saída padrão.
pub struct Loopback {
    cliente: IAudioClient,
    captura: IAudioCaptureClient,
    canais: u16,
    amostra: Amostra,
    reamostrador: Reamostrador,
    /// Evento do modo `EVENTCALLBACK`, só no process loopback. Ninguém espera
    /// nele — a leitura continua por polling —, mas o cliente precisa dele
    /// registrado antes do `Start`; fechado no `Drop`.
    evento: Option<HANDLE>,
}

impl Loopback {
    /// Abre o loopback: primeiro o de processo, que deixa o som do próprio
    /// Streamz de fora; se não der, o do dispositivo de saída padrão.
    /// Inicializa o COM na thread atual (a thread de áudio é nossa e só faz
    /// isto).
    pub fn abrir() -> Result<Self, ErroDeAudio> {
        unsafe {
            // S_FALSE ("já inicializado") e RPC_E_CHANGED_MODE (outro modo na
            // mesma thread) não impedem nada: o COM está de pé nos dois casos.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        if let Ok(loopback) = Self::abrir_sem_o_streamz() {
            return Ok(loopback);
        }
        // Fallback: Windows sem process loopback (antes do build 20348) ou
        // ativação que falhou. Aqui o eco volta — as vozes da chamada estão
        // na mistura do dispositivo —, mas é melhor que a tela sem som.
        Self::abrir_dispositivo_padrao()
    }

    /// Process loopback de tudo menos a árvore de processos deste. Qualquer
    /// erro aqui só faz `abrir` cair no caminho clássico.
    fn abrir_sem_o_streamz() -> Result<Self, ErroDeAudio> {
        unsafe {
            // `params` e `prop` vivem até o fim desta função — depois da
            // espera abaixo —, então o blob que o `PROPVARIANT` aponta não
            // morre com a ativação ainda em andamento.
            let params = AUDIOCLIENT_ACTIVATION_PARAMS {
                ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                    ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                        TargetProcessId: GetCurrentProcessId(),
                        ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
                    },
                },
            };
            // Montado à mão e sem `PropVariantClear`: o blob é memória nossa,
            // na pilha, não do alocador do COM.
            let mut prop = PROPVARIANT::default();
            {
                let interno = &mut *prop.Anonymous.Anonymous;
                interno.vt = VT_BLOB;
                interno.Anonymous.blob = BLOB {
                    cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                    pBlobData: &params as *const AUDIOCLIENT_ACTIVATION_PARAMS as *mut u8,
                };
            }

            let (tx, rx) = mpsc::channel();
            let aviso: IActivateAudioInterfaceCompletionHandler = AvisoDeAtivacao { tx }.into();
            let operacao: IActivateAudioInterfaceAsyncOperation = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                &IAudioClient::IID,
                Some(&prop as *const PROPVARIANT),
                &aviso,
            )?;
            // Timeout: o aviso pode chegar depois; o `send` dele só falha
            // em silêncio, porque o `rx` já foi embora.
            rx.recv_timeout(ESPERA_ATIVACAO).map_err(|_| ErroDeAudio::Falha)?;

            let mut resultado = HRESULT(0);
            let mut ativado: Option<IUnknown> = None;
            operacao.GetActivateResult(&mut resultado, &mut ativado)?;
            resultado.ok()?;
            let cliente: IAudioClient = ativado.ok_or(ErroDeAudio::Falha)?.cast()?;

            // O dispositivo virtual não responde `GetMixFormat`: o formato é
            // o que pedimos, e o motor de áudio converte para ele. Pedimos o
            // mesmo do mixer típico (float 32, estéreo, 48 kHz) para a
            // conversão ser nenhuma na maioria das máquinas.
            let formato = WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_IEEE_FLOAT,
                nChannels: 2,
                nSamplesPerSec: TAXA,
                nAvgBytesPerSec: TAXA * 8,
                nBlockAlign: 8,
                wBitsPerSample: 32,
                cbSize: 0,
            };
            // Flags do exemplo da Microsoft para process loopback, que é o
            // caminho testado desse dispositivo virtual: `EVENTCALLBACK`
            // mesmo lendo por polling, e `AUTOCONVERTPCM` para o motor
            // converter a mistura para o formato fixo acima.
            cliente.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK
                    | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                    | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                BUFFER_100NS,
                0,
                &formato,
                None,
            )?;

            // Auto-reset e sem nome: é só o que o `EVENTCALLBACK` exige
            // registrado antes do `Start`.
            let evento = CreateEventW(None, false, false, PCWSTR::null())?;
            let iniciar = || -> Result<IAudioCaptureClient, ErroDeAudio> {
                cliente.SetEventHandle(evento)?;
                let captura: IAudioCaptureClient = cliente.GetService()?;
                cliente.Start()?;
                Ok(captura)
            };
            let captura = match iniciar() {
                Ok(captura) => captura,
                Err(e) => {
                    // Sem `Self` montado, o `Drop` não roda: fechar aqui.
                    let _ = CloseHandle(evento);
                    return Err(e);
                }
            };

            Ok(Self {
                cliente,
                captura,
                canais: 2,
                amostra: Amostra::F32,
                // Já sai a 48 kHz; o reamostrador fica de passagem.
                reamostrador: Reamostrador::new(TAXA, TAXA),
                evento: Some(evento),
            })
        }
    }

    /// Loopback clássico no dispositivo de saída padrão.
    fn abrir_dispositivo_padrao() -> Result<Self, ErroDeAudio> {
        unsafe {
            let enumerador: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let dispositivo = enumerador.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let cliente: IAudioClient = dispositivo.Activate(CLSCTX_ALL, None)?;

            let formato_ptr = cliente.GetMixFormat()?;
            if formato_ptr.is_null() {
                return Err(ErroDeAudio::Falha);
            }
            let (taxa, canais, amostra) = descrever_formato(formato_ptr);
            let inicializado = cliente.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                BUFFER_100NS,
                0,
                formato_ptr,
                None,
            );
            CoTaskMemFree(Some(formato_ptr as *const c_void));
            inicializado?;
            let amostra = amostra.ok_or(ErroDeAudio::Falha)?;

            let captura: IAudioCaptureClient = cliente.GetService()?;
            cliente.Start()?;

            Ok(Self {
                cliente,
                captura,
                canais,
                amostra,
                reamostrador: Reamostrador::new(taxa, TAXA),
                evento: None,
            })
        }
    }

    /// Lê tudo o que o mixer tem agora e acrescenta em `saida`, já como i16
    /// estéreo intercalado a 48 kHz. Sem nada novo, não acrescenta nada.
    pub fn ler(&mut self, saida: &mut Vec<i16>) -> Result<(), ErroDeAudio> {
        let bytes_por_amostra = match self.amostra {
            Amostra::I16 => 2,
            Amostra::F32 | Amostra::I32 => 4,
        };
        let canais = usize::from(self.canais);
        loop {
            let quadros = unsafe { self.captura.GetNextPacketSize()? };
            if quadros == 0 {
                return Ok(());
            }
            let mut dados: *mut u8 = std::ptr::null_mut();
            let mut lidos = 0u32;
            let mut flags = 0u32;
            unsafe {
                self.captura
                    .GetBuffer(&mut dados, &mut lidos, &mut flags, None, None)?;
            }
            let n = lidos as usize;
            let silencio = flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0;
            // Estéreo na taxa do mixer, antes de reamostrar.
            let mut estereo: Vec<i16> = Vec::with_capacity(n * 2);
            if silencio || dados.is_null() {
                estereo.resize(n * 2, 0);
            } else {
                let bruto =
                    unsafe { std::slice::from_raw_parts(dados, n * canais * bytes_por_amostra) };
                converter_para_estereo(bruto, self.amostra, canais, &mut estereo);
            }
            unsafe { self.captura.ReleaseBuffer(lidos)? };
            self.reamostrador.processar(&estereo, saida);
        }
    }
}

impl Drop for Loopback {
    fn drop(&mut self) {
        unsafe {
            let _ = self.cliente.Stop();
            // Depois do `Stop`: o cliente não sinaliza mais o evento.
            if let Some(evento) = self.evento.take() {
                let _ = CloseHandle(evento);
            }
        }
    }
}

/// Recebe o fim da ativação assíncrona do process loopback. Só avisa: o
/// resultado é lido pela operação que `ActivateAudioInterfaceAsync` devolveu.
/// O `#[implement]` já marca o objeto como ágil (`IAgileObject`), que é o que
/// o Windows exige — o aviso chega numa thread do pool, não na nossa.
#[implement(IActivateAudioInterfaceCompletionHandler)]
struct AvisoDeAtivacao {
    tx: mpsc::Sender<()>,
}

impl IActivateAudioInterfaceCompletionHandler_Impl for AvisoDeAtivacao_Impl {
    fn ActivateCompleted(
        &self,
        _operacao: Ref<IActivateAudioInterfaceAsyncOperation>,
    ) -> windows::core::Result<()> {
        let _ = self.tx.send(());
        Ok(())
    }
}

/// Taxa, canais e tipo de amostra de um `WAVEFORMATEX` (ou `EXTENSIBLE`).
/// Tipo `None` quando não é PCM 16/32 nem float 32.
unsafe fn descrever_formato(f: *const WAVEFORMATEX) -> (u32, u16, Option<Amostra>) {
    let base = *f;
    let bits = base.wBitsPerSample;
    let tag = if base.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
        let ext = *(f as *const WAVEFORMATEXTENSIBLE);
        // a struct é `packed`: o campo sai por cópia, nunca por referência
        let subformato = ext.SubFormat;
        if subformato == SUBFORMATO_IEEE_FLOAT {
            WAVE_FORMAT_IEEE_FLOAT
        } else if subformato == SUBFORMATO_PCM {
            WAVE_FORMAT_PCM
        } else {
            0
        }
    } else {
        base.wFormatTag
    };
    let amostra = match (tag, bits) {
        (WAVE_FORMAT_IEEE_FLOAT, 32) => Some(Amostra::F32),
        (WAVE_FORMAT_PCM, 16) => Some(Amostra::I16),
        (WAVE_FORMAT_PCM, 32) => Some(Amostra::I32),
        _ => None,
    };
    (base.nSamplesPerSec, base.nChannels, amostra)
}
