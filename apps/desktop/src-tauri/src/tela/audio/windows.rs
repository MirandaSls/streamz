//! Áudio do sistema por WASAPI em modo *loopback* — a metade Windows do
//! `audio`.
//!
//! O caminho preferido é o *process loopback* (Windows 10 build 20348 em
//! diante): captura tudo o que está tocando (jogo, vídeo, música) **menos** a
//! árvore de processos do navegador do WebView2, onde roda o serviço de áudio
//! que toca a chamada. Sem essa exclusão, as vozes da chamada voltariam para
//! os outros participantes dentro do áudio da tela, como eco da própria voz.
//!
//! **Por que o navegador do WebView2, e não o nosso PID.** Do runtime 117 em
//! diante o `msedgewebview2.exe` é lançado reparentado pelo `explorer.exe` e
//! não descende mais do Streamz
//! (<https://github.com/MicrosoftEdge/WebView2Feedback/discussions/3848>).
//! Excluir a árvore do nosso processo, como era feito, não excluía nada: quem
//! estava na call se ouvia com atraso na tela que o outro transmitia com áudio
//! (produção, 2026-10-02). O alvo certo é o `ICoreWebView2::BrowserProcessId`,
//! que o `lib.rs` entrega no boot a [`registrar_processo_do_webview`]: o
//! serviço de áudio é filho dele, então cai na árvore excluída. Mesmo defeito
//! e mesmo conserto noutro app Tauri 2:
//! <https://github.com/Campfire-Social-App/campfire/pull/17>.
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
use std::mem::ManuallyDrop;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use windows::core::{implement, IUnknown, Interface, Ref, HRESULT, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
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

/// PID do navegador do WebView2 (`msedgewebview2.exe`), raiz da árvore que o
/// process loopback deixa de fora; 0 = desconhecido. É só um número lido na
/// abertura, sem outra memória a sincronizar com ele: `Relaxed` basta.
static PROCESSO_DO_WEBVIEW: AtomicU32 = AtomicU32::new(0);

/// Guarda o PID do navegador do WebView2 para o process loopback excluir (ver
/// o topo do arquivo). O `lib.rs` chama no boot, com o
/// `ICoreWebView2::BrowserProcessId`. Zero é "desconhecido" e é ignorado, para
/// não apagar um registro bom.
pub fn registrar_processo_do_webview(pid: u32) {
    if pid == 0 {
        return;
    }
    PROCESSO_DO_WEBVIEW.store(pid, Ordering::Relaxed);
    log::info!("tela-audio: processo do WebView2 registrado (pid {pid})");
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

/// Um cliente de loopback aberto: de processo (sem a árvore do WebView2) ou,
/// no fallback, sobre o dispositivo de saída padrão.
pub struct Loopback {
    cliente: IAudioClient,
    captura: IAudioCaptureClient,
    canais: u16,
    amostra: Amostra,
    reamostrador: Reamostrador,
    /// Tamanho do buffer do cliente, em quadros (`GetBufferSize`). Teto do
    /// que um `GetBuffer` pode devolver: acima disso o número é lixo, e ler
    /// aquilo tudo a partir do ponteiro do motor seria sair da memória dele.
    quadros_no_buffer: u32,
    /// Evento do modo `EVENTCALLBACK`, só no process loopback. Ninguém espera
    /// nele — a leitura continua por polling —, mas o cliente precisa dele
    /// registrado antes do `Start`; fechado no `Drop`.
    evento: Option<HANDLE>,
}

impl Loopback {
    /// Abre o loopback: primeiro o de processo, que deixa de fora o som do
    /// WebView2 (as vozes da chamada); se não der, o do dispositivo de saída
    /// padrão. Inicializa o COM na thread atual (a thread de áudio é nossa e
    /// só faz isto).
    pub fn abrir() -> Result<Self, ErroDeAudio> {
        unsafe {
            // S_FALSE ("já inicializado") e RPC_E_CHANGED_MODE (outro modo na
            // mesma thread) não impedem nada: o COM está de pé nos dois casos.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        // O sucesso vai para o log lá dentro, junto com o PID que ficou de
        // fora e de onde ele veio.
        let erro = match Self::abrir_sem_o_streamz() {
            Ok(loopback) => return Ok(loopback),
            Err(e) => e,
        };
        // Fallback: Windows sem process loopback (antes do build 20348) ou
        // ativação que falhou. Aqui o eco volta — as vozes da chamada estão
        // na mistura do dispositivo —, mas é melhor que a tela sem som.
        // Registrado como `warn` (não `info`) porque degrada o resultado para
        // quem assiste: o motivo da queda precisa aparecer no log de suporte.
        log::warn!(
            "tela-audio: process loopback falhou ({erro:?}); usando loopback do dispositivo padrão — \
             áudio da transmissão vai levar as vozes da chamada: retorno para quem assiste"
        );
        Self::abrir_dispositivo_padrao()
    }

    /// Process loopback de tudo menos a árvore do navegador do WebView2 (ver
    /// [`registrar_processo_do_webview`]). Sem o PID dele, exclui a deste
    /// processo, como era antes — o que deixa a chamada passar (ver o topo),
    /// e por isso avisa no log. Qualquer erro aqui só faz `abrir` cair no
    /// caminho clássico.
    fn abrir_sem_o_streamz() -> Result<Self, ErroDeAudio> {
        let (alvo, origem) = match PROCESSO_DO_WEBVIEW.load(Ordering::Relaxed) {
            0 => {
                log::warn!(
                    "tela-audio: processo do WebView2 desconhecido; excluindo o próprio processo \
                     no lugar dele — as vozes da chamada podem ir na transmissão"
                );
                let proprio = unsafe { GetCurrentProcessId() };
                (proprio, "fallback: o próprio processo")
            }
            pid => (pid, "navegador do WebView2"),
        };
        unsafe {
            // `params` e `prop` vão para o heap e a posse vai para o
            // `AvisoDeAtivacao`: o Windows segura o aviso (AddRef) até chamar
            // `ActivateCompleted`, então a memória que o `PROPVARIANT` aponta
            // só é liberada depois que a ativação acabou — mesmo que a espera
            // abaixo estoure e esta função já tenha voltado. Na pilha, um
            // timeout deixaria o Windows lendo memória liberada.
            let ativacao = Box::into_raw(Box::new(ParametrosDeAtivacao {
                params: AUDIOCLIENT_ACTIVATION_PARAMS {
                    ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                    Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                        ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                            TargetProcessId: alvo,
                            ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
                        },
                    },
                },
                prop: ManuallyDrop::new(PROPVARIANT::default()),
            }));
            // Dono antes de qualquer `?`: daqui em diante quem libera é o
            // `Drop` dele, quando a última referência ao aviso cair.
            let dono = DonoDosParametros(ativacao);
            // Montado à mão e nunca limpo: o `pBlobData` aponta para o
            // `params` dentro da nossa `Box`, não para memória do alocador do
            // COM. Por isso `prop` é `ManuallyDrop` (ver `DonoDosParametros`).
            let prop: *const PROPVARIANT = {
                let variante: &mut PROPVARIANT = &mut (*ativacao).prop;
                let interno = &mut *variante.Anonymous.Anonymous;
                interno.vt = VT_BLOB;
                interno.Anonymous.blob = BLOB {
                    cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                    pBlobData: std::ptr::addr_of_mut!((*ativacao).params) as *mut u8,
                };
                // `ManuallyDrop` é `repr(transparent)`: o endereço é o do
                // `PROPVARIANT`.
                std::ptr::addr_of!((*ativacao).prop).cast::<PROPVARIANT>()
            };

            let (tx, rx) = mpsc::channel();
            let aviso: IActivateAudioInterfaceCompletionHandler = AvisoDeAtivacao {
                tx,
                _parametros: dono,
            }
            .into();
            let operacao: IActivateAudioInterfaceAsyncOperation = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                &IAudioClient::IID,
                Some(prop),
                &aviso,
            )?;
            // Timeout: o aviso pode chegar depois; o `send` dele só falha
            // em silêncio, porque o `rx` já foi embora. Os parâmetros seguem
            // vivos dentro do aviso, que o Windows ainda segura.
            rx.recv_timeout(ESPERA_ATIVACAO).map_err(|_| {
                log::warn!(
                    "tela-audio: process loopback sem resposta de ativação em {:?}",
                    ESPERA_ATIVACAO
                );
                ErroDeAudio::Falha
            })?;

            let mut resultado = HRESULT(0);
            let mut ativado: Option<IUnknown> = None;
            operacao
                .GetActivateResult(&mut resultado, &mut ativado)
                .inspect_err(|e| log::warn!("tela-audio: GetActivateResult falhou: {e}"))?;
            resultado.ok().inspect_err(|e| {
                log::warn!("tela-audio: ativação do process loopback voltou com erro: {e}")
            })?;
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
            cliente
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_LOOPBACK
                        | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                        | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                    BUFFER_100NS,
                    0,
                    &formato,
                    None,
                )
                .inspect_err(|e| {
                    log::warn!("tela-audio: Initialize do process loopback falhou: {e}")
                })?;

            // Auto-reset e sem nome: é só o que o `EVENTCALLBACK` exige
            // registrado antes do `Start`.
            let evento = CreateEventW(None, false, false, PCWSTR::null())?;
            let iniciar = || -> Result<(IAudioCaptureClient, u32), ErroDeAudio> {
                cliente
                    .SetEventHandle(evento)
                    .inspect_err(|e| log::warn!("tela-audio: SetEventHandle falhou: {e}"))?;
                let captura: IAudioCaptureClient = cliente.GetService().inspect_err(|e| {
                    log::warn!("tela-audio: GetService (IAudioCaptureClient) falhou: {e}")
                })?;
                let quadros_no_buffer = cliente.GetBufferSize()?;
                cliente.Start().inspect_err(|e| {
                    log::warn!("tela-audio: Start do process loopback falhou: {e}")
                })?;
                Ok((captura, quadros_no_buffer))
            };
            let (captura, quadros_no_buffer) = match iniciar() {
                Ok(par) => par,
                Err(e) => {
                    // Sem `Self` montado, o `Drop` não roda: parar e fechar
                    // aqui. Hoje o `Start` é o último passo e não há o que
                    // parar, mas `Stop` num cliente parado só devolve
                    // S_FALSE — fica de cinto se alguém puser algo depois
                    // dele. O evento fecha depois do `Stop`, como no `Drop`.
                    let _ = cliente.Stop();
                    let _ = CloseHandle(evento);
                    return Err(e);
                }
            };

            log::info!(
                "tela-audio: loopback via process loopback, sem a árvore do pid {alvo} ({origem})"
            );
            Ok(Self {
                cliente,
                captura,
                canais: 2,
                amostra: Amostra::F32,
                // Já sai a 48 kHz; o reamostrador fica de passagem.
                reamostrador: Reamostrador::new(TAXA, TAXA),
                quadros_no_buffer,
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

            let formato_ptr = cliente
                .GetMixFormat()
                .inspect_err(|e| log::warn!("tela-audio: GetMixFormat falhou: {e}"))?;
            if formato_ptr.is_null() {
                log::warn!("tela-audio: GetMixFormat devolveu ponteiro nulo");
                return Err(ErroDeAudio::Falha);
            }
            let (taxa, canais, amostra) = descrever_formato(formato_ptr);
            log::info!(
                "tela-audio: mixer do dispositivo padrão: {} Hz, {} canal(is), amostra={:?}",
                taxa,
                canais,
                amostra
            );
            let inicializado = cliente.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                BUFFER_100NS,
                0,
                formato_ptr,
                None,
            );
            CoTaskMemFree(Some(formato_ptr as *const c_void));
            inicializado.inspect_err(|e| {
                log::warn!("tela-audio: Initialize do dispositivo padrão falhou: {e}")
            })?;
            let amostra = amostra.ok_or_else(|| {
                log::warn!(
                    "tela-audio: formato do mixer não suportado (taxa={} canais={})",
                    taxa,
                    canais
                );
                ErroDeAudio::Falha
            })?;

            let captura: IAudioCaptureClient = cliente.GetService()?;
            let quadros_no_buffer = cliente.GetBufferSize()?;
            cliente.Start()?;

            Ok(Self {
                cliente,
                captura,
                canais,
                amostra,
                reamostrador: Reamostrador::new(taxa, TAXA),
                quadros_no_buffer,
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
            // O ponteiro e o número vêm do motor de áudio; um `lidos` maior
            // que o buffer (ou uma conta que estoura) faria o `from_raw_parts`
            // abaixo ler fora da memória dele e derrubar o app. Devolve o
            // pacote sem ler e deixa quem chama tratar como falha.
            let tamanho = n
                .checked_mul(canais)
                .and_then(|x| x.checked_mul(bytes_por_amostra));
            let tamanho = match tamanho {
                Some(t) if lidos <= self.quadros_no_buffer => t,
                _ => {
                    log::error!(
                        "tela-audio: pacote de tamanho inválido: lidos={} quadros_no_buffer={} canais={}",
                        lidos,
                        self.quadros_no_buffer,
                        canais
                    );
                    unsafe {
                        let _ = self.captura.ReleaseBuffer(lidos);
                    }
                    return Err(ErroDeAudio::Falha);
                }
            };
            let silencio = flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0;
            // Estéreo na taxa do mixer, antes de reamostrar.
            let mut estereo: Vec<i16> = Vec::with_capacity(n * 2);
            if silencio || dados.is_null() {
                estereo.resize(n * 2, 0);
            } else {
                let bruto = unsafe { std::slice::from_raw_parts(dados, tamanho) };
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
    /// Os parâmetros que `ActivateAudioInterfaceAsync` recebeu por ponteiro.
    /// Moram aqui porque o aviso é a única coisa que o Windows garante manter
    /// viva até a ativação terminar; nunca são lidos pelo Rust.
    _parametros: DonoDosParametros,
}

/// `params` e o `PROPVARIANT` que aponta para ele, juntos num endereço fixo
/// do heap: o blob do `prop` é um ponteiro para o `params` ao lado.
struct ParametrosDeAtivacao {
    params: AUDIOCLIENT_ACTIVATION_PARAMS,
    prop: ManuallyDrop<PROPVARIANT>,
}

/// Posse de um `ParametrosDeAtivacao` vindo de `Box::into_raw`. Ponteiro cru
/// em vez de `Box` para o endereço entregue ao Windows não depender de a
/// `Box` nunca ser movida. O `PROPVARIANT` do crate implementa `Drop` com
/// `PropVariantClear`, que num `VT_BLOB` chama `CoTaskMemFree` no
/// `pBlobData` — aqui um endereço no meio da nossa `Box`, não memória do
/// alocador do COM — e corrompe o heap (0xC0000374, processo derrubado).
/// Por isso `prop` é `ManuallyDrop`: liberar a `Box` não toca no blob.
struct DonoDosParametros(*mut ParametrosDeAtivacao);

impl Drop for DonoDosParametros {
    fn drop(&mut self) {
        // SAFETY: veio de `Box::into_raw` e só este dono o libera, uma vez.
        unsafe { drop(Box::from_raw(self.0)) };
    }
}

impl IActivateAudioInterfaceCompletionHandler_Impl for AvisoDeAtivacao_Impl {
    fn ActivateCompleted(
        &self,
        _operacao: Ref<IActivateAudioInterfaceAsyncOperation>,
    ) -> windows::core::Result<()> {
        // Um pânico aqui desenrolaria para dentro do `extern "system"` do
        // Windows (UB, na prática o processo cai). `send` não entra em pânico;
        // isto é o cinto de segurança, como em `macos.rs`.
        if catch_unwind(AssertUnwindSafe(|| {
            let _ = self.tx.send(());
        }))
        .is_err()
        {
            log::error!(
                "tela-audio: pânico ao notificar conclusão da ativação do process loopback"
            );
        }
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
