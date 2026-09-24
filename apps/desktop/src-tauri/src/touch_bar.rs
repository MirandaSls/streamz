//! A Touch Bar do MacBook Pro durante uma call: mudo, ensurdecer, câmera,
//! compartilhar tela e desligar.
//!
//! **Só existe no macOS.** O módulo inteiro entra em `lib.rs` atrás de
//! `#[cfg(target_os = "macos")]`; nos outros alvos não há Touch Bar e um
//! comando que não faz nada seria promessa falsa na superfície de API.
//!
//! **O defeito.** Numa call o áudio dos outros toca em elementos
//! `<audio>`/`<video>` da página, e o WebKit trata isso como mídia tocando: a
//! Touch Bar passava a mostrar play/pause e barra de progresso, como se a call
//! fosse um vídeo. Quem decide essa barra é o próprio `WKWebView`: ele
//! sobrescreve o getter `touchBar` de `NSResponder` e devolve a barra que o
//! `WebViewImpl` monta (a de mídia ou a de texto). Como o webview é o *first
//! responder*, a barra dele é a que o sistema mostra — um `setTouchBar:` na
//! `NSWindow` perde, porque a janela está mais acima na cadeia de responders.
//!
//! **Como a nossa barra vence.** Sobrescrevendo o mesmo getter, um degrau
//! abaixo do WebKit. O wry cria o webview numa subclasse própria de
//! `WKWebView` (hoje `WryWebView`), que não implementa `touchBar`. Na primeira
//! call instalamos (uma vez só) um método `touchBar` nessa subclasse pelo
//! runtime do Objective-C (`class_replaceMethod`). A nossa implementação
//! devolve a barra do Streamz quando há call **e** o objeto é o webview da
//! janela principal; em qualquer outro caso chama a implementação que estava
//! lá antes (a do `WKWebView`), de modo que fora da call o WebKit continua
//! mandando — barra de texto num campo, de mídia num vídeo do chat.
//!
//! Por que isso e não as alternativas:
//!
//! - `setTouchBar:` na janela perde para o webview, como dito acima;
//! - `setTouchBar:` no próprio webview não tem efeito, porque o getter do
//!   `WKWebView` ignora o valor guardado pelo `NSResponder` e responde com a
//!   barra do `WebViewImpl`;
//! - tirar o webview de *first responder* durante a call quebraria o teclado
//!   (o campo de mensagem deixaria de receber digitação);
//! - trocar a classe do objeto (`object_setClass`, *isa swizzling*) brigaria
//!   com o KVO, que o wry já usa no webview (observador do título) e que faz
//!   exatamente isso por baixo.
//!
//! A classe onde o método entra é a que `[webview class]` responde, e não a de
//! `object_getClass`: com o KVO ativo, `object_getClass` devolve a subclasse
//! dinâmica `NSKVONotifying_WryWebView`, que some se o observador sair — e o
//! nosso método iria junto. A subclasse do KVO herda da `WryWebView`, então o
//! método instalado nela vale para as duas.
//!
//! **Como o sistema fica sabendo.** O AppKit observa a propriedade `touchBar`
//! dos responders por KVO; é o mesmo sinal que o WebKit dá quando troca a
//! barra dele (`willChangeValueForKey:@"touchBar"` / `didChange…` no
//! `WebViewImpl`). Ao entrar e ao sair da call mandamos esse par no webview e o
//! sistema reconsulta o getter. Descartado: `makeFirstResponder:` para `nil` e
//! de volta, que também força a reconsulta mas tira e devolve o foco da
//! página — o campo de mensagem perderia o cursor a cada entrada em call.
//!
//! **Sem piscar.** A `NSTouchBar` e os botões nascem uma vez, na primeira call,
//! e ficam vivos até o app fechar. Mudar mudo/câmera/tela só troca imagem e
//! cor dos botões que já existem; recriar a barra a cada clique faria a Touch
//! Bar apagar e reacender.
//!
//! **Os cliques** vão para a web como o evento Tauri `touch-bar:acao`, com o
//! nome da ação (`mudo`, `surdo`, `camera`, `tela`, `sair`). Quem liga e
//! desliga de fato é a web, que depois chama `atualizar_touch_bar` com o
//! estado novo — a Touch Bar só reflete, nunca decide.
//!
//! **Thread.** Todo objeto do AppKit mora na main thread. O comando pode rodar
//! fora dela, então a mexida inteira vai dentro de `with_webview`, cujo
//! closure o Tauri executa no laço de eventos (a main thread no macOS) — o
//! mesmo papel de um `run_on_main_thread`, com o `WKWebView` já em mãos. O
//! estado vive em `thread_local!` justamente por isso: só a main thread o toca,
//! e objetos Objective-C não são `Send`.

use std::cell::{Cell, OnceCell};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::OnceLock;

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Imp, NSObject, NSObjectProtocol, Sel};
use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly, Message};
use objc2_app_kit::{
    NSButton, NSColor, NSControl, NSCustomTouchBarItem, NSImage, NSTouchBar, NSTouchBarItem,
    NSTouchBarItemIdentifierFixedSpaceLarge,
};
use objc2_foundation::{ns_string, NSArray, NSSet, NSString};
use tauri::{AppHandle, Emitter, Manager};

/// Nome do evento que leva o clique de um botão para a web.
const EVENTO: &str = "touch-bar:acao";

/// O que a web manda a cada mudança da call.
#[derive(serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDaTouchBar {
    pub mudo: bool,
    pub surdo: bool,
    pub camera: bool,
    pub tela: bool,
}

/// Mostra (ou atualiza) os controles da call na Touch Bar.
///
/// `None` = sem call: devolve a Touch Bar ao WebKit.
#[tauri::command]
pub fn atualizar_touch_bar(
    app: tauri::AppHandle,
    estado: Option<EstadoDaTouchBar>,
) -> Result<(), String> {
    // O clique do botão chega pelo runtime do Objective-C, sem `AppHandle` à
    // mão; guardamos um clone na primeira chamada. É sempre o mesmo app, então
    // o `set` repetido que falha não tem importância.
    let _ = APP.set(app.clone());

    let janela = app
        .get_webview_window("main")
        .ok_or_else(|| "janela principal não encontrada".to_string())?;

    janela
        .with_webview(move |webview| {
            let Some(mtm) = MainThreadMarker::new() else {
                // O Tauri promete rodar este closure no laço de eventos; se um
                // dia não rodar, é melhor ficar sem Touch Bar do que tocar no
                // AppKit de outra thread.
                eprintln!("touch bar: with_webview fora da main thread; ignorado");
                return;
            };
            let ponteiro = webview.inner() as *const AnyObject;
            if ponteiro.is_null() {
                eprintln!("touch bar: webview sem WKWebView");
                return;
            }
            // SAFETY: no macOS `inner()` é o `WKWebView` do wry, vivo enquanto
            // a janela existir (o Tauri o entrega com um retain a mais), e
            // estamos na main thread.
            let webview = unsafe { &*ponteiro };
            if let Err(erro) = aplicar(mtm, webview, estado) {
                eprintln!("touch bar: {erro}");
            }
        })
        .map_err(|e| e.to_string())
}

static APP: OnceLock<AppHandle> = OnceLock::new();

/// A implementação de `touchBar` que valia antes da nossa (a do `WKWebView`).
/// Preenchida uma vez só; ela é também a marca de "override instalado".
static TOUCH_BAR_ORIGINAL: OnceLock<Imp> = OnceLock::new();

thread_local! {
    /// A barra e os botões, criados na primeira call e mantidos até o fim.
    static BARRA: OnceCell<Barra> = const { OnceCell::new() };
    /// Há call? É o que o getter consulta para escolher entre nós e o WebKit.
    static EM_CALL: Cell<bool> = const { Cell::new(false) };
    /// O webview da janela principal. Só ele ganha a nossa barra: a classe é
    /// do wry, e qualquer outra janela que ele crie cai no WebKit.
    static WEBVIEW: Cell<*const AnyObject> = const { Cell::new(std::ptr::null()) };
}

/// Os botões, na ordem em que aparecem. O discriminante é o `tag` do
/// `NSButton`: é por ele que o alvo sabe qual foi tocado.
#[derive(Clone, Copy)]
enum Acao {
    Mudo = 0,
    Surdo = 1,
    Camera = 2,
    Tela = 3,
    Sair = 4,
}

impl Acao {
    const TODAS: [Acao; 5] = [
        Acao::Mudo,
        Acao::Surdo,
        Acao::Camera,
        Acao::Tela,
        Acao::Sair,
    ];

    fn de_tag(tag: isize) -> Option<Acao> {
        Acao::TODAS.into_iter().find(|a| *a as isize == tag)
    }

    /// O payload do evento — contrato com a web, não mudar.
    fn nome(self) -> &'static str {
        match self {
            Acao::Mudo => "mudo",
            Acao::Surdo => "surdo",
            Acao::Camera => "camera",
            Acao::Tela => "tela",
            Acao::Sair => "sair",
        }
    }

    fn identificador(self) -> Retained<NSString> {
        NSString::from_str(&format!("dev.streamz.touchbar.{}", self.nome()))
    }

    /// O que o leitor de tela diz. Fixo por botão: o estado vem do símbolo.
    fn descricao(self) -> &'static NSString {
        match self {
            Acao::Mudo => ns_string!("Silenciar"),
            Acao::Surdo => ns_string!("Ensurdecer"),
            Acao::Camera => ns_string!("Câmera"),
            Acao::Tela => ns_string!("Compartilhar tela"),
            Acao::Sair => ns_string!("Desligar"),
        }
    }

    /// Símbolo, texto de reserva e cor do botão num estado. Todos os símbolos
    /// existem desde o SF Symbols 1 (macOS 11); o texto só aparece num macOS
    /// mais velho, onde `imageWithSystemSymbolName` devolve `nil`.
    fn aparencia(self, estado: &EstadoDaTouchBar) -> Aparencia {
        let (simbolo, texto, cor) = match self {
            Acao::Mudo if estado.mudo => ("mic.slash.fill", "Mudo", Cor::Vermelho),
            Acao::Mudo => ("mic.fill", "Mic", Cor::Padrao),
            Acao::Surdo if estado.surdo => ("speaker.slash.fill", "Surdo", Cor::Vermelho),
            Acao::Surdo => ("headphones", "Som", Cor::Padrao),
            Acao::Camera if estado.camera => ("video.fill", "Câmera", Cor::Verde),
            Acao::Camera => ("video.slash.fill", "Câmera", Cor::Padrao),
            Acao::Tela if estado.tela => ("rectangle.fill.on.rectangle.fill", "Tela", Cor::Verde),
            Acao::Tela => ("rectangle.on.rectangle", "Tela", Cor::Padrao),
            Acao::Sair => ("phone.down.fill", "Sair", Cor::Vermelho),
        };
        Aparencia {
            simbolo,
            texto,
            cor,
        }
    }
}

struct Aparencia {
    simbolo: &'static str,
    texto: &'static str,
    cor: Cor,
}

#[derive(Clone, Copy)]
enum Cor {
    Padrao,
    Vermelho,
    Verde,
}

impl Cor {
    fn ns_color(self) -> Option<Retained<NSColor>> {
        match self {
            Cor::Padrao => None,
            Cor::Vermelho => Some(NSColor::systemRedColor()),
            Cor::Verde => Some(NSColor::systemGreenColor()),
        }
    }
}

struct Botao {
    acao: Acao,
    botao: Retained<NSButton>,
    /// Nasceu com símbolo? Se não (macOS sem SF Symbols), as trocas de estado
    /// mexem no título em vez da imagem.
    com_imagem: bool,
}

struct Barra {
    barra: Retained<NSTouchBar>,
    botoes: Vec<Botao>,
    /// O `target` de um `NSControl` é referência fraca: sem este retain o alvo
    /// morreria logo depois de criado e o clique iria para o nada.
    _alvo: Retained<AlvoDaTouchBar>,
}

define_class!(
    // SAFETY:
    // - NSObject não tem exigência de subclasse.
    // - `AlvoDaTouchBar` não implementa `Drop` e não tem ivars.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "StreamzAlvoDaTouchBar"]
    struct AlvoDaTouchBar;

    unsafe impl NSObjectProtocol for AlvoDaTouchBar {}

    impl AlvoDaTouchBar {
        #[unsafe(method(acionar:))]
        fn acionar(&self, remetente: Option<&NSControl>) {
            // Um pânico aqui desenrolaria para dentro do AppKit.
            let _ = catch_unwind(AssertUnwindSafe(|| {
                let Some(acao) = remetente.and_then(|r| Acao::de_tag(r.tag())) else {
                    return;
                };
                let Some(app) = APP.get() else {
                    return;
                };
                if let Err(erro) = app.emit(EVENTO, acao.nome()) {
                    eprintln!("touch bar: falha ao avisar a web: {erro}");
                }
            }));
        }
    }
);

impl AlvoDaTouchBar {
    fn novo(mtm: MainThreadMarker) -> Retained<Self> {
        // SAFETY: `init` do NSObject; a classe não tem ivars a preencher.
        unsafe { msg_send![Self::alloc(mtm), init] }
    }
}

fn aplicar(
    mtm: MainThreadMarker,
    webview: &AnyObject,
    estado: Option<EstadoDaTouchBar>,
) -> Result<(), String> {
    let Some(estado) = estado else {
        // Fim da call. Nada de destruir a barra: a próxima call a reaproveita.
        if EM_CALL.replace(false) {
            reconsultar(webview);
        }
        return Ok(());
    };

    instalar_override(webview)?;
    WEBVIEW.set(webview as *const AnyObject);

    BARRA.with(|celula| {
        let barra = match celula.get() {
            Some(barra) => barra,
            None => {
                // Criar não chama o getter `touchBar`, então não há como o
                // `set` achar a célula ocupada; mesmo assim, sem `unwrap`.
                let _ = celula.set(criar_barra(mtm));
                match celula.get() {
                    Some(barra) => barra,
                    None => return,
                }
            }
        };
        for botao in &barra.botoes {
            pintar(botao, &estado);
        }
    });

    if !EM_CALL.replace(true) {
        reconsultar(webview);
    }
    Ok(())
}

/// Instala o nosso `touchBar` na classe do webview, uma vez por processo.
fn instalar_override(webview: &AnyObject) -> Result<(), String> {
    if TOUCH_BAR_ORIGINAL.get().is_some() {
        return Ok(());
    }
    let seletor = sel!(touchBar);

    // `[webview class]`, e não `object_getClass`: ver o doc do módulo (KVO).
    // SAFETY: `class` existe em todo NSObject e devolve a classe, não nula.
    let classe: *const AnyClass = unsafe { msg_send![webview, class] };
    if classe.is_null() {
        return Err("classe do webview não encontrada".into());
    }
    // SAFETY: não nula, e classes Objective-C vivem até o fim do processo.
    let classe: &AnyClass = unsafe { &*classe };

    // A implementação que a classe responde hoje — herdada do `WKWebView`
    // (ou do `NSResponder`, se um WebKit futuro deixar de sobrescrever). É
    // essa que chamamos fora da call.
    let original = classe
        .instance_method(seletor)
        .ok_or_else(|| "o webview não responde a touchBar".to_string())?
        .implementation();
    // Grava antes de trocar: a partir do `class_replaceMethod` o getter pode
    // ser chamado a qualquer momento e precisa achar a original.
    if TOUCH_BAR_ORIGINAL.set(original).is_err() {
        return Ok(());
    }

    let nossa: unsafe extern "C-unwind" fn(*mut AnyObject, Sel) -> *mut AnyObject =
        touch_bar_do_webview;
    // SAFETY: `Imp` é um ponteiro de função genérico; o runtime chama com a
    // assinatura que a codificação `@@:` declara (objeto; self, _cmd), que é
    // exatamente a de `touch_bar_do_webview`.
    let nossa: Imp = unsafe { std::mem::transmute(nossa) };
    // SAFETY: seletor e codificação batem com o getter `touchBar` de
    // `NSResponder` (`- (NSTouchBar *)touchBar`). Se a classe não implementa o
    // método, ele é acrescentado (sobrescrevendo o herdado); se implementa, é
    // trocado — nos dois casos `original` já guarda o que valia antes.
    unsafe {
        objc2::ffi::class_replaceMethod(
            classe as *const AnyClass as *mut AnyClass,
            seletor,
            nossa,
            c"@@:".as_ptr(),
        );
    }
    Ok(())
}

/// O getter `touchBar` instalado na classe do webview.
///
/// Devolve +0 (a convenção de getter): a barra é mantida viva pelo
/// `thread_local` até o processo acabar, então o ponteiro nunca pende.
unsafe extern "C-unwind" fn touch_bar_do_webview(este: *mut AnyObject, cmd: Sel) -> *mut AnyObject {
    // Nada aqui pode entrar em pânico: `try_with` em vez de `with` (o
    // `thread_local` pode já ter sido destruído no encerramento) e só `Cell`,
    // porque o AppKit chama este getter de dentro do nosso `didChange…` —
    // um `RefCell` emprestado ali seria pânico por reentrância.
    let nossa = EM_CALL.try_with(Cell::get).unwrap_or(false)
        && WEBVIEW
            .try_with(Cell::get)
            .is_ok_and(|w| std::ptr::eq(w, este));
    if nossa {
        let barra = BARRA
            .try_with(|c| c.get().map(|b| Retained::as_ptr(&b.barra)))
            .ok()
            .flatten();
        if let Some(barra) = barra {
            return barra as *mut AnyObject;
        }
    }
    match TOUCH_BAR_ORIGINAL.get() {
        Some(original) => {
            // SAFETY: `original` é a implementação de `touchBar` que a classe
            // tinha, com a mesma assinatura desta função.
            let original: unsafe extern "C-unwind" fn(*mut AnyObject, Sel) -> *mut AnyObject =
                unsafe { std::mem::transmute(*original) };
            unsafe { original(este, cmd) }
        }
        // Impossível (a original é gravada antes da troca), e `nil` é uma
        // resposta válida: "sem Touch Bar própria".
        None => std::ptr::null_mut(),
    }
}

/// Avisa o AppKit (por KVO) que a `touchBar` do webview mudou. Ver o doc do
/// módulo para o porquê de não usar o *first responder*.
fn reconsultar(webview: &AnyObject) {
    let chave = ns_string!("touchBar");
    // SAFETY: métodos do protocolo informal de KVO, presentes em todo
    // NSObject; a chave é uma NSString válida. Estamos na main thread.
    unsafe {
        let _: () = msg_send![webview, willChangeValueForKey: chave];
        let _: () = msg_send![webview, didChangeValueForKey: chave];
    }
}

fn criar_barra(mtm: MainThreadMarker) -> Barra {
    let alvo = AlvoDaTouchBar::novo(mtm);
    let inicial = EstadoDaTouchBar {
        mudo: false,
        surdo: false,
        camera: false,
        tela: false,
    };

    let mut botoes = Vec::with_capacity(Acao::TODAS.len());
    let mut itens: Vec<Retained<NSTouchBarItem>> = Vec::with_capacity(Acao::TODAS.len());
    let mut identificadores: Vec<Retained<NSString>> = Vec::with_capacity(Acao::TODAS.len() + 1);

    for acao in Acao::TODAS {
        let aparencia = acao.aparencia(&inicial);
        let imagem = simbolo(acao, aparencia.simbolo);
        let com_imagem = imagem.is_some();
        // SAFETY: o alvo implementa `acionar:` (recebe o remetente), e fica
        // vivo em `Barra::_alvo` enquanto o botão existir.
        let botao = unsafe {
            match &imagem {
                Some(imagem) => NSButton::buttonWithImage_target_action(
                    imagem,
                    Some(&alvo),
                    Some(sel!(acionar:)),
                    mtm,
                ),
                None => NSButton::buttonWithTitle_target_action(
                    &NSString::from_str(aparencia.texto),
                    Some(&alvo),
                    Some(sel!(acionar:)),
                    mtm,
                ),
            }
        };
        botao.setTag(acao as isize);
        let botao = Botao {
            acao,
            botao,
            com_imagem,
        };
        pintar(&botao, &inicial);

        let identificador = acao.identificador();
        let item = NSCustomTouchBarItem::initWithIdentifier(
            NSCustomTouchBarItem::alloc(mtm),
            &identificador,
        );
        item.setView(&botao.botao);
        item.setCustomizationLabel(Some(acao.descricao()));

        // Um espaço largo antes de "desligar": é o botão que encerra a call, e
        // não deve ficar colado no de compartilhar tela.
        if matches!(acao, Acao::Sair) {
            // SAFETY: constante do AppKit, sempre inicializada.
            identificadores.push(unsafe { NSTouchBarItemIdentifierFixedSpaceLarge }.retain());
        }
        identificadores.push(identificador);
        itens.push(Retained::into_super(item));
        botoes.push(botao);
    }

    let barra = NSTouchBar::new(mtm);
    barra.setTemplateItems(&NSSet::from_retained_slice(&itens));
    barra.setDefaultItemIdentifiers(&NSArray::from_retained_slice(&identificadores));

    Barra {
        barra,
        botoes,
        _alvo: alvo,
    }
}

fn simbolo(acao: Acao, nome: &str) -> Option<Retained<NSImage>> {
    NSImage::imageWithSystemSymbolName_accessibilityDescription(
        &NSString::from_str(nome),
        Some(acao.descricao()),
    )
}

/// Troca imagem (ou título) e cor de um botão que já existe.
fn pintar(botao: &Botao, estado: &EstadoDaTouchBar) {
    let aparencia = botao.acao.aparencia(estado);
    if botao.com_imagem {
        // Se só o símbolo do estado novo faltar, o botão fica com a imagem
        // anterior — a cor ainda muda e diz o estado.
        if let Some(imagem) = simbolo(botao.acao, aparencia.simbolo) {
            botao.botao.setImage(Some(&imagem));
        }
    } else {
        botao.botao.setTitle(&NSString::from_str(aparencia.texto));
    }
    botao
        .botao
        .setBezelColor(aparencia.cor.ns_color().as_deref());
}
