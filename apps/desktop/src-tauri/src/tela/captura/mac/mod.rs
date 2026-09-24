//! Captura no macOS: ScreenCaptureKit, macOS 13 em diante.
//!
//! A transmissão abre um `SCStream` (ver `sessao.rs`): o sistema entrega cada
//! quadro BGRA num callback, numa fila de despacho nossa, e o callback o põe
//! na `Caixa` compartilhada — o mesmo encontro "empurra/puxa" do WGC no
//! Windows. O limite de fps do preset vai na configuração do stream
//! (`minimumFrameInterval`), antes de o quadro existir.
//!
//! **Não há aviso visual a contornar**, ao contrário do Windows (ver
//! `win/mod.rs`): o indicador de gravação do macOS fica na barra de menus, não
//! em volta da janela, e as miniaturas podem sair do próprio ScreenCaptureKit.
//! No 14+ cada miniatura é uma foto do `SCScreenshotManager`; no 13, que não o
//! tem, é uma sessão curta que espera o primeiro quadro.
//!
//! O número opaco do `Alvo` é `CGWindowID` (janela) ou `CGDirectDisplayID`
//! (monitor), posto pelo `fontes` do macOS. Abaixo do 13, ou sem a permissão
//! de Gravação de Tela, abrir recusa com uma frase e a grade fica sem
//! miniatura (cai no ícone do app) — quem pede a permissão é o seletor, nunca
//! a captura.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use objc2::rc::autoreleasepool;

use super::{escala, Alvo, Backend, Capturador, Erro};
use crate::tela::sck;

mod sessao;

use self::sessao::{Resolucao, Sessao};

/// Quanto a varredura de miniaturas espera o `SCShareableContent`. O mesmo
/// prazo da listagem de fontes: o seletor está aberto esperando.
const LIMITE_DO_CONTEUDO: Duration = Duration::from_secs(2);

/// Tamanho pedido ao sistema para a miniatura: o dobro do teto de
/// `escala.rs` (480×270). O sistema reduz na GPU até aqui, e o filtro de
/// caixa de `escala::jpeg` faz a última metade — texto pequeno sai mais limpo
/// assim do que com a redução inteira feita pelo sistema.
const MINIATURA: Resolucao = Resolucao::Caber {
    largura: 960,
    altura: 540,
};

/// Não há escolha a fazer: no macOS o backend é um só.
pub fn backend() -> Backend {
    Backend::Sck
}

/// Esta versão do macOS tem o ScreenCaptureKit que usamos (13+).
pub fn sistema_atende() -> bool {
    sck::sistema_atende()
}

pub fn abrir(alvo: Alvo, fps: u32) -> Result<Box<dyn Capturador>, Erro> {
    Ok(Box::new(Sessao::abrir(alvo, Some(fps), Resolucao::Nativa)?))
}

pub fn miniaturas(alvos: &[Alvo], cancelar: &AtomicBool) -> Vec<Option<Vec<u8>>> {
    let mut saida: Vec<Option<Vec<u8>>> = vec![None; alvos.len()];
    // Sem permissão, pedir o conteúdo abriria o diálogo do sistema a cada
    // atualização da grade.
    if alvos.is_empty() || !sck::sistema_atende() || !sck::tem_permissao() {
        return saida;
    }
    autoreleasepool(|_| {
        // Um conteúdo só para a varredura inteira, e não um por fonte: cada
        // pedido é uma ida ao `replayd`.
        let Some(conteudo) = sck::conteudo_completo(LIMITE_DO_CONTEUDO) else {
            return;
        };
        let tem_foto = objc2::available!(macos = 14.0);
        for (alvo, destino) in alvos.iter().zip(saida.iter_mut()) {
            if cancelar.load(Ordering::Acquire) {
                break;
            }
            // Um pool por fonte: amostras e filtros não se acumulam até o
            // fim da varredura.
            let quadro = autoreleasepool(|_| {
                if tem_foto {
                    sessao::fotografar(&conteudo, *alvo, MINIATURA)
                } else {
                    sessao::um_quadro(&conteudo, *alvo, MINIATURA)
                }
            });
            *destino = quadro.and_then(|q| escala::jpeg(&q));
        }
    });
    saida
}
