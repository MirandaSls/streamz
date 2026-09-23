//! Áudio do sistema por WASAPI em modo *loopback* — a metade Windows do
//! `audio`.
//!
//! O loopback abre um cliente de captura sobre o dispositivo de **saída**
//! padrão: tudo o que está tocando (jogo, vídeo, música) chega aqui já
//! misturado, no formato do mixer do Windows — quase sempre float de 32 bits,
//! estéreo, 48 kHz, mas não é garantia: placas de som e "aprimoramentos"
//! mudam taxa e número de canais. Por isso o que sai daqui é sempre **i16
//! estéreo a 48 kHz**, que é o que a faixa de áudio publicada espera.
//!
//! Trocar o dispositivo de saída (pôr o fone) invalida o cliente
//! (`AUDCLNT_E_DEVICE_INVALIDATED`): quem lê recebe `DispositivoInvalidado`
//! e reabre no novo padrão, senão o som morre em silêncio na troca de fone.

use std::ffi::c_void;

use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_E_DEVICE_INVALIDATED, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_LOOPBACK, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
};

use super::mistura::{converter_para_estereo, Amostra, Reamostrador};
use super::{ErroDeAudio, TAXA};

/// Buffer pedido ao WASAPI, em unidades de 100 ns (200 ms). Folga para a
/// thread de leitura atrasar sem perder som; a latência real é a do mixer.
const BUFFER_100NS: i64 = 2_000_000;

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

/// Um cliente de loopback aberto sobre o dispositivo de saída padrão.
pub struct Loopback {
    cliente: IAudioClient,
    captura: IAudioCaptureClient,
    canais: u16,
    amostra: Amostra,
    reamostrador: Reamostrador,
}

impl Loopback {
    /// Abre o loopback no dispositivo de saída padrão. Inicializa o COM na
    /// thread atual (a thread de áudio é nossa e só faz isto).
    pub fn abrir() -> Result<Self, ErroDeAudio> {
        unsafe {
            // S_FALSE ("já inicializado") e RPC_E_CHANGED_MODE (outro modo na
            // mesma thread) não impedem nada: o COM está de pé nos dois casos.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

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
        }
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
