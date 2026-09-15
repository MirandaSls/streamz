//! Captura de quadros de uma janela ou de um monitor — a metade "capture isto"
//! do módulo `tela` (a metade "o que existe" é `fontes.rs`).
//!
//! **Dois backends, escolhidos em tempo de execução, e a razão é a borda
//! amarela.** A Windows Graphics Capture (WGC) desenha uma moldura amarela em
//! volta do que está sendo capturado como aviso de segurança. A partir do
//! Windows 11 a sessão aceita `IsBorderRequired = false`; no Windows 10 a
//! propriedade não existe e a API recusa desligar. Então:
//!
//! - **WGC sem borda** quando a propriedade existe (Windows 11). Captura a
//!   janela isolada, mesmo coberta por outras.
//! - **DXGI Desktop Duplication** quando não existe (Windows 10). Duplica o
//!   monitor inteiro — nunca desenha borda — e, para janela, recorta o quadro
//!   no retângulo dela. O recorte mostra o que estiver por cima da janela; é
//!   a mesma limitação do Discord no Windows 10, e o seletor avisa (ver
//!   `capacidades_de_tela` em `tela/mod.rs`).
//!
//! A decisão é por **capacidade** (a propriedade `IsBorderRequired` existe na
//! `GraphicsCaptureSession`?), e não por número de build: é exatamente a
//! pergunta que interessa, e não depende de uma tabela de versões que um dia
//! fica velha.
//!
//! As miniaturas da grade do seletor saem daqui também, de propósito: uma
//! biblioteca de screenshot genérica usaria WGC com borda, e a moldura amarela
//! piscaria em cada janela enquanto o seletor estivesse aberto.
//!
//! A arquitetura (trait `Capturador` com os dois backends, miniaturas pelo
//! mesmo caminho da transmissão) é a do plano da sessão anterior, que também
//! escreveu a enumeração; este módulo é a etapa "capturar sem borda" dele.

use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::HMONITOR;

mod dxgi;
mod escala;
mod wgc;

/// O que capturar, já resolvido de um id de `Fonte` (ver `fontes::alvo`).
#[derive(Debug, Clone, Copy)]
pub enum Alvo {
    Janela(HWND),
    Monitor(HMONITOR),
}

// SAFETY: `HWND` e `HMONITOR` são identificadores opacos do sistema, não
// ponteiros para memória nossa. Mandá-los para outra thread é o uso normal
// deles (qualquer thread pode consultar uma janela pelo handle).
unsafe impl Send for Alvo {}

/// Um quadro BGRA sem padding: 4 bytes por pixel, linhas contíguas.
///
/// BGRA e não RGBA porque é o que o Windows entrega nos dois backends, e a
/// conversão para o YUV do encoder (`argb_to_i420`, na nomenclatura da libyuv)
/// lê exatamente esta ordem de bytes. Reordenar aqui seria uma passada a mais
/// por 14 MB de quadro a 60 vezes por segundo.
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
/// Dois limiares, conforme o backend:
///
/// - **`descartando`** (WGC, que empurra quadros e o que passa do limite é
///   perdido): **7/8 do intervalo**. Com o limiar exato, a tremida natural
///   dos vsyncs faz um monitor de 60 Hz num preset de 30 fps perder o quadro
///   de 33,3 ms quando ele chega em 33,1 e só aceitar o de 50 ms — 20 fps em
///   vez de 30. Com 7/8 a tolerância é de ~4 ms em 30 fps, e em 144 Hz o
///   quadro aceito é o de 34,7 ms (28,8 fps).
/// - **`puxando`** (DXGI, em que quem chama decide quando pedir): o intervalo
///   exato. Esperar demais um milissegundo não perde nada — o quadro
///   acumulado continua lá —, e a folga só faria ler mais que o preset.
///
/// Os instantes são `Duration` desde uma origem qualquer, fixa por sessão: o
/// WGC passa o carimbo do próprio quadro (o mesmo relógio que o sistema usa
/// para o `MinUpdateInterval`) e o DXGI passa um `Instant` local.
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
}

impl Backend {
    pub fn nome(self) -> &'static str {
        match self {
            Backend::Wgc => "wgc",
            Backend::Dxgi => "dxgi",
        }
    }
}

/// Decide o backend uma vez por processo. A consulta é uma chamada WinRT
/// barata, mas o resultado não muda com o app aberto, e chamá-la a cada
/// miniatura seria ruído.
pub fn backend() -> Backend {
    static ESCOLHIDO: OnceLock<Backend> = OnceLock::new();
    *ESCOLHIDO.get_or_init(|| {
        if wgc::sem_borda_disponivel() {
            Backend::Wgc
        } else {
            Backend::Dxgi
        }
    })
}

#[derive(Debug)]
pub enum Erro {
    /// A janela fechou (ou o monitor foi desligado) no meio: quem transmite
    /// para, sem tentar de novo.
    FonteSumiu,
    /// Falha da API de captura, com a mensagem do Windows para o log.
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

/// Uma sessão de captura aberta sobre um alvo. Os dois backends implementam
/// isto, e quem transmite não sabe qual dos dois está por baixo.
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
    match backend() {
        Backend::Wgc => Ok(Box::new(wgc::Sessao::abrir(alvo, Some(fps))?)),
        Backend::Dxgi => Ok(Box::new(dxgi::Duplicacao::abrir(
            alvo,
            Ritmo::puxando(fps),
        )?)),
    }
}

/// Miniaturas JPEG de várias fontes, na ordem pedida. `None` onde não deu
/// (janela minimizada, conteúdo protegido, monitor que sumiu, varredura
/// cancelada): a grade mostra o ícone do app no lugar.
///
/// A lista inteira num comando só porque no DXGI o quadro é do monitor: uma
/// duplicação por monitor serve todas as janelas dele, em vez de uma por
/// janela — e o DXGI não deixa duas duplicações do mesmo monitor conviverem.
///
/// **`cancelar` é o freio de mão**, e ele existe por causa do atraso ao ir ao
/// ar. Uma varredura é sequencial e cada fonte custa uma sessão de captura
/// inteira (dispositivo D3D novo, fila de quadros, laço de mensagens, e até
/// meio segundo esperando a janela repintar): com dez janelas abertas ela
/// leva mais de um segundo. Quando o usuário clica numa miniatura, a captura
/// definitiva não pode ficar disputando o mesmo alvo com o resto da
/// varredura — quem inicia levanta esta bandeira e a varredura desiste na
/// fonte seguinte, devolvendo `None` para o que faltava.
pub fn miniaturas(alvos: &[Alvo], cancelar: &AtomicBool) -> Vec<Option<Vec<u8>>> {
    match backend() {
        Backend::Wgc => {
            let mut saida: Vec<Option<Vec<u8>>> = vec![None; alvos.len()];
            for (i, alvo) in alvos.iter().enumerate() {
                if cancelar.load(Ordering::Acquire) {
                    break;
                }
                saida[i] = wgc::um_quadro(*alvo).and_then(|q| escala::jpeg(&q));
            }
            saida
        }
        Backend::Dxgi => dxgi::miniaturas(alvos, cancelar),
    }
}
