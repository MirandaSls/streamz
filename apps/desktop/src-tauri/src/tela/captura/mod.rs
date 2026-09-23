//! Captura de quadros de uma janela ou de um monitor — a metade "capture isto"
//! do módulo `tela` (a metade "o que existe" é `fontes`).
//!
//! **Este arquivo é neutro de plataforma.** Aqui ficam o `Quadro` BGRA, o
//! `Erro`, a trait `Capturador`, o marcapasso `Ritmo` e a cópia sem padding —
//! tudo o que os backends fazem igual, em qualquer sistema. Quem sabe de API
//! do sistema é o submódulo do alvo (`win`: WGC e DXGI; `mac`:
//! ScreenCaptureKit), e `backend()`/`abrir()`/`miniaturas()` só delegam para
//! ele. O `Alvo` que atravessa essa fronteira carrega um **número opaco**, de
//! propósito: é o que tira daqui o `use windows::…`.
//!
//! As miniaturas da grade do seletor saem daqui também, de propósito: uma
//! biblioteca de screenshot genérica usaria a captura com o aviso de segurança
//! ligado — no Windows, a moldura amarela do WGC —, e ele piscaria em cada
//! janela enquanto o seletor estivesse aberto. Por que o aviso existe, e como
//! cada backend escapa dele, está em `win/mod.rs`.
//!
//! A arquitetura (trait `Capturador` com um backend por API, miniaturas pelo
//! mesmo caminho da transmissão) é a do plano da sessão anterior, que também
//! escreveu a enumeração.

// **Temporário, e só fora do Windows.** A metade neutra deste módulo — a
// `Caixa`, o `Ritmo`, o `copiar_sem_padding` e o `intervalo_do_fps` — existe
// para os backends usarem, e hoje quem os usa é só o `win`: o `mac` é um
// esqueleto que recusa todo `abrir`. Sem isto, o build do macOS sai com uma
// dúzia de avisos de `dead_code` a cada compilação, e aviso que se aprende a
// ignorar esconde o aviso que importa. Sai quando o ScreenCaptureKit entrar,
// porque aí o `mac` consome tudo isto — é o mesmo arranjo, e pelo mesmo
// motivo, do `#![cfg_attr(...)]` no topo de `tela/audio/mod.rs`.
#![cfg_attr(not(windows), allow(dead_code))]

use std::fmt;
use std::sync::atomic::AtomicBool;
use std::sync::OnceLock;
use std::time::Duration;

mod caixa;
mod escala;
#[cfg(target_os = "macos")]
mod mac;
#[cfg(windows)]
mod win;

// A delegação de plataforma acontece uma vez, aqui: `backend()`, `abrir()` e
// `miniaturas()` chamam `plataforma::…` e nenhum outro lugar deste arquivo
// precisa de `#[cfg]`.
#[cfg(target_os = "macos")]
use self::mac as plataforma;
#[cfg(windows)]
use self::win as plataforma;

/// O que capturar, já resolvido de um id de `Fonte` (ver `fontes::alvo`).
///
/// O número é **opaco**, e quem o põe aqui é o `fontes` da plataforma:
/// `HWND`/`HMONITOR` no Windows, `CGWindowID`/`CGDirectDisplayID` no macOS.
/// Guardá-lo como `u64` é o que tira deste arquivo o `use windows::…` e o
/// `unsafe impl Send` que ele não deveria ter.
#[derive(Debug, Clone, Copy)]
pub enum Alvo {
    Janela(u64),
    Monitor(u64),
}

/// Um quadro BGRA sem padding: 4 bytes por pixel, linhas contíguas.
///
/// BGRA e não RGBA porque é o que o Windows entrega nos dois backends — e o
/// mesmo que o `kCVPixelFormatType_32BGRA` do macOS entrega —, e a conversão
/// para o YUV do encoder (`argb_to_i420`, na nomenclatura da libyuv) lê
/// exatamente esta ordem de bytes. Reordenar aqui seria uma passada a mais por
/// 14 MB de quadro a 60 vezes por segundo.
pub struct Quadro {
    pub largura: u32,
    pub altura: u32,
    pub bgra: Vec<u8>,
}

/// Copia um buffer mapeado da GPU (linhas de `passo` bytes, com o padding
/// que o driver quiser) para `destino`, sem o padding, reaproveitando a
/// alocação que `destino` já tem.
///
/// Substitui o `as_nopadding_buffer(..).to_vec()` do `windows-capture`, que
/// eram **duas** cópias do quadro inteiro quando havia padding (a do crate e
/// o `to_vec`) e um `Vec` novo de ~15 MB por quadro em 1440p: alocação
/// grande no Windows é página zerada sob demanda, e isso a 60 quadros por
/// segundo aparece no perfil. `false` se o mapeamento for menor que o quadro
/// (não deveria acontecer; quem chama descarta o quadro em vez de entrar em
/// pânico dentro da thread de captura).
fn copiar_sem_padding(
    origem: &[u8],
    largura: u32,
    altura: u32,
    passo: u32,
    destino: &mut Vec<u8>,
) -> bool {
    let linha = largura as usize * 4;
    let passo = passo as usize;
    let altura = altura as usize;
    if passo < linha || altura == 0 {
        return false;
    }
    // A última linha não precisa do padding dela.
    let necessario = (altura - 1) * passo + linha;
    if origem.len() < necessario {
        return false;
    }
    destino.clear();
    if passo == linha {
        destino.extend_from_slice(&origem[..linha * altura]);
    } else {
        destino.reserve(linha * altura);
        for y in 0..altura {
            let inicio = y * passo;
            destino.extend_from_slice(&origem[inicio..inicio + linha]);
        }
    }
    true
}

/// Marcapasso da captura: deixa passar no máximo um quadro por intervalo do
/// preset, **antes** de o quadro ser lido da GPU.
///
/// Sem ele a leitura acompanha o compositor, não o preset: um monitor de
/// 144 Hz fazia 144 cópias GPU→CPU por segundo (textura de staging, `Map`,
/// cópia de ~15 MB) para a transmissão aproveitar 30 e jogar o resto fora
/// depois de pago.
///
/// Dois modos, conforme como o backend entrega o quadro — a escolha entre
/// eles é dele, não deste tipo:
///
/// - **`descartando`**, para um backend que **empurra** quadros e o que passa
///   do limite é perdido: **7/8 do intervalo**, não o intervalo exato. Com o
///   limiar exato, a tremida natural dos vsyncs faz um monitor de 60 Hz num
///   preset de 30 fps perder o quadro de 33,3 ms quando ele chega em 33,1 e
///   só aceitar o de 50 ms — 20 fps em vez de 30. Com 7/8 a tolerância é de
///   ~4 ms em 30 fps, e em 144 Hz o quadro aceito é o de 34,7 ms (28,8 fps).
/// - **`puxando`**, para um backend em que **quem chama decide** quando
///   pedir: o intervalo exato. Esperar demais um milissegundo não perde
///   nada — o quadro acumulado continua lá —, e a folga só faria ler mais
///   que o preset.
///
/// Os instantes são `Duration` desde uma origem qualquer, fixa por sessão;
/// cada backend escolhe a sua origem e qual dos dois modos usar — ver
/// `win/wgc.rs` (empurra, `descartando`) e `win/dxgi.rs` (puxa, `puxando`)
/// para quem usa qual hoje e por quê.
#[derive(Debug, Clone, Copy)]
struct Ritmo {
    /// `None` é sem limite (miniaturas: um quadro só, o primeiro que vier).
    minimo: Option<Duration>,
    ultimo: Option<Duration>,
}

impl Ritmo {
    fn livre() -> Self {
        Self {
            minimo: None,
            ultimo: None,
        }
    }

    fn descartando(fps: u32) -> Self {
        Self {
            minimo: Some(intervalo_do_fps(fps).mul_f64(7.0 / 8.0)),
            ultimo: None,
        }
    }

    fn puxando(fps: u32) -> Self {
        Self {
            minimo: Some(intervalo_do_fps(fps)),
            ultimo: None,
        }
    }

    /// Quanto falta para o próximo quadro poder passar; zero se já pode.
    fn falta(&self, agora: Duration) -> Duration {
        match (self.minimo, self.ultimo) {
            (Some(minimo), Some(ultimo)) => (ultimo + minimo).saturating_sub(agora),
            _ => Duration::ZERO,
        }
    }

    /// Registra que um quadro passou em `agora`.
    fn marcar(&mut self, agora: Duration) {
        self.ultimo = Some(agora);
    }
}

fn intervalo_do_fps(fps: u32) -> Duration {
    Duration::from_secs_f64(1.0 / f64::from(fps.max(1)))
}

/// Qual API está fazendo a captura nesta máquina.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    /// Windows Graphics Capture sem borda (Windows 11).
    Wgc,
    /// DXGI Desktop Duplication com recorte por janela (Windows 10).
    Dxgi,
    /// ScreenCaptureKit (macOS 12.3+).
    Sck,
}

impl Backend {
    pub fn nome(self) -> &'static str {
        match self {
            Backend::Wgc => "wgc",
            Backend::Dxgi => "dxgi",
            Backend::Sck => "sck",
        }
    }

    /// Compartilhar uma **janela** mostra o que estiver por cima dela?
    ///
    /// Só no DXGI, que não sabe duplicar uma janela e recorta o monitor no
    /// retângulo dela (ver `win/dxgi.rs`). O WGC e o ScreenCaptureKit capturam
    /// a janela isolada, mesmo coberta. O seletor avisa quando é o caso — ver
    /// `capacidades_de_tela` em `tela/mod.rs`.
    pub fn janela_recortada(self) -> bool {
        self == Backend::Dxgi
    }

    /// Este backend **captura de verdade**, ou é só o nome de uma API que
    /// ainda não tem implementação aqui?
    ///
    /// A pergunta existe porque compilar não é funcionar. O módulo `tela`
    /// compila no macOS desde que passou para o cfg `tela_nativa`, mas o
    /// `mac` é um esqueleto: o `abrir` recusa com uma frase e o `miniaturas`
    /// devolve `None` para tudo. Quem responde ao seletor — o
    /// `capacidades_de_tela`, em `tela/mod.rs` — precisa saber a diferença,
    /// senão promete a grade de miniaturas nativa e entrega uma lista vazia
    /// para sempre, em vez de deixar a web cair no `getDisplayMedia`.
    ///
    /// O `match` é exaustivo de propósito: backend novo não compila sem
    /// responder a esta pergunta, e o dia em que `mac::abrir` parar de
    /// devolver `Erro::Falha` é o dia de o `Sck` virar `true` — uma linha,
    /// aqui, no mesmo módulo que se está implementando.
    pub fn implementado(self) -> bool {
        match self {
            Backend::Wgc | Backend::Dxgi => true,
            Backend::Sck => false,
        }
    }
}

/// Decide o backend uma vez por processo. A consulta de capacidade é barata,
/// mas o resultado não muda com o app aberto, e chamá-la a cada miniatura
/// seria ruído.
pub fn backend() -> Backend {
    static ESCOLHIDO: OnceLock<Backend> = OnceLock::new();
    *ESCOLHIDO.get_or_init(plataforma::backend)
}

#[derive(Debug)]
pub enum Erro {
    /// A janela fechou (ou o monitor foi desligado) no meio: quem transmite
    /// para, sem tentar de novo.
    FonteSumiu,
    /// Falha da API de captura, com a mensagem do sistema para o log.
    Falha(String),
}

impl fmt::Display for Erro {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Erro::FonteSumiu => write!(f, "a fonte de captura não existe mais"),
            Erro::Falha(m) => write!(f, "falha na captura de tela: {m}"),
        }
    }
}

impl std::error::Error for Erro {}

/// Uma sessão de captura aberta sobre um alvo. Todos os backends implementam
/// isto, e quem transmite não sabe qual deles está por baixo.
pub trait Capturador: Send {
    /// Espera até `limite` por um quadro novo.
    ///
    /// `Ok(None)` é "nada novo": a fonte não repintou nesse intervalo, e quem
    /// transmite repete o quadro anterior. `Err` é definitivo — a janela
    /// fechou ou a API caiu — e a transmissão encerra.
    fn proximo_quadro(&mut self, limite: Duration) -> Result<Option<Quadro>, Erro>;

    /// Devolve um quadro já entregue ao encoder, para a captura reaproveitar
    /// o buffer dele no próximo em vez de alocar outro do tamanho da tela.
    fn reciclar(&mut self, quadro: Quadro);
}

/// Abre uma sessão de captura no backend desta máquina, entregando no máximo
/// `fps` quadros por segundo (o do preset). O limite vale **antes** da leitura
/// da GPU: quadro que a transmissão jogaria fora não chega a ser copiado.
pub fn abrir(alvo: Alvo, fps: u32) -> Result<Box<dyn Capturador>, Erro> {
    plataforma::abrir(alvo, fps)
}

/// Miniaturas JPEG de várias fontes, na ordem pedida. `None` onde não deu
/// (janela minimizada, conteúdo protegido, monitor que sumiu, varredura
/// cancelada): a grade mostra o ícone do app no lugar.
///
/// A lista inteira num comando só, e não uma chamada por fonte, porque um
/// backend pode precisar agrupar fontes que compartilham a mesma sessão de
/// captura por baixo — no DXGI, que só sabe duplicar o monitor inteiro, é
/// exatamente isso: uma duplicação por monitor serve todas as janelas dele,
/// em vez de uma por janela (ver `win/dxgi.rs`).
///
/// **`cancelar` é o freio de mão**, e ele existe por causa do atraso ao ir ao
/// ar. Uma varredura é sequencial e cada fonte custa uma sessão de captura
/// inteira — o preço exato depende do backend (dispositivo/contexto novo,
/// fila de quadros, e até meio segundo esperando a fonte repintar; ver
/// `win/dxgi.rs` e `win/wgc.rs`), mas com dez janelas abertas passa de um
/// segundo. Quando o usuário clica numa miniatura, a captura definitiva não
/// pode ficar disputando o mesmo alvo com o resto da varredura — quem inicia
/// levanta esta bandeira e a varredura desiste na fonte seguinte, devolvendo
/// `None` para o que faltava.
pub fn miniaturas(alvos: &[Alvo], cancelar: &AtomicBool) -> Vec<Option<Vec<u8>>> {
    plataforma::miniaturas(alvos, cancelar)
}
