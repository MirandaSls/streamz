//! A "atenuação de comunicações" do Windows, desligada enquanto há call.
//!
//! **O defeito.** Com o Streamz numa call, o Windows abaixava o volume do
//! Discord, do Spotify e do resto — o padrão do Painel de som → Comunicações é
//! "Reduzir o volume de outros sons em 80%". Quem dispara é o microfone do
//! WebView2: o Chromium abre toda captura WASAPI com
//! `IAudioClient2::SetClientProperties(eCategory = AudioCategory_Communications)`
//! (`media/audio/win/audio_low_latency_input_win.cc`,
//! `SetCommunicationsCategoryAndMaybeRawCaptureMode`, chamada no `Open()` de
//! todo microfone que anuncia `RawProcessingSupported`, ou seja, quase todos).
//! O comentário do próprio Chromium: "AudioCategory_Communications opts us in
//! to communications policy" — e a política de comunicações é o ducking.
//!
//! **Por que não dá para desligar só o nosso stream.** A API certa seria
//! `IAudioClientDuckingControl::SetDuckingOptionsForCurrentStream(
//! AUDIO_DUCKING_OPTIONS_DO_NOT_DUCK_OTHER_STREAMS)`, mas ela é do
//! `IAudioClient` do próprio stream, e esse vive no processo de áudio do
//! WebView2 — o Chromium não a chama e não há argumento de linha de comando
//! que troque a categoria (`--force-wave-audio` só vale para a saída). O
//! `IAudioSessionControl2::SetDuckingPreference(TRUE)` é o contrário do que
//! parece: é o app **atenuado** que se exclui, e só vale depois que o stream
//! dele reinicia — não é algo que o Streamz possa fazer pelo Discord.
//!
//! **O que sobra** é a própria preferência do usuário, a mesma que a aba
//! Comunicações do `mmsys.cpl` grava:
//! `HKCU\Software\Microsoft\Multimedia\Audio\UserDuckingPreference` (DWORD:
//! 0 silenciar, 1 reduzir 80%, 2 reduzir 50%, 3 não fazer nada; ausente =
//! reduzir 80%). Ela passa a "não fazer nada" **só enquanto há uma call** e
//! volta ao valor de antes na saída. Três cuidados:
//!
//! - a volta só acontece se o valor ainda for o 3 que escrevemos: se a pessoa
//!   mexeu no painel durante a call, a escolha dela vale;
//! - o valor original vai para um arquivo **antes** de a preferência mudar, e o
//!   `setup` o restaura na próxima abertura — um app derrubado no meio da call
//!   não deixa o Windows sem ducking para sempre;
//! - quem já escolheu "não fazer nada" não é tocado.
//!
//! A regra é pura e testada (`Ambiente` é o registro e o arquivo); o registro
//! real só existe no Windows. Nos outros alvos os comandos não fazem nada.

use std::sync::Mutex;

/// "Quando o Windows detectar atividade de comunicação: não fazer nada."
pub const NAO_FAZER_NADA: u32 = 3;

/// O que a preferência era antes de o Streamz mexer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Original {
    /// O valor não existia (o Windows usa o padrão, reduzir 80%).
    Ausente,
    Valor(u32),
}

impl Original {
    pub fn codificar(self) -> String {
        match self {
            Original::Ausente => "ausente".into(),
            Original::Valor(v) => v.to_string(),
        }
    }

    pub fn decodificar(texto: &str) -> Option<Self> {
        match texto.trim() {
            "ausente" => Some(Original::Ausente),
            t => t.parse().ok().map(Original::Valor),
        }
    }
}

/// Qualquer falha do registro ou do arquivo. Sem detalhe de propósito: tudo
/// aqui é best-effort, e quem chama só decide entre seguir e desistir.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Falha;

/// O registro e o arquivo de marca.
pub trait Ambiente {
    fn ler_preferencia(&self) -> Result<Option<u32>, Falha>;
    fn gravar_preferencia(&self, valor: u32) -> Result<(), Falha>;
    fn apagar_preferencia(&self) -> Result<(), Falha>;
    fn ler_marca(&self) -> Option<String>;
    fn gravar_marca(&self, texto: &str) -> Result<(), Falha>;
    fn apagar_marca(&self);
}

/// Estado do processo: `Some` enquanto a preferência está trocada por nós.
#[derive(Default)]
pub struct Atenuacao {
    original: Mutex<Option<Original>>,
}

impl Atenuacao {
    /// Começo da call: a preferência vira "não fazer nada". Idempotente.
    pub fn suspender(&self, amb: &impl Ambiente) {
        let mut original = self.original.lock().unwrap_or_else(|e| e.into_inner());
        if original.is_some() {
            return;
        }
        let atual = match amb.ler_preferencia() {
            Ok(Some(NAO_FAZER_NADA)) | Err(Falha) => return,
            Ok(Some(v)) => Original::Valor(v),
            Ok(None) => Original::Ausente,
        };
        // a marca primeiro: se o processo morrer entre as duas escritas, a
        // próxima abertura ainda sabe o que devolver
        if amb.gravar_marca(&atual.codificar()).is_err() {
            return;
        }
        if amb.gravar_preferencia(NAO_FAZER_NADA).is_ok() {
            *original = Some(atual);
        } else {
            amb.apagar_marca();
        }
    }

    /// Fim da call (ou saída do app): devolve o valor de antes.
    pub fn restaurar(&self, amb: &impl Ambiente) {
        let mut original = self.original.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(anterior) = original.take() {
            devolver(amb, anterior);
            amb.apagar_marca();
        }
    }

    /// Abertura do app: uma marca que sobrou é de um processo que morreu no
    /// meio da call.
    pub fn recuperar(&self, amb: &impl Ambiente) {
        let Some(texto) = amb.ler_marca() else {
            return;
        };
        if let Some(anterior) = Original::decodificar(&texto) {
            devolver(amb, anterior);
        }
        amb.apagar_marca();
    }
}

fn devolver(amb: &impl Ambiente, anterior: Original) {
    // só desfaz o que ainda é nosso: outro valor é escolha da pessoa
    if amb.ler_preferencia() != Ok(Some(NAO_FAZER_NADA)) {
        return;
    }
    let _ = match anterior {
        Original::Ausente => amb.apagar_preferencia(),
        Original::Valor(v) => amb.gravar_preferencia(v),
    };
}

/// O ambiente de verdade: o registro do usuário e um arquivo na pasta local
/// do app.
#[cfg(windows)]
pub struct Real {
    pub marca: std::path::PathBuf,
}

#[cfg(windows)]
mod registro {
    use std::ffi::c_void;

    use super::Falha;
    use windows::core::w;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows::Win32::System::Registry::{
        RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_DWORD,
        RRF_RT_REG_DWORD,
    };

    const CHAVE: windows::core::PCWSTR = w!("Software\\Microsoft\\Multimedia\\Audio");
    const VALOR: windows::core::PCWSTR = w!("UserDuckingPreference");

    pub fn ler() -> Result<Option<u32>, Falha> {
        let mut dado = 0u32;
        let mut tamanho = std::mem::size_of::<u32>() as u32;
        let r = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                CHAVE,
                VALOR,
                RRF_RT_REG_DWORD,
                None,
                Some(std::ptr::from_mut(&mut dado).cast::<c_void>()),
                Some(&mut tamanho),
            )
        };
        match r {
            ERROR_SUCCESS => Ok(Some(dado)),
            ERROR_FILE_NOT_FOUND => Ok(None),
            _ => Err(Falha),
        }
    }

    pub fn gravar(valor: u32) -> Result<(), Falha> {
        let r = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                CHAVE,
                VALOR,
                REG_DWORD.0,
                Some(std::ptr::from_ref(&valor).cast::<c_void>()),
                std::mem::size_of::<u32>() as u32,
            )
        };
        if r == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(Falha)
        }
    }

    pub fn apagar() -> Result<(), Falha> {
        let r = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, CHAVE, VALOR) };
        if r == ERROR_SUCCESS || r == ERROR_FILE_NOT_FOUND {
            Ok(())
        } else {
            Err(Falha)
        }
    }
}

#[cfg(windows)]
impl Ambiente for Real {
    fn ler_preferencia(&self) -> Result<Option<u32>, Falha> {
        registro::ler()
    }
    fn gravar_preferencia(&self, valor: u32) -> Result<(), Falha> {
        registro::gravar(valor)
    }
    fn apagar_preferencia(&self) -> Result<(), Falha> {
        registro::apagar()
    }
    fn ler_marca(&self) -> Option<String> {
        std::fs::read_to_string(&self.marca).ok()
    }
    fn gravar_marca(&self, texto: &str) -> Result<(), Falha> {
        if let Some(pasta) = self.marca.parent() {
            std::fs::create_dir_all(pasta).map_err(|_| Falha)?;
        }
        std::fs::write(&self.marca, texto).map_err(|_| Falha)
    }
    fn apagar_marca(&self) {
        let _ = std::fs::remove_file(&self.marca);
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Falso {
        pref: RefCell<Option<u32>>,
        marca: RefCell<Option<String>>,
        falha_marca: bool,
    }

    impl Ambiente for Falso {
        fn ler_preferencia(&self) -> Result<Option<u32>, Falha> {
            Ok(*self.pref.borrow())
        }
        fn gravar_preferencia(&self, valor: u32) -> Result<(), Falha> {
            *self.pref.borrow_mut() = Some(valor);
            Ok(())
        }
        fn apagar_preferencia(&self) -> Result<(), Falha> {
            *self.pref.borrow_mut() = None;
            Ok(())
        }
        fn ler_marca(&self) -> Option<String> {
            self.marca.borrow().clone()
        }
        fn gravar_marca(&self, texto: &str) -> Result<(), Falha> {
            if self.falha_marca {
                return Err(Falha);
            }
            *self.marca.borrow_mut() = Some(texto.into());
            Ok(())
        }
        fn apagar_marca(&self) {
            *self.marca.borrow_mut() = None;
        }
    }

    #[test]
    fn ausente_vira_nada_e_volta_a_ausente() {
        let amb = Falso::default();
        let a = Atenuacao::default();
        a.suspender(&amb);
        assert_eq!(*amb.pref.borrow(), Some(NAO_FAZER_NADA));
        assert_eq!(amb.marca.borrow().as_deref(), Some("ausente"));
        a.suspender(&amb); // idempotente
        a.restaurar(&amb);
        assert_eq!(*amb.pref.borrow(), None);
        assert_eq!(*amb.marca.borrow(), None);
    }

    #[test]
    fn valor_escolhido_volta() {
        let amb = Falso {
            pref: RefCell::new(Some(2)),
            ..Default::default()
        };
        let a = Atenuacao::default();
        a.suspender(&amb);
        assert_eq!(*amb.pref.borrow(), Some(3));
        a.restaurar(&amb);
        assert_eq!(*amb.pref.borrow(), Some(2));
    }

    #[test]
    fn quem_ja_tem_nada_nao_e_tocado() {
        let amb = Falso {
            pref: RefCell::new(Some(3)),
            ..Default::default()
        };
        let a = Atenuacao::default();
        a.suspender(&amb);
        assert_eq!(*amb.marca.borrow(), None);
        a.restaurar(&amb);
        assert_eq!(*amb.pref.borrow(), Some(3));
    }

    #[test]
    fn mudanca_da_pessoa_durante_a_call_vale() {
        let amb = Falso::default();
        let a = Atenuacao::default();
        a.suspender(&amb);
        *amb.pref.borrow_mut() = Some(0);
        a.restaurar(&amb);
        assert_eq!(*amb.pref.borrow(), Some(0));
        assert_eq!(*amb.marca.borrow(), None);
    }

    #[test]
    fn sem_marca_nao_mexe_no_registro() {
        let amb = Falso {
            pref: RefCell::new(Some(1)),
            falha_marca: true,
            ..Default::default()
        };
        let a = Atenuacao::default();
        a.suspender(&amb);
        assert_eq!(*amb.pref.borrow(), Some(1));
    }

    #[test]
    fn recupera_depois_de_uma_queda() {
        let amb = Falso::default();
        Atenuacao::default().suspender(&amb); // o processo "morre" aqui
        Atenuacao::default().recuperar(&amb);
        assert_eq!(*amb.pref.borrow(), None);
        assert_eq!(*amb.marca.borrow(), None);
    }

    #[test]
    fn codificacao_ida_e_volta() {
        for o in [Original::Ausente, Original::Valor(0), Original::Valor(2)] {
            assert_eq!(Original::decodificar(&o.codificar()), Some(o));
        }
        assert_eq!(Original::decodificar("lixo"), None);
    }
}
