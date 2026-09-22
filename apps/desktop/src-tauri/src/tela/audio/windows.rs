//! Áudio do sistema por WASAPI em modo *loopback* — o "compartilhar áudio do
//! sistema" da captura nativa.
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

/// A taxa e o número de canais que saem daqui, sempre.
pub const TAXA: u32 = 48_000;
pub const CANAIS: u16 = 2;

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

/// O que pode dar errado no loopback. Sem mensagem de propósito: o áudio da
/// tela é acessório da transmissão, e quem lê só precisa decidir entre
/// reabrir e desistir — o vídeo segue nos dois casos.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErroDeAudio {
    /// O dispositivo de saída padrão mudou ou sumiu: reabrir.
    DispositivoInvalidado,
    /// Qualquer outra coisa (sem dispositivo de saída, formato estranho).
    Falha,
}

impl From<windows::core::Error> for ErroDeAudio {
    fn from(e: windows::core::Error) -> Self {
        if e.code() == AUDCLNT_E_DEVICE_INVALIDATED {
            ErroDeAudio::DispositivoInvalidado
        } else {
            ErroDeAudio::Falha
        }
    }
}

/// Como cada amostra vem do mixer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Amostra {
    F32,
    I16,
    I32,
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

/// Converte quadros intercalados no formato do mixer para i16 estéreo. Mais
/// de dois canais: ficam os dois primeiros (esquerdo e direito, por
/// convenção do `dwChannelMask`); mono: duplicado.
fn converter_para_estereo(bruto: &[u8], amostra: Amostra, canais: usize, saida: &mut Vec<i16>) {
    let tamanho = match amostra {
        Amostra::I16 => 2,
        Amostra::F32 | Amostra::I32 => 4,
    };
    let ler = |i: usize| -> i16 {
        let b = &bruto[i * tamanho..(i + 1) * tamanho];
        match amostra {
            Amostra::I16 => i16::from_le_bytes([b[0], b[1]]),
            Amostra::I32 => (i32::from_le_bytes([b[0], b[1], b[2], b[3]]) >> 16) as i16,
            Amostra::F32 => {
                let v = f32::from_le_bytes([b[0], b[1], b[2], b[3]]);
                (v.clamp(-1.0, 1.0) * 32767.0) as i16
            }
        }
    };
    let quadros = bruto.len() / (tamanho * canais.max(1));
    for q in 0..quadros {
        let esquerdo = ler(q * canais);
        let direito = if canais >= 2 {
            ler(q * canais + 1)
        } else {
            esquerdo
        };
        saida.push(esquerdo);
        saida.push(direito);
    }
}

/// Reamostragem linear de estéreo intercalado, com estado entre chamadas
/// (a posição fracionária e o último quadro), para não estalar na emenda
/// dos pacotes. Linear é suficiente para 44,1 → 48 kHz em áudio de jogo e
/// vídeo; a taxa do mixer raramente é outra coisa.
struct Reamostrador {
    razao: f64,
    /// Posição de leitura na entrada, em quadros, contada a partir do quadro
    /// guardado em `anterior` (que é o quadro -1).
    pos: f64,
    anterior: [i16; 2],
    tem_anterior: bool,
}

impl Reamostrador {
    fn new(de: u32, para: u32) -> Self {
        Self {
            razao: f64::from(de) / f64::from(para),
            pos: 0.0,
            anterior: [0, 0],
            tem_anterior: false,
        }
    }

    fn processar(&mut self, entrada: &[i16], saida: &mut Vec<i16>) {
        let quadros = entrada.len() / 2;
        if quadros == 0 {
            return;
        }
        if (self.razao - 1.0).abs() < f64::EPSILON {
            saida.extend_from_slice(&entrada[..quadros * 2]);
            return;
        }
        if !self.tem_anterior {
            self.anterior = [entrada[0], entrada[1]];
            self.tem_anterior = true;
            self.pos = 0.0;
        }
        // O quadro -1 é `anterior`; o quadro k ≥ 0 é entrada[k].
        let ler = |k: i64, canal: usize| -> f64 {
            if k < 0 {
                f64::from(self.anterior[canal])
            } else {
                f64::from(entrada[k as usize * 2 + canal])
            }
        };
        // `pos` conta a partir de -1: pos = 0 é o quadro `anterior`.
        let mut p = self.pos;
        while p < quadros as f64 {
            let base = p.floor();
            let frac = p - base;
            let k = base as i64 - 1;
            for canal in 0..2 {
                let a = ler(k, canal);
                let b = ler(k + 1, canal);
                saida.push((a + (b - a) * frac).round().clamp(-32768.0, 32767.0) as i16);
            }
            p += self.razao;
        }
        self.pos = p - quadros as f64;
        self.anterior = [entrada[(quadros - 1) * 2], entrada[(quadros - 1) * 2 + 1]];
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn mesma_taxa_passa_direto() {
        let mut r = Reamostrador::new(48_000, 48_000);
        let mut saida = Vec::new();
        r.processar(&[1, 2, 3, 4], &mut saida);
        assert_eq!(saida, vec![1, 2, 3, 4]);
    }

    #[test]
    fn de_44100_para_48000_produz_mais_quadros_e_mantem_a_rampa() {
        let mut r = Reamostrador::new(44_100, 48_000);
        let entrada: Vec<i16> = (0..441).flat_map(|i| [i * 10, -(i * 10)]).collect();
        let mut saida = Vec::new();
        r.processar(&entrada, &mut saida);
        let quadros = saida.len() / 2;
        assert!((478..=482).contains(&quadros), "{quadros}");
        // rampa continua monótona no canal esquerdo
        let esquerdo: Vec<i16> = saida.iter().step_by(2).copied().collect();
        assert!(esquerdo.windows(2).all(|w| w[0] <= w[1]));
        // e o direito é o espelho
        assert!(saida.chunks(2).all(|c| c[0] == -c[1]));
    }

    #[test]
    fn a_emenda_entre_chamadas_nao_pula() {
        let mut r = Reamostrador::new(44_100, 48_000);
        let mut saida = Vec::new();
        r.processar(&[0, 0, 100, 100], &mut saida);
        r.processar(&[200, 200, 300, 300], &mut saida);
        let esquerdo: Vec<i16> = saida.iter().step_by(2).copied().collect();
        assert!(
            esquerdo.windows(2).all(|w| w[1] - w[0] <= 100),
            "{esquerdo:?}"
        );
    }

    #[test]
    fn converte_float_e_reduz_canais() {
        let mut saida = Vec::new();
        // dois quadros de 4 canais, float: só L e R sobrevivem
        let mut bruto = Vec::new();
        for v in [0.5f32, -0.5, 0.1, 0.1, 1.0, -1.0, 0.0, 0.0] {
            bruto.extend_from_slice(&v.to_le_bytes());
        }
        converter_para_estereo(&bruto, Amostra::F32, 4, &mut saida);
        assert_eq!(saida, vec![16383, -16383, 32767, -32767]);

        let mut mono = Vec::new();
        converter_para_estereo(&7i16.to_le_bytes(), Amostra::I16, 1, &mut mono);
        assert_eq!(mono, vec![7, 7]);
    }
}
