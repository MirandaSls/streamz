//! Recorte e redução de quadros para as miniaturas da grade.
//!
//! A grade mostra cada fonte em 440×248 pontos lógicos; 480 pixels de largura
//! é o suficiente para isso sem ficar borrado, e um JPEG desse tamanho pesa
//! uns 15 KB — vinte janelas atualizadas a cada segundo passam pelo IPC do
//! webview sem esforço. PNG pesaria dez vezes mais e a grade engasgaria.

use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, ImageEncoder};

use super::Quadro;

const LARGURA_MAX: u32 = 480;
const ALTURA_MAX: u32 = 270;
/// Qualidade JPEG. Miniatura é para reconhecer a janela, não para ler texto.
const QUALIDADE: u8 = 65;

/// Recorta um quadro BGRA. Cantos fora do quadro são aparados; `None` se não
/// sobrar nada.
///
/// Só o DXGI recorta: é o jeito dele de "capturar uma janela" duplicando o
/// monitor inteiro (ver `win/dxgi.rs`). O WGC e o ScreenCaptureKit capturam a
/// janela isolada e não precisam disto.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn recortar(q: &Quadro, x0: u32, y0: u32, x1: u32, y1: u32) -> Option<Quadro> {
    let x1 = x1.min(q.largura);
    let y1 = y1.min(q.altura);
    if x0 >= x1 || y0 >= y1 {
        return None;
    }
    let largura = x1 - x0;
    let altura = y1 - y0;
    let passo = q.largura as usize * 4;
    let mut bgra = Vec::with_capacity((largura * altura * 4) as usize);
    for y in y0..y1 {
        let inicio = y as usize * passo + x0 as usize * 4;
        bgra.extend_from_slice(&q.bgra[inicio..inicio + largura as usize * 4]);
    }
    Some(Quadro {
        largura,
        altura,
        bgra,
    })
}

/// Reduz o quadro para caber em `LARGURA_MAX`×`ALTURA_MAX` e devolve RGB.
///
/// Filtro de caixa com fator inteiro: cada pixel de saída é a média de um
/// bloco `f×f`. É o que dá uma miniatura limpa a partir de texto pequeno (o
/// vizinho-mais-próximo deixaria a tela cheia de serrilhado), e é uma passada
/// só pelo quadro.
fn reduzir_rgb(q: &Quadro) -> (u32, u32, Vec<u8>) {
    let fator = q
        .largura
        .div_ceil(LARGURA_MAX)
        .max(q.altura.div_ceil(ALTURA_MAX))
        .max(1);
    let largura = (q.largura / fator).max(1);
    let altura = (q.altura / fator).max(1);
    let passo = q.largura as usize * 4;
    let area = fator * fator;

    let mut rgb = Vec::with_capacity((largura * altura * 3) as usize);
    for oy in 0..altura {
        for ox in 0..largura {
            let (mut b, mut g, mut r) = (0u32, 0u32, 0u32);
            for dy in 0..fator {
                let linha = (oy * fator + dy) as usize * passo;
                for dx in 0..fator {
                    let i = linha + ((ox * fator + dx) as usize) * 4;
                    b += u32::from(q.bgra[i]);
                    g += u32::from(q.bgra[i + 1]);
                    r += u32::from(q.bgra[i + 2]);
                }
            }
            rgb.push((r / area) as u8);
            rgb.push((g / area) as u8);
            rgb.push((b / area) as u8);
        }
    }
    (largura, altura, rgb)
}

/// Miniatura JPEG do quadro. `None` se o encoder recusar (não deveria: o
/// tamanho é sempre válido), e a grade cai no ícone do app.
///
/// Hoje só os dois backends do Windows chamam isto (`win/mod.rs` e
/// `win/dxgi.rs`); o `mac` ainda é esqueleto e devolve `None` sem gerar
/// quadro nenhum para reduzir. Sai quando o `mac::miniaturas` passar a
/// chamar esta mesma função.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn jpeg(q: &Quadro) -> Option<Vec<u8>> {
    if q.largura == 0 || q.altura == 0 || q.bgra.len() < (q.largura * q.altura * 4) as usize {
        return None;
    }
    let (largura, altura, rgb) = reduzir_rgb(q);
    let mut saida = Vec::new();
    JpegEncoder::new_with_quality(&mut saida, QUALIDADE)
        .write_image(&rgb, largura, altura, ExtendedColorType::Rgb8)
        .ok()?;
    Some(saida)
}
