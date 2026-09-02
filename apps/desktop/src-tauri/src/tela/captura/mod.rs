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
}

/// Abre uma sessão de captura no backend desta máquina.
pub fn abrir(alvo: Alvo) -> Result<Box<dyn Capturador>, Erro> {
    match backend() {
        Backend::Wgc => Ok(Box::new(wgc::Sessao::abrir(alvo)?)),
        Backend::Dxgi => Ok(Box::new(dxgi::Duplicacao::abrir(alvo)?)),
    }
}

/// Miniaturas JPEG de várias fontes, na ordem pedida. `None` onde não deu
/// (janela minimizada, conteúdo protegido, monitor que sumiu): a grade mostra
/// o ícone do app no lugar.
///
/// A lista inteira num comando só porque no DXGI o quadro é do monitor: uma
/// duplicação por monitor serve todas as janelas dele, em vez de uma por
/// janela — e o DXGI não deixa duas duplicações do mesmo monitor conviverem.
pub fn miniaturas(alvos: &[Alvo]) -> Vec<Option<Vec<u8>>> {
    match backend() {
        Backend::Wgc => alvos
            .iter()
            .map(|alvo| wgc::um_quadro(*alvo).and_then(|q| escala::jpeg(&q)))
            .collect(),
        Backend::Dxgi => dxgi::miniaturas(alvos),
    }
}
