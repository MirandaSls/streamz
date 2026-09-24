//! Ícone do aplicativo dono de uma janela, como data URL PNG — a metade macOS
//! do `icone`, onde a chave é o pid do processo.
//!
//! Mesma regra da metade Windows: é enfeite, **toda** falha vira `None` e a
//! web desenha um genérico. Nada aqui pode derrubar a listagem de fontes.

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};

use base64::Engine as _;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder};
use objc2::rc::autoreleasepool;
use objc2_app_kit::NSRunningApplication;
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{CGBitmapContextCreate, CGColorSpace, CGContext, CGImageAlphaInfo};

/// Lado do ícone em pixels. 32 pelo mesmo motivo do Windows: a grade mostra
/// a 20px lógicos, e em tela Retina um de 16 chegaria borrado.
const LADO: usize = 32;

/// Cache por pid, guardando também o `None`: a listagem de fontes é refeita a
/// cada poucos segundos com o seletor aberto, e rasterizar o mesmo ícone (ou
/// falhar de novo no mesmo processo sem ícone) toda vez é trabalho jogado fora.
static CACHE: OnceLock<Mutex<HashMap<i32, Option<String>>>> = OnceLock::new();

/// Ícone do aplicativo do processo `pid`, pronto para `<img src>`.
pub fn do_pid(pid: i32) -> Option<String> {
    if pid <= 0 {
        return None;
    }
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    // Mutex envenenado não é motivo para perder o ícone: o mapa continua
    // coerente (só guarda resultados prontos), então segue com ele.
    if let Some(pronto) = cache.lock().unwrap_or_else(|e| e.into_inner()).get(&pid) {
        return pronto.clone();
    }

    let url = gerar(pid);
    cache
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(pid, url.clone());
    url
}

fn gerar(pid: i32) -> Option<String> {
    // Chamado de threads do tokio, que não têm pool de autorelease: sem este,
    // o que o AppKit devolve autoliberado ficaria vazando a cada listagem.
    let rgba = autoreleasepool(|_| rgba_do_pid(pid))?;

    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(&rgba, LADO as u32, LADO as u32, ExtendedColorType::Rgba8)
        .ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}

/// Rasteriza o ícone do app a 32×32 e devolve RGBA **não** pré-multiplicado,
/// que é o que o PNG espera.
fn rgba_do_pid(pid: i32) -> Option<Vec<u8>> {
    let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)?;
    let icone = app.icon()?;

    // O NSImage de ícone carrega várias representações (16 a 1024); pedir o
    // CGImage já no tamanho final faz o AppKit escolher a mais próxima, em vez
    // de reduzir a de 1024 aqui.
    let lado = LADO as f64;
    let mut rect = CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(lado, lado));
    // SAFETY: `rect` é um ponteiro válido durante a chamada; contexto e dicas
    // nulos são aceitos pela API.
    let cg = unsafe { icone.CGImageForProposedRect_context_hints(&mut rect, None, None) }?;

    let espaco = CGColorSpace::new_device_rgb()?;
    let mut buf = vec![0u8; LADO * LADO * 4];
    {
        // SAFETY: `buf` tem exatamente LADO × LADO × 4 bytes, vive mais que o
        // contexto (que sai de escopo neste bloco) e não é tocado enquanto ele
        // existe. 8 bits por componente, 4 componentes, sem folga por linha.
        let ctx = unsafe {
            CGBitmapContextCreate(
                buf.as_mut_ptr() as *mut c_void,
                LADO,
                LADO,
                8,
                LADO * 4,
                Some(&*espaco),
                CGImageAlphaInfo::PremultipliedLast.0,
            )
        }?;
        // O buffer começa zerado — transparente —, então o que o ícone não
        // cobrir continua transparente no PNG.
        CGContext::draw_image(
            Some(&*ctx),
            CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(lado, lado)),
            Some(&*cg),
        );
    }

    // O CoreGraphics só desenha em alfa pré-multiplicado; sem desfazer, as
    // bordas suavizadas do ícone sairiam escurecidas no PNG.
    for px in buf.chunks_exact_mut(4) {
        let a = px[3] as u32;
        if a > 0 && a < 255 {
            for c in &mut px[..3] {
                *c = ((*c as u32) * 255 / a).min(255) as u8;
            }
        }
    }

    Some(buf)
}
