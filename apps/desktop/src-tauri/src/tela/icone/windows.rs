//! Ícone do executável de uma janela, como data URL PNG — a metade Windows
//! do `icone`, onde a chave é o caminho do `.exe`.
//!
//! É enfeite, e o código trata como tal: **toda** falha vira `None` e a web
//! desenha um genérico. Ícone é o que mais varia entre programas — monocromático
//! de aplicativo antigo, sem canal alfa, com máscara, ausente — e nenhuma dessas
//! variações justifica derrubar a listagem inteira de fontes.

use std::ffi::c_void;

use base64::Engine as _;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder};
use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::UI::Shell::ExtractIconExW;
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

/// Ícone grande do executável em `caminho`, pronto para `<img src>`.
pub fn do_executavel(caminho: &str) -> Option<String> {
    let mut wide: Vec<u16> = caminho.encode_utf16().collect();
    wide.push(0);

    let mut grande = HICON::default();
    // Só o grande (32×32): a grade do seletor mostra o ícone a 20px lógicos, e
    // em tela HiDPI o pequeno (16×16) chegaria borrado.
    let quantos = unsafe { ExtractIconExW(PCWSTR(wide.as_ptr()), 0, Some(&mut grande), None, 1) };
    if quantos == 0 || grande.is_invalid() {
        return None;
    }

    let png = converter(grande);
    unsafe {
        let _ = DestroyIcon(grande);
    }

    let png = png?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}

fn converter(hicon: HICON) -> Option<Vec<u8>> {
    unsafe {
        let mut info = ICONINFO::default();
        GetIconInfo(hicon, &mut info).ok()?;

        // A partir daqui os dois bitmaps são nossos: o `GetIconInfo` cria
        // cópias e quem chamou é que apaga.
        let resultado = rgba_do_icone(&info);
        if !info.hbmColor.is_invalid() {
            let _ = DeleteObject(info.hbmColor.into());
        }
        if !info.hbmMask.is_invalid() {
            let _ = DeleteObject(info.hbmMask.into());
        }

        let (largura, altura, rgba) = resultado?;
        let mut png = Vec::new();
        PngEncoder::new(&mut png)
            .write_image(&rgba, largura, altura, ExtendedColorType::Rgba8)
            .ok()?;
        Some(png)
    }
}

fn rgba_do_icone(info: &ICONINFO) -> Option<(u32, u32, Vec<u8>)> {
    // Ícone monocromático puro não tem bitmap de cor — o desenho inteiro mora
    // na máscara, em duas cores. Não vale o código: cai no genérico.
    if info.hbmColor.is_invalid() {
        return None;
    }

    let mut bm = BITMAP::default();
    let lidos = unsafe {
        GetObjectW(
            info.hbmColor.into(),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut c_void),
        )
    };
    if lidos == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
        return None;
    }
    let largura = bm.bmWidth as u32;
    let altura = bm.bmHeight as u32;

    let mut rgba = bits_bgra(info.hbmColor, largura, altura)?;
    for px in rgba.as_chunks_mut::<4>().0 {
        px.swap(0, 2); // BGRA do GDI → RGBA do PNG
    }

    // Ícone antigo guarda a transparência na máscara e deixa o alfa zerado —
    // sem esta correção ele sairia invisível, que é pior que sair sem ícone.
    if rgba.as_chunks::<4>().0.iter().all(|px| px[3] == 0) {
        aplicar_mascara(&mut rgba, info.hbmMask, largura, altura);
    }

    Some((largura, altura, rgba))
}

/// Na máscara, preto é opaco e branco é transparente. Sem máscara legível o
/// ícone vira opaco inteiro: uma moldura quadrada é feia, mas é visível.
fn aplicar_mascara(rgba: &mut [u8], hbm_mascara: HBITMAP, largura: u32, altura: u32) {
    let mascara = if hbm_mascara.is_invalid() {
        None
    } else {
        bits_bgra(hbm_mascara, largura, altura)
    };
    match mascara {
        Some(m) => {
            for (px, mp) in rgba
                .as_chunks_mut::<4>()
                .0
                .iter_mut()
                .zip(m.as_chunks::<4>().0)
            {
                px[3] = if mp[0] == 0 && mp[1] == 0 && mp[2] == 0 {
                    255
                } else {
                    0
                };
            }
        }
        None => {
            for px in rgba.as_chunks_mut::<4>().0 {
                px[3] = 255;
            }
        }
    }
}

/// Lê um HBITMAP como BGRA de cima para baixo.
///
/// A altura negativa no cabeçalho é o que pede a ordem de cima para baixo: o
/// DIB nasceu de baixo para cima, e sem isto o ícone sai de cabeça para baixo.
fn bits_bgra(hbm: HBITMAP, largura: u32, altura: u32) -> Option<Vec<u8>> {
    let mut cabecalho = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: largura as i32,
            biHeight: -(altura as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let mut buf = vec![0u8; (largura as usize) * (altura as usize) * 4];
    unsafe {
        let hdc = GetDC(None);
        if hdc.is_invalid() {
            return None;
        }
        let linhas = GetDIBits(
            hdc,
            hbm,
            0,
            altura,
            Some(buf.as_mut_ptr() as *mut c_void),
            &mut cabecalho,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, hdc);
        if linhas == 0 {
            return None;
        }
    }
    Some(buf)
}
