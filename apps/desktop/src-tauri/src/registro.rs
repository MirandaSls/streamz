//! Rastro para quando o app fecha sozinho.
//!
//! Por que existe: o release do Windows é `windows_subsystem = "windows"` —
//! sem console, o stderr não vai para lugar nenhum — e até aqui não havia
//! logger nem panic hook. Um crash durante o compartilhamento de tela sumia sem
//! deixar nada que o usuário pudesse nos mandar.
//!
//! Três camadas, da mais rica para a mais crua:
//!
//! 1. **Log em arquivo** (`tauri-plugin-log`): tudo que o código registra com
//!    `log::info!`/`warn!`/`error!`. Fica no diretório de log do app — no
//!    Windows `%LOCALAPPDATA%\dev.streamz.app\logs\streamz.log`; no macOS
//!    `~/Library/Logs/dev.streamz.app/`; no Linux
//!    `~/.local/share/dev.streamz.app/logs/`.
//! 2. **Panic hook**: panic do Rust vira uma linha `error` com thread, local,
//!    mensagem e backtrace, gravada *antes* de o processo morrer.
//! 3. **Filtro de exceção não tratada** (só Windows): crash nativo (acesso
//!    inválido dentro do libwebrtc, do driver de vídeo, da captura…) vira uma
//!    linha em `crash.txt`, na mesma pasta, com o código da exceção e a DLL
//!    onde ela aconteceu.

use log::LevelFilter;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// Tamanho a partir do qual o `streamz.log` é rotacionado. 5 MB dá dias de uso
/// normal e ainda cabe num anexo de e-mail.
const TAMANHO_MAXIMO_DO_LOG: u128 = 5 * 1024 * 1024;

/// Quantos arquivos antigos a rotação guarda além do atual. O crash costuma ser
/// o fim do arquivo corrente, mas o usuário pode ter reaberto o app (e gerado
/// log novo) antes de nos mandar.
const ARQUIVOS_GUARDADOS: usize = 4;

/// O plugin de log: arquivo `streamz.log` no diretório de log do app, mais o
/// stdout (que é o que se vê no `tauri dev`).
pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        // O padrão do plugin é stdout + um arquivo com o nome do app; trocamos
        // pelo nome fixo, que é o que vamos pedir ao usuário.
        .clear_targets()
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::LogDir {
            file_name: Some("streamz".into()),
        }))
        .level(LevelFilter::Info)
        // O SDK do LiveKit em Info conta a vida da sala (conexão, publicação,
        // reconexão) — exatamente o que queremos ao lado da captura.
        .level_for("livekit", LevelFilter::Info)
        .level_for("livekit_api", LevelFilter::Warn)
        .level_for("livekit_protocol", LevelFilter::Warn)
        // O resto é ruído em Info: estatística de WebRTC, laço de eventos da
        // janela, HTTP/TLS/WebSocket de cada requisição.
        .level_for("libwebrtc", LevelFilter::Warn)
        .level_for("webrtc_sys", LevelFilter::Warn)
        .level_for("tao", LevelFilter::Warn)
        .level_for("wry", LevelFilter::Warn)
        .level_for("hyper", LevelFilter::Warn)
        .level_for("hyper_util", LevelFilter::Warn)
        .level_for("reqwest", LevelFilter::Warn)
        .level_for("tungstenite", LevelFilter::Warn)
        .level_for("tokio_tungstenite", LevelFilter::Warn)
        .level_for("rustls", LevelFilter::Warn)
        .level_for("native_tls", LevelFilter::Warn)
        .max_file_size(TAMANHO_MAXIMO_DO_LOG)
        .rotation_strategy(RotationStrategy::KeepSome(ARQUIVOS_GUARDADOS))
        // Hora local: é a que o usuário vai citar ("fechou às 21h").
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}

/// Panic hook, filtro de exceção (Windows) e a linha de boot. Chamado como
/// primeira coisa do `setup`, depois de o plugin de log já ter instalado o
/// logger.
pub fn instalar_ganchos<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    // Instalar duas vezes encadearia o hook/filtro em si mesmo (o "anterior"
    // passaria a ser o nosso) — recursão infinita no primeiro crash.
    static UMA_VEZ: std::sync::Once = std::sync::Once::new();
    UMA_VEZ.call_once(|| {
        let versao = app.package_info().version.to_string();
        instalar_panic_hook();

        let dir = match app.path().app_log_dir() {
            Ok(dir) => Some(dir),
            Err(e) => {
                log::warn!("não foi possível resolver o diretório de log: {e}");
                None
            }
        };

        // A primeira linha de cada sessão: versão e sistema, para cruzar com o
        // relato, e onde está a pasta, para quem estiver lendo o stdout.
        log::info!(
            "streamz {versao} iniciando em {} {} ({}); logs em {}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            std::env::consts::FAMILY,
            dir.as_deref()
                .map(|d| d.display().to_string())
                .unwrap_or_else(|| "<desconhecido>".into()),
        );

        #[cfg(windows)]
        {
            if let Some(dir) = &dir {
                // O plugin cria a pasta ao abrir o arquivo, mas não dependemos
                // da ordem em que ele faz isso.
                match std::fs::create_dir_all(dir) {
                    Ok(()) => crash::instalar(dir, &versao),
                    Err(e) => log::warn!(
                        "não foi possível criar {}: {e}; crash.txt desativado",
                        dir.display()
                    ),
                }
            }
        }
    });
}

/// Registra todo panic no log antes de repassar ao hook anterior.
///
/// Por que chamar o anterior: o padrão da std imprime no stderr (é o que se vê
/// no `tauri dev`), e se alguma crate tiver instalado o próprio hook ela
/// continua funcionando. O nosso roda primeiro porque o anterior pode abortar.
///
/// Isto também cobre o caso 0xC0000409 (`STATUS_STACK_BUFFER_OVERRUN`, que o
/// Windows usa para `__fastfail`): um panic que atravessa um callback
/// `extern "system"` (captura, WASAPI, WebView2) aborta o processo pelo
/// `__fastfail`, que **não** passa pelo filtro de exceção — mas o hook roda
/// antes do abort, então a causa já está no arquivo.
fn instalar_panic_hook() {
    let anterior = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let nome = thread.name().unwrap_or("<sem nome>");
        let local = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<local desconhecido>".into());
        let payload = info.payload();
        let mensagem = if let Some(s) = payload.downcast_ref::<&str>() {
            *s
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.as_str()
        } else {
            "<payload não textual>"
        };
        // `force_capture`: sem isso o backtrace depende de `RUST_BACKTRACE`,
        // que nenhum usuário tem ligado.
        let backtrace = std::backtrace::Backtrace::force_capture();
        log::error!("panic na thread '{nome}' em {local}: {mensagem}\n{backtrace}");
        // O processo pode morrer logo a seguir; o que ficou no buffer se perde.
        log::logger().flush();
        anterior(info);
    }));
}

/// O filtro de exceção não tratada do Windows e o `crash.txt`.
///
/// O filtro roda num processo **já corrompido**: o heap pode estar quebrado, o
/// logger pode estar com a trava presa pela própria thread que falhou, a pilha
/// pode estar quase no fim (estouro de pilha). Por isso nada ali aloca, trava
/// ou passa pela std: o arquivo é aberto na instalação e o HANDLE fica num
/// static; a versão também é capturada na instalação; a linha é montada num
/// buffer fixo na pilha e vai direto para o `WriteFile` + `FlushFileBuffers`.
#[cfg(windows)]
mod crash {
    use core::ffi::c_void;
    use core::fmt::Write as _;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicUsize, Ordering};
    use std::sync::OnceLock;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HANDLE, HMODULE};
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, FlushFileBuffers, WriteFile, FILE_APPEND_DATA, FILE_ATTRIBUTE_NORMAL,
        FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_ALWAYS,
    };
    use windows::Win32::System::Diagnostics::Debug::{
        SetUnhandledExceptionFilter, EXCEPTION_CONTINUE_SEARCH, EXCEPTION_POINTERS,
    };
    use windows::Win32::System::LibraryLoader::{
        GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
    };
    use windows::Win32::System::SystemInformation::GetLocalTime;
    use windows::Win32::System::Threading::{GetCurrentProcessId, GetCurrentThreadId};

    type Filtro = unsafe extern "system" fn(*const EXCEPTION_POINTERS) -> i32;

    /// HANDLE do `crash.txt` (0 = não aberto). Nunca é fechado: vive o
    /// processo inteiro de propósito.
    static ARQUIVO: AtomicIsize = AtomicIsize::new(0);
    /// Filtro que estava instalado antes do nosso (0 = nenhum).
    static ANTERIOR: AtomicUsize = AtomicUsize::new(0);
    /// Versão do app, capturada na instalação — ler um `OnceLock` já
    /// preenchido não aloca nem trava.
    static VERSAO: OnceLock<String> = OnceLock::new();
    /// Só a primeira thread que falhar escreve: duas escrevendo ao mesmo
    /// tempo embaralhariam a linha.
    static GRAVANDO: AtomicBool = AtomicBool::new(false);

    pub fn instalar(dir: &Path, versao: &str) {
        let _ = VERSAO.set(versao.to_owned());

        let caminho = dir.join("crash.txt");
        let largo: Vec<u16> = caminho
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        // Append: cada crash acrescenta uma linha, e o arquivo de uma sessão
        // anterior não é apagado ao reabrir o app (que é o que o usuário faz
        // antes de nos mandar).
        let aberto = unsafe {
            CreateFileW(
                PCWSTR(largo.as_ptr()),
                FILE_APPEND_DATA.0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_ALWAYS,
                FILE_ATTRIBUTE_NORMAL,
                None,
            )
        };
        let handle = match aberto {
            Ok(h) => h,
            Err(e) => {
                log::warn!(
                    "não foi possível abrir {}: {e}; crash nativo não será registrado",
                    caminho.display()
                );
                return;
            }
        };
        ARQUIVO.store(handle.0 as isize, Ordering::Release);

        let anterior = unsafe { SetUnhandledExceptionFilter(Some(filtro)) };
        if let Some(f) = anterior {
            ANTERIOR.store(f as usize, Ordering::Release);
        }
        log::info!("crash nativo será registrado em {}", caminho.display());
    }

    /// O filtro em si. Depois de gravar, devolve a decisão ao filtro anterior
    /// (se havia um) ou `EXCEPTION_CONTINUE_SEARCH`, para o Windows Error
    /// Reporting seguir normalmente — o relatório do WER (e o evento no
    /// Visualizador de Eventos) continua existindo.
    ///
    /// Limites que valem saber: não roda com depurador anexado, não roda para
    /// `__fastfail` (0xC0000409, ver o panic hook) e deixa de rodar se outra
    /// biblioteca chamar `SetUnhandledExceptionFilter` depois de nós.
    unsafe extern "system" fn filtro(info: *const EXCEPTION_POINTERS) -> i32 {
        if !GRAVANDO.swap(true, Ordering::AcqRel) {
            unsafe { gravar(info) };
        }
        let anterior = ANTERIOR.load(Ordering::Acquire);
        if anterior != 0 {
            // SAFETY: o valor veio de um `Filtro` em `instalar`.
            let f: Filtro = unsafe { core::mem::transmute::<usize, Filtro>(anterior) };
            return unsafe { f(info) };
        }
        EXCEPTION_CONTINUE_SEARCH
    }

    /// Uma linha, do tipo:
    /// `2026-09-26 21:04:13.512 streamz 1.3.12 pid=1234 tid=5678
    /// código=0xC0000005 endereço=0x00007FFB12345678 módulo=webrtc.dll
    /// +0x1A2B3C acesso=leitura em 0x0000000000000010`
    unsafe fn gravar(info: *const EXCEPTION_POINTERS) {
        let bruto = ARQUIVO.load(Ordering::Acquire);
        if bruto == 0 {
            return;
        }
        let arquivo = HANDLE(bruto as *mut c_void);
        let mut linha = Linha::nova();

        let t = unsafe { GetLocalTime() };
        let _ = write!(
            linha,
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03} ",
            t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, t.wMilliseconds
        );
        let versao = VERSAO.get().map(String::as_str).unwrap_or("?");
        let _ = write!(
            linha,
            "streamz {versao} pid={} tid={} ",
            unsafe { GetCurrentProcessId() },
            unsafe { GetCurrentThreadId() }
        );

        let registro = if info.is_null() {
            core::ptr::null_mut()
        } else {
            unsafe { (*info).ExceptionRecord }
        };
        if registro.is_null() {
            let _ = linha.write_str("exceção sem EXCEPTION_RECORD");
        } else {
            let r = unsafe { &*registro };
            let codigo = r.ExceptionCode.0 as u32;
            let endereco = r.ExceptionAddress as usize;
            let _ = write!(linha, "código=0x{codigo:08X} endereço=0x{endereco:016X}");
            unsafe { escrever_modulo(&mut linha, endereco) };
            // STATUS_ACCESS_VIOLATION: [0] é a operação, [1] o endereço tocado.
            if codigo == 0xC000_0005 && r.NumberParameters >= 2 {
                let operacao = match r.ExceptionInformation[0] {
                    0 => "leitura",
                    1 => "escrita",
                    8 => "execução",
                    _ => "?",
                };
                let _ = write!(
                    linha,
                    " acesso={operacao} em 0x{:016X}",
                    r.ExceptionInformation[1]
                );
            }
        }

        let bytes = linha.terminar();
        let mut escritos = 0u32;
        let _ = unsafe { WriteFile(arquivo, Some(bytes), Some(&mut escritos), None) };
        let _ = unsafe { FlushFileBuffers(arquivo) };
    }

    /// ` módulo=<nome.dll> +0x<offset>`: com o nome e o offset dá para achar a
    /// função no símbolo da DLL depois, sem minidump.
    unsafe fn escrever_modulo(linha: &mut Linha, endereco: usize) {
        let mut modulo = HMODULE::default();
        // UNCHANGED_REFCOUNT: não mexe no contador de referências da DLL (nada
        // de `FreeLibrary` depois, que seria mais uma chamada num processo
        // quebrado).
        let achou = unsafe {
            GetModuleHandleExW(
                GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS
                    | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                PCWSTR(endereco as *const u16),
                &mut modulo,
            )
        };
        if achou.is_err() || modulo.0.is_null() {
            let _ = linha.write_str(" módulo=?");
            return;
        }
        let mut nome = [0u16; 260];
        let n = unsafe { GetModuleFileNameW(Some(modulo), &mut nome) } as usize;
        let nome = &nome[..n.min(nome.len())];
        // Só o nome do arquivo: o caminho inteiro gasta a linha e expõe a
        // pasta do usuário à toa.
        let inicio = nome
            .iter()
            .rposition(|&c| c == u16::from(b'\\') || c == u16::from(b'/'))
            .map_or(0, |i| i + 1);
        let _ = linha.write_str(" módulo=");
        for c in char::decode_utf16(nome[inicio..].iter().copied()) {
            let _ = linha.write_char(c.unwrap_or('?'));
        }
        let base = modulo.0 as usize;
        let _ = write!(linha, " +0x{:X}", endereco.wrapping_sub(base));
    }

    /// Buffer de linha na pilha, sem alocação. O que não couber é cortado —
    /// melhor meia linha do que nenhuma.
    struct Linha {
        buf: [u8; 512],
        len: usize,
    }

    impl Linha {
        /// Reserva para o `\r\n` final, que é escrito mesmo se a linha lotar.
        const RESERVA: usize = 2;

        fn nova() -> Self {
            Self {
                buf: [0; 512],
                len: 0,
            }
        }

        fn terminar(&mut self) -> &[u8] {
            self.buf[self.len] = b'\r';
            self.buf[self.len + 1] = b'\n';
            &self.buf[..self.len + 2]
        }
    }

    impl core::fmt::Write for Linha {
        fn write_str(&mut self, s: &str) -> core::fmt::Result {
            let limite = self.buf.len() - Self::RESERVA;
            let cabe = (limite - self.len).min(s.len());
            self.buf[self.len..self.len + cabe].copy_from_slice(&s.as_bytes()[..cabe]);
            self.len += cabe;
            Ok(())
        }
    }
}
