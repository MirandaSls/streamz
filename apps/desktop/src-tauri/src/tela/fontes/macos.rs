//! Enumeração de janelas e monitores no macOS — a metade macOS da fachada de
//! `fontes/mod.rs`, em cima do `SCShareableContent` do ScreenCaptureKit.
//!
//! Perguntar ao ScreenCaptureKit (e não ao `CGWindowListCopyWindowInfo`) é o
//! que garante que tudo o que a grade oferece é algo que a captura consegue
//! abrir: a lista vem do mesmo framework que depois vai capturar. O preço é
//! que ela vem crua — menu bar, Dock, papel de parede, Central de Controle e
//! uma dúzia de janelas invisíveis de agentes do sistema aparecem ali como
//! "janelas". Os filtros abaixo são os mesmos cortes que o Discord faz, e são
//! a diferença entre uma grade útil e uma lista de entulho.

use std::time::Duration;

use objc2::rc::autoreleasepool;
use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication};
use objc2_screen_capture_kit::{SCDisplay, SCWindow};

use crate::tela::captura::Alvo;
use crate::tela::sck;
use crate::tela::{Fonte, TipoDeFonte};

/// Quanto esperar o `SCShareableContent`. Curto porque quem chama é o seletor
/// aberto, que refaz a lista a cada poucos segundos: com o `replayd` engasgado
/// é melhor uma grade vazia agora do que um giro sem fim.
const LIMITE: Duration = Duration::from_secs(2);

/// Janela menor que isto (em pontos) não é aplicativo: é indicador de status,
/// popover, resquício de animação. Menor que o piso do Windows porque aqui a
/// unidade é o ponto, que numa tela Retina vale dois pixels.
const MINIMO_PT: f64 = 50.0;

/// Apps do sistema cujas janelas de camada 0 não são "um aplicativo" para o
/// usuário. A camada já tira a maior parte deles; o que sobra passa por aqui —
/// o `WindowManager` (Stage Manager) e o agente do papel de parede, em
/// especial, publicam janelas normais do tamanho da tela inteira.
const APPS_DO_SISTEMA: &[&str] = &[
    "com.apple.dock",
    "com.apple.WindowManager",
    "com.apple.controlcenter",
    "com.apple.notificationcenterui",
    "com.apple.Spotlight",
    "com.apple.systemuiserver",
    "com.apple.wallpaper.agent",
    "com.apple.loginwindow",
    "com.apple.screencaptureui",
    "com.apple.TextInputMenuAgent",
    "com.apple.TextInputSwitcher",
    "com.apple.universalcontrol",
    "com.apple.AirPlayUIAgent",
    "com.apple.accessibility.universalAccessAuthWarn",
];

/// O ScreenCaptureKit só é usado no macOS 13+ e com a permissão de Gravação
/// de Tela já dada. Checar a permissão **antes** de pedir o conteúdo importa:
/// sem ela, a primeira chamada ao `SCShareableContent` dispara o diálogo do
/// sistema — e quem decide quando pedir é o `sck::pedir_permissao`, não a
/// listagem que roda a cada poucos segundos.
fn pode_listar() -> bool {
    sck::sistema_atende() && sck::tem_permissao()
}

pub fn monitores() -> Vec<Fonte> {
    if !pode_listar() {
        return Vec::new();
    }
    // Chamado de threads do tokio, que não têm pool de autorelease: sem este,
    // o que o framework devolve autoliberado vazaria a cada listagem.
    autoreleasepool(|_| {
        let Some(conteudo) = sck::conteudo(LIMITE) else {
            return Vec::new();
        };
        let principal = sck::display_principal();
        // SAFETY: getter sem efeito colateral de um SCShareableContent válido.
        let displays = unsafe { conteudo.displays() }.to_vec();
        let mut achados: Vec<Fonte> = displays
            .iter()
            .map(|d| descrever_display(d, principal))
            .collect();

        // O principal primeiro; o resto na ordem em que o sistema entregou.
        // `sort_by_key` é estável, então essa ordem se mantém.
        achados.sort_by_key(|m| !m.principal);
        for (i, m) in achados.iter_mut().enumerate() {
            m.titulo = if m.principal {
                format!("Tela {} (principal)", i + 1)
            } else {
                format!("Tela {}", i + 1)
            };
        }
        achados
    })
}

fn descrever_display(d: &SCDisplay, principal: u32) -> Fonte {
    // SAFETY: getters sem efeito colateral de um SCDisplay válido.
    let (id, largura_pt, altura_pt) = unsafe { (d.displayID(), d.width(), d.height()) };
    // O SCDisplay mede em pontos; a grade mostra (e a captura entrega) pixels.
    // Sem a escala, um monitor Retina apareceria com metade da resolução.
    let escala = sck::escala_do_display(id);
    Fonte {
        // O `CGDirectDisplayID` é estável enquanto o monitor fica ligado, que
        // é tudo o que o id de uma `Fonte` promete.
        id: format!("monitor:{id}"),
        tipo: TipoDeFonte::Monitor,
        titulo: String::new(), // preenchido em `monitores`, que sabe a ordem
        app: None,
        icone: None,
        largura: em_pixels(largura_pt as f64, escala),
        altura: em_pixels(altura_pt as f64, escala),
        principal: id == principal,
    }
}

pub fn janelas() -> Vec<Fonte> {
    if !pode_listar() {
        return Vec::new();
    }
    let mut achadas = autoreleasepool(|_| {
        // O conteúdo **completo**, e não só o que está na tela: com o
        // `onScreenWindowsOnly` a lista perdia toda janela que não estivesse
        // no Space visível agora — a de outro Space, a de um app em tela
        // cheia noutro monitor, a minimizada —, e o Discord oferece todas.
        // Quem separa o que vale oferecer é o `descrever_janela`.
        let Some(conteudo) = sck::conteudo_completo(LIMITE) else {
            return Vec::new();
        };
        // SAFETY: getter sem efeito colateral de um SCShareableContent válido.
        let janelas = unsafe { conteudo.windows() }.to_vec();
        janelas
            .iter()
            .filter_map(|j| descrever_janela(j))
            .collect::<Vec<Fonte>>()
    });

    // Alfabética por app e depois por título: a ordem do ScreenCaptureKit
    // segue a ordem-z, que muda a cada clique — a grade dançaria entre duas
    // aberturas do seletor.
    achadas.sort_by(|a, b| {
        let app = a.app.as_deref().unwrap_or("").to_lowercase();
        let outro = b.app.as_deref().unwrap_or("").to_lowercase();
        app.cmp(&outro).then_with(|| a.titulo.cmp(&b.titulo))
    });
    achadas
}

fn descrever_janela(j: &SCWindow) -> Option<Fonte> {
    // SAFETY: getters sem efeito colateral de um SCWindow válido.
    unsafe {
        // Camada 0 é a das janelas de documento. Menu bar, Dock, painéis
        // flutuantes, cursores e overlays vivem em camadas acima — nenhuma
        // delas é o que alguém quer transmitir.
        if j.windowLayer() != 0 {
            return None;
        }

        let frame = j.frame();
        let largura_pt = frame.size.width;
        let altura_pt = frame.size.height;
        // `!(x >= min)` e não `x < min`: um NaN vindo do sistema também cai fora.
        if !(largura_pt >= MINIMO_PT) || !(altura_pt >= MINIMO_PT) {
            return None;
        }

        let titulo = j.title()?.to_string().trim().to_string();
        if titulo.is_empty() {
            return None;
        }

        // Janela sem app dono é do próprio servidor de janelas — não há o que
        // mostrar como "de quem é", e nunca é algo que o usuário escolheria.
        // O próprio Streamz **entra**, como o Discord faz com ele mesmo: o
        // espelho infinito só existe ao transmitir a tela inteira, e aí quem
        // tira o Streamz do quadro é o filtro da captura (`sck::meu_app`).
        let dono = j.owningApplication()?;
        let pid = dono.processID();
        let bundle = dono.bundleIdentifier().to_string();
        if APPS_DO_SISTEMA.contains(&bundle.as_str()) {
            return None;
        }
        // Fora da tela (outro Space, minimizada, app escondido) só a janela de
        // um app "de Dock". Agentes de barra de menus e serviços de fundo
        // guardam janelas de camada 0 com título que nunca aparecem — só na
        // tela elas eram cortadas de graça, e é aqui que continuam cortadas.
        if !j.isOnScreen() && !app_regular(pid) {
            return None;
        }

        let nome = dono.applicationName().to_string();
        let app = (!nome.trim().is_empty()).then(|| nome.trim().to_string());
        let icone = crate::tela::icone::do_pid(pid);

        // A escala que vale é a do display onde a janela está: é nela que a
        // captura vai entregar os quadros.
        let escala = sck::escala_do_display(sck::display_da_janela(frame));

        Some(Fonte {
            id: format!("janela:{}", j.windowID()),
            tipo: TipoDeFonte::Janela,
            titulo,
            app,
            icone,
            largura: em_pixels(largura_pt, escala),
            altura: em_pixels(altura_pt, escala),
            principal: false,
        })
    }
}

/// O app é dos que têm ícone no Dock e janela de verdade (`Regular`), e não um
/// agente (`Accessory`) ou processo de fundo (`Prohibited`)? Processo que já
/// saiu responde `false`: a janela dele vai sumir da lista na próxima volta.
fn app_regular(pid: libc::pid_t) -> bool {
    NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
        .is_some_and(|app| app.activationPolicy() == NSApplicationActivationPolicy::Regular)
}

/// Pontos × escala, arredondado. Valor negativo ou NaN vira 0 (o `as u32` de
/// float satura), em vez de dar a volta num número gigante.
fn em_pixels(pontos: f64, escala: f64) -> u32 {
    (pontos * escala).round().max(0.0) as u32
}

/// Resolve o id de uma `Fonte` no número que a captura precisa, revalidando.
///
/// `None` quando a fonte já não existe: a janela fechou entre a enumeração e o
/// clique, ou o monitor foi desligado. O `CGWindowID` não é reciclado dentro
/// de uma sessão de login como um `HWND`, mas a janela fechada é o caso comum
/// e é ele que a revalidação pega.
pub fn alvo(id: &str) -> Option<Alvo> {
    if let Some(numero) = id.strip_prefix("janela:") {
        let janela = numero.parse::<u32>().ok()?;
        return sck::janela_existe(janela).then_some(Alvo::Janela(u64::from(janela)));
    }
    let numero = id.strip_prefix("monitor:")?;
    let display = numero.parse::<u32>().ok()?;
    sck::display_ativo(display).then_some(Alvo::Monitor(u64::from(display)))
}

/// A fonte é uma janela que **existe mas não está na tela** — minimizada no
/// Dock, escondida (⌘H) ou em outro Space?
///
/// A enumeração **oferece** essas (o Discord oferece, e o usuário procura a
/// janela onde quer que ela esteja), mas elas não desenham: é na hora de
/// transmitir que a pergunta importa. Pergunta-se ao `conteudo_completo` — o
/// que inclui janelas fora da tela — e lê-se o `isOnScreen` da janela: o mesmo
/// framework que vai capturar diz se ela está desenhando. A alternativa (a
/// janela sumiu do `conteudo` só-na-tela) confundiria "minimizada" com
/// "fechada", e fechada é outra recusa — a do `alvo`, que devolve `None`.
///
/// Qualquer dúvida (sem permissão, prazo vencido, janela não achada) responde
/// `false`: esta pergunta só serve para trocar um "Carregando…" eterno por uma
/// frase, e nunca deve impedir uma captura que funcionaria.
pub fn minimizada(id: &str) -> bool {
    let Some(numero) = id.strip_prefix("janela:") else {
        return false;
    };
    let Ok(janela) = numero.parse::<u32>() else {
        return false;
    };
    if !pode_listar() {
        return false;
    }
    autoreleasepool(|_| {
        let Some(conteudo) = sck::conteudo_completo(LIMITE) else {
            return false;
        };
        sck::janela_fora_da_tela(&conteudo, janela)
    })
}
