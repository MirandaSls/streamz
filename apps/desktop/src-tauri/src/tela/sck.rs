//! Peças do ScreenCaptureKit que `fontes`, `captura` e `audio` usam em comum.
//!
//! O ScreenCaptureKit só fala por *completion handler*: pedir o conteúdo
//! compartilhável devolve na hora e entrega o resultado depois, numa fila do
//! sistema. Todos os nossos chamadores já rodam em threads que podem bloquear
//! (o `spawn_blocking` das fontes, a thread da captura), então aqui a resposta
//! vira síncrona — com **prazo**. Sem prazo, uma permissão pendente ou um
//! `replayd` travado prenderia a thread para sempre, e a tela de escolha de
//! fonte ficaria girando sem nunca dizer nada.
//!
//! As consultas ao Core Graphics (escala, display ativo, janela ainda aberta)
//! moram aqui pelo mesmo motivo: são as perguntas que os três módulos fazem
//! entre um quadro e outro, e a resposta precisa ser a mesma nos três.
use std::sync::mpsc::sync_channel;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2_core_foundation::CGRect;
use objc2_core_graphics::{
    CGDisplayCopyDisplayMode, CGDisplayMode, CGError, CGGetActiveDisplayList,
    CGGetDisplaysWithPoint, CGMainDisplayID, CGPreflightScreenCaptureAccess,
    CGRequestScreenCaptureAccess, CGWindowListCopyWindowInfo, CGWindowListOption,
};
use objc2_foundation::NSError;
use objc2_screen_capture_kit::{SCDisplay, SCRunningApplication, SCShareableContent, SCWindow};

/// Carrega um objeto Objective-C entre threads.
///
/// `Retained<T>` não é `Send` porque o objc2 não sabe, em geral, se o objeto
/// tolera ser tocado de outra thread. Os objetos do ScreenCaptureKit que
/// passam por aqui (conteúdo, janela, display, app, filtro, stream) são
/// documentados pela Apple como utilizáveis de qualquer thread — o próprio
/// framework os entrega em filas arbitrárias.
pub(crate) struct Enviavel<T>(pub T);

// SAFETY: só embrulhamos objetos do ScreenCaptureKit/Core Graphics, que são
// thread-safe (ver acima); o wrapper não dá acesso concorrente, só move a posse.
unsafe impl<T> Send for Enviavel<T> {}

/// O ScreenCaptureKit existe desde o 12.3, mas só no 13 ganhou captura de
/// áudio e um `SCStreamConfiguration` estável o bastante; antes disso a web
/// continua no `getDisplayMedia`.
pub(crate) fn sistema_atende() -> bool {
    objc2::available!(macos = 13.0)
}

/// Pergunta sem abrir diálogo: serve para decidir se mostramos a grade ou o
/// aviso de permissão.
pub(crate) fn tem_permissao() -> bool {
    CGPreflightScreenCaptureAccess()
}

/// Pede a permissão de Gravação de Tela. O macOS só mostra o diálogo na
/// primeira vez; depois disso a chamada devolve `false` calada, e o único
/// caminho do usuário é o painel de Privacidade — por isso ele é aberto aqui,
/// em vez de deixar a pessoa procurando.
pub(crate) fn pedir_permissao() -> bool {
    if CGRequestScreenCaptureAccess() {
        return true;
    }
    let _ = std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn();
    false
}

/// Janelas visíveis agora, displays e apps — o que a grade de fontes mostra.
pub(crate) fn conteudo(limite: Duration) -> Option<Retained<SCShareableContent>> {
    pedir_conteudo(true, limite)
}

/// Inclui janelas fora da tela (minimizadas, em outro Space): quem já está
/// capturando uma janela precisa achá-la mesmo quando ela sai de vista.
pub(crate) fn conteudo_completo(limite: Duration) -> Option<Retained<SCShareableContent>> {
    pedir_conteudo(false, limite)
}

fn pedir_conteudo(so_na_tela: bool, limite: Duration) -> Option<Retained<SCShareableContent>> {
    // Capacidade 1 e `try_send`: o handler roda uma vez, numa fila do sistema,
    // e não pode bloquear nem entrar em pânico — se o prazo já venceu e o
    // receptor morreu, o envio falha e o conteúdo é simplesmente solto.
    let (tx, rx) = sync_channel::<Enviavel<Option<Retained<SCShareableContent>>>>(1);
    let bloco = RcBlock::new(move |c: *mut SCShareableContent, _erro: *mut NSError| {
        // Sem permissão o handler recebe erro e `c` nulo; mandar `None` em vez
        // de nada faz o chamador desistir na hora, sem esperar o prazo inteiro.
        // SAFETY: `c` é nulo ou um SCShareableContent válido durante o handler.
        let c = unsafe { Retained::retain(c) };
        let _ = tx.try_send(Enviavel(c));
    });
    // SAFETY: método de classe; o bloco é copiado pelo framework, e a
    // assinatura do fechamento bate com a do completion handler.
    unsafe {
        SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(
            true, so_na_tela, &bloco,
        );
    }
    rx.recv_timeout(limite).ok()?.0
}

pub(crate) fn achar_janela(c: &SCShareableContent, id: u32) -> Option<Retained<SCWindow>> {
    // SAFETY: getters sem efeito colateral de um SCShareableContent válido.
    unsafe { c.windows() }
        .to_vec()
        .into_iter()
        .find(|j| unsafe { j.windowID() } == id)
}

pub(crate) fn achar_display(c: &SCShareableContent, id: u32) -> Option<Retained<SCDisplay>> {
    // SAFETY: idem.
    unsafe { c.displays() }
        .to_vec()
        .into_iter()
        .find(|d| unsafe { d.displayID() } == id)
}

/// Nosso próprio processo, para excluí-lo da captura de display: sem isso a
/// janela do Streamz com a prévia da tela aparece dentro da própria tela.
pub(crate) fn meu_app(c: &SCShareableContent) -> Option<Retained<SCRunningApplication>> {
    let pid = std::process::id() as libc::pid_t;
    // SAFETY: idem.
    unsafe { c.applications() }
        .to_vec()
        .into_iter()
        .find(|a| unsafe { a.processID() } == pid)
}

/// Pixels por ponto do display. O SCDisplay informa o tamanho em **pontos**;
/// capturar nisso numa tela Retina entregaria metade da resolução. O teto de
/// 3 e o piso de 1 protegem de um modo de vídeo esquisito virar um quadro
/// gigante ou vazio.
pub(crate) fn escala_do_display(id: u32) -> f64 {
    let Some(modo) = CGDisplayCopyDisplayMode(id) else {
        return 1.0;
    };
    let pixels = CGDisplayMode::pixel_width(Some(&*modo));
    let pontos = CGDisplayMode::width(Some(&*modo));
    if pixels == 0 || pontos == 0 {
        return 1.0;
    }
    (pixels as f64 / pontos as f64).clamp(1.0, 3.0)
}

/// Em qual display está o centro da janela — é a escala dele que vale para
/// capturá-la. O `frame` do SCWindow está no mesmo espaço global (origem no
/// canto superior esquerdo do display principal) que o Core Graphics usa aqui.
pub(crate) fn display_da_janela(frame: CGRect) -> u32 {
    let mut id: u32 = 0;
    let mut quantos: u32 = 0;
    // SAFETY: ponteiros para variáveis locais, e `max_displays` = 1 cabe em `id`.
    let erro = unsafe { CGGetDisplaysWithPoint(frame.mid(), 1, &mut id, &mut quantos) };
    if erro == CGError::Success && quantos > 0 {
        id
    } else {
        CGMainDisplayID()
    }
}

/// A janela ainda existe? Usado para encerrar a transmissão quando o usuário
/// fecha o que estava compartilhando, em vez de ficar mandando o último quadro.
pub(crate) fn janela_existe(id: u32) -> bool {
    // Com id 0 a opção "incluindo janela" não tem janela para incluir e a
    // resposta não diria nada sobre a nossa.
    if id == 0 {
        return false;
    }
    CGWindowListCopyWindowInfo(CGWindowListOption::OptionIncludingWindow, id)
        .is_some_and(|lista| lista.count() > 0)
}

/// O display ainda está ligado? Monitor desconectado no meio da transmissão
/// deixa o stream mudo sem erro nenhum; é esta pergunta que percebe.
pub(crate) fn display_ativo(id: u32) -> bool {
    let mut lista = [0u32; 16];
    let mut quantos: u32 = 0;
    // SAFETY: o buffer tem exatamente `max_displays` posições.
    let erro =
        unsafe { CGGetActiveDisplayList(lista.len() as u32, lista.as_mut_ptr(), &mut quantos) };
    if erro != CGError::Success {
        return false;
    }
    let n = (quantos as usize).min(lista.len());
    lista[..n].contains(&id)
}

pub(crate) fn display_principal() -> u32 {
    CGMainDisplayID()
}
