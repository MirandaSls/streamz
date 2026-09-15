//! DXGI Desktop Duplication — o backend do Windows 10.
//!
//! A duplicação é sempre do **monitor**; não existe "duplicar uma janela".
//! Compartilhar uma janela aqui é duplicar o monitor em que ela está e
//! recortar o quadro no retângulo dela, recalculado a cada quadro porque a
//! janela se move. O que estiver por cima aparece no recorte — é o preço de
//! não ter WGC sem borda, e o Discord paga o mesmo no Windows 10.
//!
//! O retângulo é o da **moldura visível** (`DWMWA_EXTENDED_FRAME_BOUNDS`), não
//! o do `GetWindowRect`: desde o Windows 10 as janelas têm uma borda invisível
//! de vários pixels para o redimensionamento, e recortar por ela levaria uma
//! tira do que está atrás em cada lado.
//!
//! **O limite de fps é um sono antes de pedir o quadro**, não um descarte
//! depois de lê-lo. A duplicação é puxada: enquanto ninguém chama
//! `AcquireNextFrame`, o Windows acumula as mudanças, e a chamada seguinte
//! devolve a tela como está agora. Dormir até o intervalo do preset custa
//! nada e não perde o último estado de uma rajada (fim de uma rolagem). A
//! textura de staging e o `Vec` do quadro são reaproveitados.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, IsIconic, IsWindow};
use windows_capture::d3d11::StagingTexture;
use windows_capture::dxgi_duplication_api::{
    DxgiDuplicationApi, DxgiDuplicationFormat, Error as ErroDxgi,
};
use windows_capture::monitor::Monitor;

use super::{copiar_sem_padding, escala, Alvo, Capturador, Erro, Quadro, Ritmo};

/// Quanto uma miniatura espera por um quadro. A primeira chamada depois de
/// criar a duplicação devolve a tela inteira quase na hora; a folga é para
/// máquina lenta.
const ESPERA_DA_MINIATURA: Duration = Duration::from_millis(300);

/// Recorte de um quadro do monitor: `(x0, y0, x1, y1)` em pixels do monitor.
type Recorte = (u32, u32, u32, u32);

/// Uma duplicação aberta de um monitor, com o alvo que ela serve.
pub struct Duplicacao {
    alvo: Alvo,
    monitor: HMONITOR,
    /// `None` entre um `AccessLost` e a recriação: o DXGI derruba a
    /// duplicação quando o desktop muda de modo (tela cheia exclusiva, troca
    /// de resolução, tela de bloqueio), e a resposta é abrir outra.
    dup: Option<Leitor>,
    ritmo: Ritmo,
    /// Origem dos instantes passados ao `ritmo`.
    origem: Instant,
    /// Buffer devolvido pelo encoder (`reciclar`), para o próximo quadro.
    livre: Vec<u8>,
}

/// A duplicação e o que vive no dispositivo D3D dela: a textura de staging
/// só serve ao dispositivo em que foi criada, então as duas nascem e morrem
/// juntas (ver `AcessoPerdido`).
struct Leitor {
    api: DxgiDuplicationApi,
    staging: Option<StagingTexture>,
    /// Esta duplicação já entregou um quadro. Até lá, todo quadro vale — o
    /// primeiro é a tela inteira, e é dele que as miniaturas vivem.
    entregou: bool,
}

// SAFETY: `HMONITOR` é um identificador opaco do sistema (ver `Alvo`), e a
// duplicação DXGI é usada por uma thread de cada vez — a que chama
// `proximo_quadro`. O D3D11 é livre de thread por contrato.
unsafe impl Send for Duplicacao {}

impl Duplicacao {
    pub fn abrir(alvo: Alvo, ritmo: Ritmo) -> Result<Self, Erro> {
        let monitor = match alvo {
            Alvo::Monitor(hmonitor) => hmonitor,
            Alvo::Janela(hwnd) => {
                validar(hwnd)?;
                unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) }
            }
        };
        let dup = criar(monitor)?;
        Ok(Self {
            alvo,
            monitor,
            dup: Some(dup),
            ritmo,
            origem: Instant::now(),
            livre: Vec::new(),
        })
    }
}

fn criar(monitor: HMONITOR) -> Result<Leitor, Erro> {
    let api = DxgiDuplicationApi::new_options(
        Monitor::from_raw_hmonitor(monitor.0),
        &[DxgiDuplicationFormat::Bgra8],
    )
    .map_err(|e| Erro::Falha(e.to_string()))?;
    Ok(Leitor {
        api,
        staging: None,
        entregou: false,
    })
}

fn validar(hwnd: HWND) -> Result<(), Erro> {
    if unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        Ok(())
    } else {
        Err(Erro::FonteSumiu)
    }
}

/// O que deu errado ao ler um quadro, separado do `Erro` público porque
/// `AcessoPerdido` não é erro para quem transmite: é "recrie e siga".
enum Leitura {
    NadaNovo,
    AcessoPerdido,
    Falha(String),
}

/// Lê um quadro da duplicação para dentro de `bgra`, devolvendo as
/// dimensões dele e o instante em que o `AcquireNextFrame` o entregou (é
/// dali, e não do fim da cópia, que o `Ritmo` conta o intervalo).
fn ler(
    leitor: &mut Leitor,
    recorte: Option<Recorte>,
    limite: Duration,
    bgra: &mut Vec<u8>,
) -> Result<(u32, u32, Instant), Leitura> {
    let limite_ms = u32::try_from(limite.as_millis()).unwrap_or(u32::MAX);
    let mut quadro = match leitor.api.acquire_next_frame(limite_ms) {
        Ok(quadro) => quadro,
        Err(ErroDxgi::Timeout) => return Err(Leitura::NadaNovo),
        Err(ErroDxgi::AccessLost) => return Err(Leitura::AcessoPerdido),
        Err(e) => return Err(Leitura::Falha(e.to_string())),
    };
    let chegou = Instant::now();
    // `LastPresentTime` zero é "só o ponteiro mexeu": a imagem da tela é a
    // mesma do quadro anterior (o DXGI não desenha o cursor nela). Mexer o
    // mouse gera um desses por vsync, e cada um custava a leitura inteira.
    if leitor.entregou && quadro.frame_info().LastPresentTime == 0 {
        return Err(Leitura::NadaNovo);
    }

    // Uma staging do tamanho do monitor serve à tela inteira e a qualquer
    // recorte dela; só muda quando o modo do monitor muda.
    let desc = *quadro.texture_desc();
    let serve = leitor.staging.as_ref().is_some_and(|s| {
        let d = s.desc();
        d.Width == desc.Width && d.Height == desc.Height && d.Format == desc.Format
    });
    if !serve {
        leitor.staging = None;
        let nova = StagingTexture::new(quadro.device(), desc.Width, desc.Height, desc.Format)
            .map_err(|e| Leitura::Falha(e.to_string()))?;
        leitor.staging = Some(nova);
    }
    let Some(staging) = leitor.staging.as_mut() else {
        return Err(Leitura::NadaNovo);
    };
    let mut buffer = match recorte {
        None => quadro.buffer_with(staging),
        Some((x0, y0, x1, y1)) => quadro.buffer_crop_with(staging, x0, y0, x1, y1),
    }
    .map_err(|e| Leitura::Falha(e.to_string()))?;
    let (largura, altura, passo) = (buffer.width(), buffer.height(), buffer.row_pitch());
    if !copiar_sem_padding(buffer.as_raw_buffer(), largura, altura, passo, bgra) {
        return Err(Leitura::NadaNovo);
    }
    leitor.entregou = true;
    Ok((largura, altura, chegou))
}

impl Capturador for Duplicacao {
    fn proximo_quadro(&mut self, limite: Duration) -> Result<Option<Quadro>, Erro> {
        // O marcapasso primeiro, e antes do recorte: a janela pode andar
        // durante o sono, e o retângulo tem de ser o da hora da leitura.
        let comeco = Instant::now();
        let falta = self.ritmo.falta(comeco - self.origem);
        if falta >= limite {
            std::thread::sleep(limite);
            return Ok(None);
        }
        if !falta.is_zero() {
            std::thread::sleep(falta);
        }
        let limite = limite.saturating_sub(comeco.elapsed());

        let recorte = match self.alvo {
            Alvo::Monitor(_) => None,
            Alvo::Janela(hwnd) => {
                validar(hwnd)?;
                // Minimizada não tem retângulo na tela. Não é erro: o usuário
                // vai restaurá-la; até lá quem transmite repete o último
                // quadro. O sono evita um laço quente enquanto isso.
                if unsafe { IsIconic(hwnd) }.as_bool() {
                    std::thread::sleep(limite);
                    return Ok(None);
                }
                let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
                if monitor != self.monitor {
                    // A janela foi arrastada para outro monitor: a
                    // duplicação atual não a vê mais.
                    self.monitor = monitor;
                    self.dup = None;
                }
                match recorte_da_janela(hwnd, monitor) {
                    Some(r) => Some(r),
                    None => {
                        std::thread::sleep(limite);
                        return Ok(None);
                    }
                }
            }
        };

        if self.dup.is_none() {
            self.dup = Some(criar(self.monitor)?);
        }
        let Some(leitor) = self.dup.as_mut() else {
            return Ok(None);
        };
        let mut bgra = std::mem::take(&mut self.livre);
        match ler(leitor, recorte, limite, &mut bgra) {
            Ok((largura, altura, chegou)) => {
                self.ritmo.marcar(chegou - self.origem);
                Ok(Some(Quadro {
                    largura,
                    altura,
                    bgra,
                }))
            }
            Err(Leitura::NadaNovo) => {
                self.livre = bgra;
                Ok(None)
            }
            Err(Leitura::AcessoPerdido) => {
                self.livre = bgra;
                self.dup = None;
                Ok(None)
            }
            Err(Leitura::Falha(m)) => Err(Erro::Falha(m)),
        }
    }

    fn reciclar(&mut self, quadro: Quadro) {
        self.livre = quadro.bgra;
    }
}

/// Retângulo da janela dentro do monitor, já cortado nas bordas dele. `None`
/// quando a janela não tem área visível nesse monitor.
fn recorte_da_janela(hwnd: HWND, monitor: HMONITOR) -> Option<Recorte> {
    let janela = moldura_visivel(hwnd)?;
    let tela = retangulo_do_monitor(monitor)?;
    let x0 = janela.left.max(tela.left);
    let y0 = janela.top.max(tela.top);
    let x1 = janela.right.min(tela.right);
    let y1 = janela.bottom.min(tela.bottom);
    // Menos que isto é uma janela quase toda fora da tela: não há o que mostrar.
    if x1 - x0 < 16 || y1 - y0 < 16 {
        return None;
    }
    Some((
        (x0 - tela.left) as u32,
        (y0 - tela.top) as u32,
        (x1 - tela.left) as u32,
        (y1 - tela.top) as u32,
    ))
}

/// A moldura que o usuário vê, sem a borda invisível de redimensionamento.
fn moldura_visivel(hwnd: HWND) -> Option<RECT> {
    let mut r = RECT::default();
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut r as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
    };
    if ok.is_err() {
        // Sem DWM (sessão remota básica) vale o retângulo clássico.
        unsafe { GetWindowRect(hwnd, &mut r) }.ok()?;
    }
    Some(r)
}

fn retangulo_do_monitor(monitor: HMONITOR) -> Option<RECT> {
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    unsafe { GetMonitorInfoW(monitor, &mut info) }
        .as_bool()
        .then_some(info.rcMonitor)
}

/// Miniaturas no DXGI: um quadro por monitor, e cada janela é um recorte
/// dele. Além de mais barato, é o único jeito — o DXGI derruba a duplicação
/// anterior quando outra é aberta no mesmo monitor.
///
/// `cancelar` para a varredura no meio: aqui isso importa ainda mais que no
/// WGC, porque **abrir uma duplicação derruba a anterior do mesmo monitor**.
/// Enquanto o seletor varre, cada miniatura tira a duplicação da transmissão
/// que está começando debaixo dela; parar a varredura no clique é o que evita
/// essa cabo de guerra.
pub fn miniaturas(alvos: &[Alvo], cancelar: &AtomicBool) -> Vec<Option<Vec<u8>>> {
    let mut saida: Vec<Option<Vec<u8>>> = vec![None; alvos.len()];
    let mut quadros: Vec<(HMONITOR, Option<Quadro>)> = Vec::new();

    for (i, alvo) in alvos.iter().enumerate() {
        if cancelar.load(Ordering::Acquire) {
            break;
        }
        let monitor = match *alvo {
            Alvo::Monitor(hmonitor) => hmonitor,
            Alvo::Janela(hwnd) => {
                if validar(hwnd).is_err() || unsafe { IsIconic(hwnd) }.as_bool() {
                    continue;
                }
                unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) }
            }
        };
        let quadro = match quadros.iter().position(|(m, _)| *m == monitor) {
            Some(pos) => &quadros[pos].1,
            None => {
                quadros.push((monitor, um_quadro_do_monitor(monitor)));
                &quadros[quadros.len() - 1].1
            }
        };
        let Some(quadro) = quadro else {
            continue;
        };
        saida[i] = match *alvo {
            Alvo::Monitor(_) => escala::jpeg(quadro),
            Alvo::Janela(hwnd) => recorte_da_janela(hwnd, monitor)
                .and_then(|(x0, y0, x1, y1)| escala::recortar(quadro, x0, y0, x1, y1))
                .and_then(|parte| escala::jpeg(&parte)),
        };
    }
    saida
}

fn um_quadro_do_monitor(monitor: HMONITOR) -> Option<Quadro> {
    let mut dup = Duplicacao::abrir(Alvo::Monitor(monitor), Ritmo::livre()).ok()?;
    // A primeira leitura pode voltar vazia enquanto a duplicação assenta; a
    // segunda é a que traz a tela.
    for _ in 0..2 {
        if let Ok(Some(quadro)) = dup.proximo_quadro(ESPERA_DA_MINIATURA) {
            return Some(quadro);
        }
    }
    None
}
