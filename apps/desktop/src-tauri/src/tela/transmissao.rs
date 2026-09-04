//! Publicar a captura na sala do LiveKit — a etapa que fecha o circuito.
//!
//! Quem transmite é um **segundo participante** da sala, `<userId>#tela`,
//! ligado direto deste processo pelo SDK Rust do LiveKit (o mesmo caminho do
//! Discord). A alternativa — empurrar os quadros crus para o JS por IPC e
//! publicar pelo `canvas.captureStream` — morre na banda: 1440p60 são ~330 MB/s
//! de quadros atravessando o canal do WebView2. Aqui o quadro sai da captura,
//! vira I420 e entra no encoder sem sair do Rust.
//!
//! A conexão do webview (voz, câmera) não muda: o `#tela` entra quando a
//! transmissão começa e sai quando ela para. A web funde as faixas dele no
//! tile do dono (`donoDaIdentidade`, em `@streamz/shared`).
//!
//! Uma thread por transmissão, dona de tudo o que ela precisa (captura, fonte
//! de vídeo, sala). Parar é levantar uma bandeira e esperar a thread: não há
//! `Room` compartilhado atrás de mutex, e não há como o comando `parar_tela`
//! e o fim natural (janela fechada) disputarem quem desliga o quê.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use livekit::options::{AudioEncoding, TrackPublishOptions, VideoEncoding};
use livekit::prelude::*;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use livekit::webrtc::native::yuv_helper;
use livekit::webrtc::prelude::*;
use livekit::webrtc::video_source::native::NativeVideoSource;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{error::TryRecvError, UnboundedReceiver};

use super::audio::{self, ErroDeAudio, Loopback};
use super::captura::{self, Capturador, Erro, Quadro};
use super::fontes;

/// Evento para a web quando a transmissão acaba **sem** o `parar_tela`: a
/// janela fechou, a sala caiu. O payload é o motivo, para a mensagem certa.
pub const EVENTO_ENCERRADA: &str = "tela:encerrada";

/// O que a web manda para começar. Resolução, taxa e bitrate vêm do preset
/// `SCREEN_QUALITY` de `@streamz/shared` — o contrato continua único, e o
/// Rust não tem cópia dele.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pedido {
    pub url: String,
    pub token: String,
    pub fonte_id: String,
    pub largura: u32,
    pub altura: u32,
    pub fps: u32,
    pub max_bitrate: u64,
    /// Levar o som do sistema junto (WASAPI loopback, ver `audio.rs`).
    #[serde(default)]
    pub audio: bool,
    /// Teto do áudio da tela (`MEDIA_QUALITY.screenAudioBitrate` na web).
    #[serde(default = "bitrate_de_audio_padrao")]
    pub audio_max_bitrate: u64,
}

fn bitrate_de_audio_padrao() -> u64 {
    160_000
}

/// O que a web manda para **pré-conectar** (ver `preparar`): só a credencial,
/// porque ainda não há fonte escolhida.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preparo {
    pub url: String,
    pub token: String,
}

/// Quanto custou cada etapa de ir ao ar, em milissegundos. Volta para a web,
/// que imprime em `console.debug` — sem isto, "demorou" é a única medida que
/// existe da máquina do usuário.
#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tempos {
    /// Abrir a sessão de captura (dispositivo D3D, fila de quadros).
    pub captura_ms: u64,
    /// Esperar o primeiro quadro da fonte. É aqui que uma **janela** parada
    /// se separa de um monitor, que repinta sempre.
    pub primeiro_quadro_ms: u64,
    /// Entrar na sala do LiveKit. Zero quando a pré-conexão foi aproveitada.
    pub conexao_ms: u64,
    /// Publicar as faixas (vídeo e, se pedido, áudio do sistema).
    pub publicacao_ms: u64,
    pub total_ms: u64,
    /// A sala já estava conectada pelo `preparar` do seletor.
    pub reaproveitou_sala: bool,
    /// Nenhum quadro chegou antes de publicar: a fonte não repintou a tempo, e
    /// o primeiro quadro vai sair quando ela repintar.
    pub sem_primeiro_quadro: bool,
}

/// Quanto esperar pelo primeiro quadro antes de publicar.
///
/// Publicar com um quadro na mão faz diferença duas vezes: o encoder é
/// configurado no tamanho real da fonte (nada de reconfigurar no primeiro
/// quadro) e a faixa sobe já com imagem, em vez de subir vazia e o outro lado
/// ficar em "Carregando a transmissão…" até a janela repintar. É um teto
/// baixo de propósito — em monitor o quadro chega em um vsync, e em janela
/// visível o `cutucar` do WGC provoca o repinte. Passou disto, segue-se sem
/// ele: melhor a faixa no ar do que a espera.
const ESPERA_DO_PRIMEIRO_QUADRO: Duration = Duration::from_millis(400);

/// Por que a transmissão acabou sozinha.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Motivo {
    /// A janela fechou ou o monitor foi desligado.
    FonteSumiu,
    /// A sala do LiveKit desconectou e não voltou.
    Desconectado,
    /// A API de captura falhou no meio.
    Falha,
}

struct EmCurso {
    parar: Arc<AtomicBool>,
    thread: JoinHandle<()>,
    /// A thread do áudio do sistema, quando o pedido levou som.
    audio: Option<JoinHandle<()>>,
}

impl EmCurso {
    /// Levanta a bandeira e espera as duas threads.
    fn encerrar(self) {
        self.parar.store(true, Ordering::Release);
        let _ = self.thread.join();
        if let Some(audio) = self.audio {
            let _ = audio.join();
        }
    }
}

/// A sala já conectada pelo seletor, esperando alguém escolher uma fonte.
struct Preparada {
    /// A credencial que a abriu: `iniciar` só a reaproveita se for a mesma
    /// sala (trocar de canal entre abrir o seletor e clicar muda o token).
    url: String,
    token: String,
    sala: Room,
    eventos: UnboundedReceiver<RoomEvent>,
}

/// Estado gerenciado pelo Tauri: a transmissão em curso e a sala pré-conectada.
#[derive(Default)]
pub struct Transmissao {
    atual: Mutex<Option<EmCurso>>,
    preparada: Mutex<Option<Preparada>>,
}

impl Transmissao {
    fn tomar(&self) -> Option<EmCurso> {
        self.atual.lock().unwrap_or_else(|e| e.into_inner()).take()
    }

    fn guardar(&self, em_curso: EmCurso) {
        *self.atual.lock().unwrap_or_else(|e| e.into_inner()) = Some(em_curso);
    }

    fn transmitindo(&self) -> bool {
        self.atual
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_some()
    }

    fn tomar_preparada(&self) -> Option<Preparada> {
        self.preparada
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
    }

    fn guardar_preparada(&self, preparada: Preparada) {
        *self.preparada.lock().unwrap_or_else(|e| e.into_inner()) = Some(preparada);
    }

    /// Já há uma sala pronta com esta credencial?
    fn tem_preparada(&self, url: &str, token: &str) -> bool {
        self.preparada
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .is_some_and(|p| p.url == url && p.token == token)
    }

    /// Para e espera a thread, e derruba a sala pré-conectada. Síncrono de
    /// propósito: é o que o encerramento do app chama, e ali não há runtime
    /// para esperar.
    pub fn encerrar(&self) {
        if let Some(preparada) = self.tomar_preparada() {
            fechar_em_outra_thread(preparada.sala);
        }
        if let Some(em_curso) = self.tomar() {
            em_curso.encerrar();
        }
    }
}

/// Sai da sala de uma thread própria. `Room::close` é assíncrono e quem chama
/// isto pode ser a thread do encerramento do app, que não é do runtime.
fn fechar_em_outra_thread(sala: Room) {
    if let Ok(thread) = std::thread::Builder::new()
        .name("streamz-tela-fechar".into())
        .spawn(move || {
            let _ = tauri::async_runtime::block_on(sala.close());
        })
    {
        let _ = thread.join();
    }
}

/// Entra na sala como `<userId>#tela` sem publicar nada, para o clique na
/// miniatura só ter de publicar. Ver o comando `preparar_tela`.
///
/// **Não pré-conecta durante uma transmissão.** A identidade `<userId>#tela` é
/// única no LiveKit: uma segunda conexão com ela expulsaria a que está no ar.
/// Reabrir o seletor para trocar de fonte cai no caminho de sempre.
pub async fn preparar(estado: &Transmissao, preparo: Preparo) -> Result<(), String> {
    if estado.transmitindo() || estado.tem_preparada(&preparo.url, &preparo.token) {
        return Ok(());
    }
    descartar(estado).await;
    let mut opcoes = RoomOptions::default();
    opcoes.auto_subscribe = false;
    let (sala, eventos) = Room::connect(&preparo.url, &preparo.token, opcoes)
        .await
        .map_err(|e| format!("não foi possível entrar na sala: {e}"))?;
    estado.guardar_preparada(Preparada {
        url: preparo.url,
        token: preparo.token,
        sala,
        eventos,
    });
    Ok(())
}

/// Derruba a sala pré-conectada, se houver: o seletor fechou sem escolha.
pub async fn descartar(estado: &Transmissao) {
    if let Some(preparada) = estado.tomar_preparada() {
        let _ = preparada.sala.close().await;
    }
}

pub async fn iniciar(
    app: AppHandle,
    estado: &Transmissao,
    pedido: Pedido,
) -> Result<Tempos, String> {
    let comeco = Instant::now();
    let mut tempos = Tempos::default();

    // Uma transmissão por vez: começar outra é trocar de fonte.
    parar(estado).await;

    let alvo = fontes::alvo(&pedido.fonte_id)
        .ok_or_else(|| "A janela ou tela escolhida não existe mais".to_string())?;
    // Abrir a captura antes de entrar na sala: se a fonte recusar (conteúdo
    // protegido, janela que sumiu), ninguém vê um `#tela` entrar e sair.
    //
    // E, na mesma ida à thread de bloqueio, **esperar o primeiro quadro**: com
    // ele na mão o encoder nasce no tamanho certo e a faixa sobe já com
    // imagem. Ver `ESPERA_DO_PRIMEIRO_QUADRO`.
    let marca = Instant::now();
    let (capturador, primeiro, captura_ms) =
        tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
            let aberta = Instant::now();
            let mut capturador = captura::abrir(alvo).map_err(|e| e.to_string())?;
            let captura_ms = aberta.elapsed().as_millis() as u64;
            let primeiro = match capturador.proximo_quadro(ESPERA_DO_PRIMEIRO_QUADRO) {
                Ok(quadro) => quadro,
                // A fonte sumiu entre escolher e capturar: dizer isso agora é
                // melhor que publicar uma faixa que nunca teria imagem.
                Err(e) => return Err(e.to_string()),
            };
            Ok((capturador, primeiro, captura_ms))
        })
        .await
        .map_err(|e| format!("falha ao abrir a captura: {e}"))??;
    tempos.captura_ms = captura_ms;
    tempos.primeiro_quadro_ms = (marca.elapsed().as_millis() as u64).saturating_sub(captura_ms);
    tempos.sem_primeiro_quadro = primeiro.is_none();

    // A sala pré-conectada pelo seletor, quando é a mesma credencial. É a
    // etapa que sozinha custava segundos no clique (ver `preparar`).
    let marca = Instant::now();
    let (sala, eventos) = match estado.tomar_preparada() {
        Some(preparada) if preparada.url == pedido.url && preparada.token == pedido.token => {
            tempos.reaproveitou_sala = true;
            (preparada.sala, preparada.eventos)
        }
        // Credencial diferente (o usuário trocou de canal com o seletor
        // aberto): a sala pronta não serve, e deixá-la conectada seria um
        // `#tela` fantasma em outra sala.
        outra => {
            if let Some(outra) = outra {
                let _ = outra.sala.close().await;
            }
            let mut opcoes = RoomOptions::default();
            // Este participante só publica (o token nem permite assinar): não
            // baixar o áudio de ninguém — a pessoa já ouve pela conexão do
            // webview.
            opcoes.auto_subscribe = false;
            Room::connect(&pedido.url, &pedido.token, opcoes)
                .await
                .map_err(|e| format!("não foi possível entrar na sala: {e}"))?
        }
    };
    tempos.conexao_ms = marca.elapsed().as_millis() as u64;

    // O teto do preset, já em dimensões pares; a fonte real se encaixa nele
    // quadro a quadro (`para_i420`).
    let (largura_max, altura_max) =
        encaixar(pedido.largura, pedido.altura, pedido.largura, pedido.altura);
    // A resolução **declarada** é a do primeiro quadro já encaixado, e não o
    // teto do preset. Uma janela quase nunca tem o tamanho do preset: declarar
    // 1920×1080 e entregar 1263×943 obriga o encoder a se reconfigurar no
    // primeiro quadro, que é justamente o quadro que se quer rápido. Sem
    // primeiro quadro não há o que medir, e o teto volta a ser o palpite.
    let (largura, altura) = primeiro.as_ref().map_or((largura_max, altura_max), |q| {
        encaixar(q.largura, q.altura, largura_max, altura_max)
    });
    let fonte = NativeVideoSource::new(
        VideoResolution {
            width: largura,
            height: altura,
        },
        // "screencast": o encoder prioriza nitidez de texto sobre movimento
        // suave, o mesmo que o `contentHint = "detail"` faz na web.
        true,
    );
    let faixa = LocalVideoTrack::create_video_track("tela", RtcVideoSource::Native(fonte.clone()));

    // O quadro entra na fonte **antes** de publicar: quando o SFU encaminhar a
    // faixa, o encoder já terá conteúdo, e o outro lado vê imagem em vez do
    // "Carregando a transmissão…" até a fonte repintar.
    if let Some(quadro) = &primeiro {
        empurrar(&fonte, quadro, largura_max, altura_max);
    }

    // Espelha o `publicarTela` da web: teto de bitrate do preset, sem
    // simulcast (quem abre uma tela quer lê-la, não uma camada reduzida) e,
    // com banda apertada, derrubar quadros em vez de resolução.
    let marca = Instant::now();
    let publicacao = TrackPublishOptions {
        source: TrackSource::Screenshare,
        video_encoding: Some(VideoEncoding {
            max_bitrate: pedido.max_bitrate,
            max_framerate: f64::from(pedido.fps),
        }),
        simulcast: false,
        degradation_preference: Some(DegradationPreference::MaintainResolution),
        ..Default::default()
    };
    sala.local_participant()
        .publish_track(LocalTrack::Video(faixa), publicacao)
        .await
        .map_err(|e| format!("não foi possível publicar a tela: {e}"))?;

    // O áudio do sistema é uma segunda faixa do mesmo participante. Falhar
    // aqui (sem dispositivo de saída, formato estranho) não derruba o vídeo:
    // a transmissão segue muda, como quando a opção está desligada.
    let fonte_audio = if pedido.audio {
        let fonte = NativeAudioSource::new(
            // sem cancelamento de eco nem supressão: a fonte é o próprio
            // sistema, e os processadores de voz achatariam música em mono
            AudioSourceOptions::default(),
            audio::TAXA,
            u32::from(audio::CANAIS),
            FILA_DE_AUDIO_MS,
        );
        let faixa = LocalAudioTrack::create_audio_track(
            "tela-audio",
            RtcAudioSource::Native(fonte.clone()),
        );
        // Mesmas opções do `publicarTela` da web: estéreo, bitrate alto, sem
        // DTX (existe para cortar silêncio de conversa) e sem RED.
        let publicacao = TrackPublishOptions {
            source: TrackSource::ScreenshareAudio,
            audio_encoding: Some(AudioEncoding {
                max_bitrate: pedido.audio_max_bitrate,
            }),
            dtx: false,
            red: false,
            ..Default::default()
        };
        match sala
            .local_participant()
            .publish_track(LocalTrack::Audio(faixa), publicacao)
            .await
        {
            Ok(_) => Some(fonte),
            Err(_) => None,
        }
    } else {
        None
    };
    tempos.publicacao_ms = marca.elapsed().as_millis() as u64;

    let parar_bandeira = Arc::new(AtomicBool::new(false));
    let bandeira = parar_bandeira.clone();
    let fps = pedido.fps.max(1);
    let thread = std::thread::Builder::new()
        .name("streamz-tela".into())
        .spawn(move || {
            let motivo = transmitir(
                capturador,
                &fonte,
                (largura_max, altura_max),
                fps,
                &bandeira,
                eventos,
            );
            // Sair da sala antes de avisar: quando a web reagir ao evento, o
            // `#tela` já não está lá.
            let _ = tauri::async_runtime::block_on(sala.close());
            if let Some(motivo) = motivo {
                let _ = app.emit(EVENTO_ENCERRADA, motivo);
            }
        })
        .map_err(|e| format!("não foi possível iniciar a thread de transmissão: {e}"))?;

    let bandeira_audio = parar_bandeira.clone();
    let audio = fonte_audio.and_then(|fonte| {
        std::thread::Builder::new()
            .name("streamz-tela-audio".into())
            .spawn(move || transmitir_audio(&fonte, &bandeira_audio))
            .ok()
    });

    estado.guardar(EmCurso {
        parar: parar_bandeira,
        thread,
        audio,
    });
    tempos.total_ms = comeco.elapsed().as_millis() as u64;
    Ok(tempos)
}

/// Para a transmissão em curso, se houver, e espera a thread sair da sala.
pub async fn parar(estado: &Transmissao) {
    if let Some(em_curso) = estado.tomar() {
        // Esperar fora do runtime: a thread pode estar no meio de um
        // `block_on(sala.close())`, e bloquear uma thread do tokio esperando
        // por isso é pedir um impasse.
        let _ = tauri::async_runtime::spawn_blocking(move || em_curso.encerrar()).await;
    }
}

/// Fila da fonte de áudio, em ms (múltiplo de 10, exigência do SDK). É o
/// quanto o encoder aceita adiantado antes de `capture_frame` segurar a
/// thread; 200 ms cobre um engasgo da leitura sem virar atraso audível.
const FILA_DE_AUDIO_MS: u32 = 200;
/// Sem pacote novo no mixer, quanto dormir antes de perguntar de novo.
const PAUSA_SEM_AUDIO: Duration = Duration::from_millis(5);
/// Tentativas de reabrir o loopback depois de o dispositivo mudar.
const REABERTURAS: u32 = 10;

/// O laço do áudio do sistema: lê o loopback e empurra para a fonte. Termina
/// com a bandeira, ou quando o loopback não reabre mais.
fn transmitir_audio(fonte: &NativeAudioSource, parar: &AtomicBool) {
    let mut loopback = match Loopback::abrir() {
        Ok(l) => l,
        Err(_) => return,
    };
    let mut amostras: Vec<i16> = Vec::new();
    let mut reaberturas = 0;
    while !parar.load(Ordering::Acquire) {
        amostras.clear();
        match loopback.ler(&mut amostras) {
            Ok(()) => {}
            Err(ErroDeAudio::DispositivoInvalidado) => {
                // Trocou o fone: reabrir no novo padrão. Um sono entre as
                // tentativas porque o Windows leva um instante para eleger
                // o dispositivo novo.
                reaberturas += 1;
                if reaberturas > REABERTURAS {
                    return;
                }
                std::thread::sleep(Duration::from_millis(200));
                if let Ok(novo) = Loopback::abrir() {
                    loopback = novo;
                    reaberturas = 0;
                }
                continue;
            }
            Err(ErroDeAudio::Falha) => return,
        }
        if amostras.is_empty() {
            std::thread::sleep(PAUSA_SEM_AUDIO);
            continue;
        }
        let quadro = AudioFrame {
            data: std::borrow::Cow::Borrowed(&amostras),
            sample_rate: audio::TAXA,
            num_channels: u32::from(audio::CANAIS),
            samples_per_channel: (amostras.len() / usize::from(audio::CANAIS)) as u32,
        };
        // `capture_frame` segura quando a fila está cheia — é a cadência.
        if tauri::async_runtime::block_on(fonte.capture_frame(&quadro)).is_err() {
            return;
        }
    }
}

/// O laço da transmissão. Devolve `None` quando parou a pedido, ou o motivo
/// quando acabou sozinha.
fn transmitir(
    mut capturador: Box<dyn Capturador>,
    fonte: &NativeVideoSource,
    (largura_max, altura_max): (u32, u32),
    fps: u32,
    parar: &AtomicBool,
    mut eventos: UnboundedReceiver<RoomEvent>,
) -> Option<Motivo> {
    let intervalo = Duration::from_micros(1_000_000 / u64::from(fps));
    let mut ultimo = Instant::now() - intervalo;
    loop {
        if parar.load(Ordering::Acquire) {
            return None;
        }
        if sala_caiu(&mut eventos) {
            return Some(Motivo::Desconectado);
        }
        match capturador.proximo_quadro(intervalo) {
            Ok(Some(quadro)) => {
                // A fonte pode repintar mais rápido que o preset (60 Hz de
                // tela para 30 fps): quadro adiantado é descartado antes de
                // custar a conversão.
                if ultimo.elapsed() < intervalo {
                    continue;
                }
                empurrar(fonte, &quadro, largura_max, altura_max);
                ultimo = Instant::now();
            }
            // Nada repintou: o encoder segue com o último quadro que recebeu.
            Ok(None) => {}
            Err(Erro::FonteSumiu) => return Some(Motivo::FonteSumiu),
            Err(Erro::Falha(_)) => return Some(Motivo::Falha),
        }
    }
}

/// Drena os eventos da sala e diz se ela desconectou de vez. Os outros
/// eventos não interessam a um participante que só publica.
fn sala_caiu(eventos: &mut UnboundedReceiver<RoomEvent>) -> bool {
    loop {
        match eventos.try_recv() {
            Ok(RoomEvent::Disconnected { .. }) | Err(TryRecvError::Disconnected) => return true,
            Ok(_) => {}
            Err(TryRecvError::Empty) => return false,
        }
    }
}

/// Converte e entrega um quadro à fonte de vídeo do SDK.
///
/// Está separado do laço porque o **primeiro** quadro é empurrado em
/// `iniciar`, antes de publicar a faixa: assim a publicação já sobe com
/// imagem.
fn empurrar(fonte: &NativeVideoSource, quadro: &Quadro, largura_max: u32, altura_max: u32) {
    let buffer = para_i420(quadro, largura_max, altura_max);
    fonte.capture_frame(&VideoFrame {
        rotation: VideoRotation::VideoRotation0,
        // zero = "agora", pelo relógio do SDK
        timestamp_us: 0,
        frame_metadata: None,
        buffer,
    });
}

/// BGRA → I420 na resolução da fonte e, se ela for maior que o preset,
/// redução mantendo a proporção. A libyuv chama de "ARGB" a ordem de bytes
/// B, G, R, A em memória — exatamente o que o Windows entrega.
fn para_i420(quadro: &Quadro, largura_max: u32, altura_max: u32) -> I420Buffer {
    let mut cheio = I420Buffer::new(quadro.largura, quadro.altura);
    let (passo_y, passo_u, passo_v) = cheio.strides();
    let (y, u, v) = cheio.data_mut();
    yuv_helper::argb_to_i420(
        &quadro.bgra,
        quadro.largura * 4,
        y,
        passo_y,
        u,
        passo_u,
        v,
        passo_v,
        quadro.largura as i32,
        quadro.altura as i32,
    );
    let (largura, altura) = encaixar(quadro.largura, quadro.altura, largura_max, altura_max);
    if (largura, altura) == (quadro.largura, quadro.altura) {
        cheio
    } else {
        cheio.scale(largura as i32, altura as i32)
    }
}

/// Encaixa `largura`×`altura` dentro de `max_l`×`max_a` mantendo a proporção,
/// em dimensões pares (o I420 divide o croma por dois). Fonte menor que o
/// preset fica como está: ampliar só gastaria bitrate em pixels inventados.
fn encaixar(largura: u32, altura: u32, max_l: u32, max_a: u32) -> (u32, u32) {
    let (largura, altura) = (largura.max(2), altura.max(2));
    if largura <= max_l && altura <= max_a {
        return (largura & !1, altura & !1);
    }
    let escala = f64::from(max_l) / f64::from(largura);
    let escala = escala.min(f64::from(max_a) / f64::from(altura));
    let l = ((f64::from(largura) * escala).round() as u32).max(2) & !1;
    let a = ((f64::from(altura) * escala).round() as u32).max(2) & !1;
    (l, a)
}

#[cfg(test)]
mod testes {
    use super::encaixar;

    #[test]
    fn fonte_menor_que_o_preset_nao_amplia() {
        assert_eq!(encaixar(1280, 720, 1920, 1080), (1280, 720));
    }

    #[test]
    fn fonte_maior_reduz_mantendo_a_proporcao() {
        assert_eq!(encaixar(2560, 1440, 1920, 1080), (1920, 1080));
        assert_eq!(encaixar(3840, 1600, 1920, 1080), (1920, 800));
        assert_eq!(encaixar(1080, 1920, 1920, 1080), (608, 1080));
    }

    #[test]
    fn dimensoes_saem_pares() {
        assert_eq!(encaixar(1001, 601, 1920, 1080), (1000, 600));
        assert_eq!(encaixar(2561, 1441, 1280, 720), (1280, 720));
    }
}
