//! Enumeração de janelas e monitores no Windows — a metade Windows da
//! fachada de `fontes/mod.rs`.
//!
//! Os filtros aqui são a diferença entre uma grade parecida com a do Discord e
//! uma lista com sessenta entradas fantasma. O Windows tem muita janela de topo
//! que não é "um aplicativo": janelas de ferramenta, janelas de zero pixel que
//! aplicações usam como caixa de mensagens, e — a pior categoria — janelas
//! *cloaked*: aplicativos da Store suspensos e janelas de outra área de
//! trabalho virtual, que continuam visíveis para o `IsWindowVisible` e não
//! existem para o usuário.

use std::ffi::c_void;
use std::path::Path;

use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, MAX_PATH, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, GWL_EXSTYLE, GWL_STYLE,
    GW_OWNER, WS_CHILD, WS_EX_TOOLWINDOW,
};

use crate::tela::captura::Alvo;
use crate::tela::{Fonte, TipoDeFonte};

/// Janela menor que isto não é aplicativo: é caixa de mensagem oculta, splash
/// de um pixel, resquício de barra de ferramentas.
const MINIMO_PX: i32 = 96;

/// `MONITORINFOF_PRIMARY` do `winuser.h`. Definido aqui porque o crate
/// `windows` não gera esta constante — ela é um `#define` solto no cabeçalho,
/// e o gerador só emite o que aparece nos metadados do Win32.
const MONITOR_PRINCIPAL: u32 = 0x0000_0001;

pub fn janelas() -> Vec<Fonte> {
    let mut achadas: Vec<Fonte> = Vec::new();
    let ptr = &mut achadas as *mut Vec<Fonte> as isize;

    // SAFETY: `achadas` vive por toda a chamada de `EnumWindows`, que é
    // síncrona, e o callback é a única coisa que recebe o ponteiro.
    unsafe {
        let _ = EnumWindows(Some(visitar_janela), LPARAM(ptr));
    }

    // Alfabética por app e depois por título: a ordem do `EnumWindows` é a
    // ordem-z, que muda a cada clique — a grade dançaria entre duas aberturas
    // do seletor.
    achadas.sort_by(|a, b| {
        let app = a.app.as_deref().unwrap_or("").to_lowercase();
        let outro = b.app.as_deref().unwrap_or("").to_lowercase();
        app.cmp(&outro).then_with(|| a.titulo.cmp(&b.titulo))
    });
    achadas
}

unsafe extern "system" fn visitar_janela(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let achadas = &mut *(lparam.0 as *mut Vec<Fonte>);
    if let Some(f) = descrever_janela(hwnd) {
        achadas.push(f);
    }
    // Continuar a enumeração: parar aqui perderia todas as janelas seguintes.
    BOOL::from(true)
}

fn descrever_janela(hwnd: HWND) -> Option<Fonte> {
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() {
            return None;
        }
        // Minimizada não tem o que capturar: tanto o WGC quanto a duplicação de
        // desktop devolvem quadro vazio. Melhor não oferecer do que oferecer um
        // retângulo preto.
        if IsIconic(hwnd).as_bool() {
            return None;
        }

        let estilo = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        if estilo & WS_CHILD.0 != 0 {
            return None;
        }
        let estilo_ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        if estilo_ex & WS_EX_TOOLWINDOW.0 != 0 {
            return None;
        }
        // Janela com dono é diálogo, popup, tooltip — pertence a outra janela
        // que já está na lista.
        if GetWindow(hwnd, GW_OWNER).is_ok_and(|dono| !dono.is_invalid()) {
            return None;
        }
        if esta_cloaked(hwnd) {
            return None;
        }

        let mut r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
        let largura = r.right - r.left;
        let altura = r.bottom - r.top;
        if largura < MINIMO_PX || altura < MINIMO_PX {
            return None;
        }

        let titulo = titulo_da_janela(hwnd)?;

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        // Não oferecer o próprio Streamz: transmitir a si mesmo é o túnel de
        // espelhos, e o usuário nunca quer isso.
        if pid == GetCurrentProcessId() {
            return None;
        }

        let executavel = caminho_do_processo(pid);
        let app = executavel.as_deref().and_then(nome_do_app);
        let icone = executavel
            .as_deref()
            .and_then(crate::tela::icone::do_executavel);

        Some(Fonte {
            id: format!("janela:{}", hwnd.0 as isize),
            tipo: TipoDeFonte::Janela,
            titulo,
            app,
            icone,
            largura: largura as u32,
            altura: altura as u32,
            principal: false,
        })
    }
}

/// Janela *cloaked* é a que o compositor esconde sem tirar a visibilidade:
/// app da Store suspenso, janela de outra área de trabalho virtual. Sem este
/// filtro a grade enche de nomes que o usuário não vê em lugar nenhum.
fn esta_cloaked(hwnd: HWND) -> bool {
    let mut cloaked = 0u32;
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut c_void,
            std::mem::size_of::<u32>() as u32,
        )
    };
    ok.is_ok() && cloaked != 0
}

fn titulo_da_janela(hwnd: HWND) -> Option<String> {
    unsafe {
        let n = GetWindowTextLengthW(hwnd);
        if n <= 0 {
            return None;
        }
        // +1 pelo terminador que o `GetWindowTextW` escreve e não conta.
        let mut buf = vec![0u16; n as usize + 1];
        let escritos = GetWindowTextW(hwnd, &mut buf);
        if escritos <= 0 {
            return None;
        }
        let titulo = String::from_utf16_lossy(&buf[..escritos as usize]);
        let titulo = titulo.trim().to_string();
        if titulo.is_empty() {
            None
        } else {
            Some(titulo)
        }
    }
}

fn caminho_do_processo(pid: u32) -> Option<String> {
    unsafe {
        // `PROCESS_QUERY_LIMITED_INFORMATION` e não `QUERY_INFORMATION`: é o
        // direito mínimo que responde o nome da imagem, e o único que funciona
        // contra processos mais privilegiados sem elevar o Streamz.
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; MAX_PATH as usize];
        let mut tamanho = buf.len() as u32;
        let obtido = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut tamanho,
        );
        let _ = CloseHandle(handle);
        obtido.ok()?;
        Some(String::from_utf16_lossy(&buf[..tamanho as usize]))
    }
}

/// "C:\...\chrome.exe" → "chrome". O nome cru do executável é o que o Discord
/// mostra, e é mais reconhecível que o título da janela quando há cinco abas
/// do mesmo programa.
fn nome_do_app(caminho: &str) -> Option<String> {
    Path::new(caminho)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_string)
}

pub fn monitores() -> Vec<Fonte> {
    let mut achados: Vec<Fonte> = Vec::new();
    let ptr = &mut achados as *mut Vec<Fonte> as isize;

    // SAFETY: mesma garantia do `EnumWindows` — chamada síncrona, ponteiro só
    // usado pelo callback.
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(visitar_monitor), LPARAM(ptr));
    }

    // O principal primeiro; o resto na ordem em que o Windows entregou.
    achados.sort_by_key(|m| !m.principal);
    for (i, m) in achados.iter_mut().enumerate() {
        m.titulo = if m.principal {
            format!("Tela {} (principal)", i + 1)
        } else {
            format!("Tela {}", i + 1)
        };
    }
    achados
}

unsafe extern "system" fn visitar_monitor(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let achados = &mut *(lparam.0 as *mut Vec<Fonte>);

    let mut info = MONITORINFOEXW {
        monitorInfo: MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    if GetMonitorInfoW(
        hmonitor,
        &mut info as *mut MONITORINFOEXW as *mut MONITORINFO,
    )
    .as_bool()
    {
        let r = info.monitorInfo.rcMonitor;
        achados.push(Fonte {
            // O nome do dispositivo ("\\.\DISPLAY1") é estável entre chamadas,
            // ao contrário do `HMONITOR`, que muda quando um monitor é ligado.
            id: format!("monitor:{}", nome_do_dispositivo(&info.szDevice)),
            tipo: TipoDeFonte::Monitor,
            titulo: String::new(), // preenchido em `monitores`, que sabe a ordem
            app: None,
            icone: None,
            largura: (r.right - r.left) as u32,
            altura: (r.bottom - r.top) as u32,
            principal: info.monitorInfo.dwFlags & MONITOR_PRINCIPAL != 0,
        });
    }
    BOOL::from(true)
}

fn nome_do_dispositivo(sz: &[u16; 32]) -> String {
    let fim = sz.iter().position(|&c| c == 0).unwrap_or(sz.len());
    String::from_utf16_lossy(&sz[..fim])
}

/// Resolve o id de uma `Fonte` no handle que a captura precisa.
///
/// `None` quando a fonte já não existe: a janela fechou entre a enumeração e o
/// clique (e o `HWND` pode até ter sido reciclado — daí revalidar com
/// `IsWindow`), ou o monitor foi desligado. É a revalidação prometida no
/// comentário de `Fonte::id`.
pub fn alvo(id: &str) -> Option<Alvo> {
    if let Some(numero) = id.strip_prefix("janela:") {
        let hwnd = HWND(numero.parse::<isize>().ok()? as *mut c_void);
        let existe = unsafe { IsWindow(Some(hwnd)) }.as_bool();
        // O `Alvo` guarda um número opaco, não um handle tipado: é o que
        // mantém o `captura/mod.rs` sem `use windows::…`. Quem põe o número
        // aqui é este arquivo, e é ele quem o lê de volta na hora de capturar.
        // O `usize` no meio é só o tamanho natural do ponteiro — ir direto a
        // `u64` num alvo de 32 bits seria um alargamento escondido.
        return existe.then_some(Alvo::Janela(hwnd.0 as usize as u64));
    }
    let nome = id.strip_prefix("monitor:")?;
    hmonitor_do_dispositivo(nome).map(|hmonitor| Alvo::Monitor(hmonitor.0 as usize as u64))
}

/// A fonte é uma janela **minimizada**?
///
/// A enumeração já esconde as minimizadas (não há o que capturar nelas), mas
/// entre listar e clicar cabe um Win+D. Quem inicia a transmissão pergunta
/// isto antes de abrir a captura: com a janela na barra de tarefas, o WGC
/// nunca entrega um quadro e o outro lado fica em "Carregando a transmissão…"
/// para sempre. Recusar com uma frase é melhor que transmitir o nada.
pub fn minimizada(id: &str) -> bool {
    let Some(numero) = id.strip_prefix("janela:") else {
        return false;
    };
    let Ok(numero) = numero.parse::<isize>() else {
        return false;
    };
    let hwnd = HWND(numero as *mut c_void);
    unsafe { IsWindow(Some(hwnd)).as_bool() && IsIconic(hwnd).as_bool() }
}

/// O `HMONITOR` atual do dispositivo com esse nome (`\\.\DISPLAY1`). O handle
/// muda quando um monitor é ligado ou desligado, por isso a fonte guarda o
/// nome e o handle é procurado na hora.
fn hmonitor_do_dispositivo(nome: &str) -> Option<HMONITOR> {
    let mut achados: Vec<(HMONITOR, String)> = Vec::new();
    let ptr = &mut achados as *mut Vec<(HMONITOR, String)> as isize;
    // SAFETY: mesma garantia de `monitores` — chamada síncrona, ponteiro só
    // usado pelo callback.
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(visitar_hmonitor), LPARAM(ptr));
    }
    achados
        .into_iter()
        .find(|(_, dispositivo)| dispositivo == nome)
        .map(|(hmonitor, _)| hmonitor)
}

unsafe extern "system" fn visitar_hmonitor(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let achados = &mut *(lparam.0 as *mut Vec<(HMONITOR, String)>);
    let mut info = MONITORINFOEXW {
        monitorInfo: MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    if GetMonitorInfoW(
        hmonitor,
        &mut info as *mut MONITORINFOEXW as *mut MONITORINFO,
    )
    .as_bool()
    {
        achados.push((hmonitor, nome_do_dispositivo(&info.szDevice)));
    }
    BOOL::from(true)
}
