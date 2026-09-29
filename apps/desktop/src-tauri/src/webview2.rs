//! Runtime do WebView2 velho demais: o app pede a atualização sozinho.
//!
//! **O defeito (logs do LiveKit, 2026-09-29).** Um único usuário da instância
//! rodava o WebView2 126 (meados de 2024); todo o resto estava em 151–153. O
//! runtime Evergreen deveria se atualizar pelo Microsoft Edge Update, mas
//! naquela máquina o atualizador parou — e o app desktop herda o Chromium do
//! runtime, WebRTC incluído. Resultado: 8 de 30 sessões de voz no app caíram
//! com `PEER_CONNECTION_DISCONNECTED`, contra 1 no Chrome 152 da mesma pessoa.
//! Ninguém abre o "Aplicativos instalados" para atualizar um componente que
//! não sabe que existe; o app sabe, então o app pede.
//!
//! **Como.** No boot, fora da thread do `setup`, lê a versão disponível. Abaixo
//! de [`VERSAO_MINIMA`], baixa o Evergreen Bootstrapper oficial da Microsoft e
//! o roda em silêncio. O runtime novo só vale na **próxima** abertura: o
//! processo atual já carregou o antigo, e um WebView2 não troca de runtime com
//! a página no ar. A web fica sabendo pelo evento `webview2:atualizacao`
//! (`estado`: `atualizando` → `concluida` | `falhou`) e, se abriu depois de ele
//! sair, pelo comando [`estado_do_webview2`], que devolve o último estado.
//!
//! **O bootstrapper atualiza um runtime já instalado?** Sim, e é por isso que
//! serve aqui. Ele não é um instalador com o runtime dentro: é um *stub* do
//! Microsoft Edge Update (Omaha) que pede ao servidor da Microsoft a versão
//! **mais recente** do Evergreen e a instala. Com uma versão mais antiga já
//! presente, o `/install` do Omaha vira uma atualização (instala a nova ao
//! lado, e o runtime velho sai quando ninguém mais o usa); com a mais nova já
//! presente, ele termina sem fazer nada. Não existe flag de "atualizar" à
//! parte — `/silent /install` é a linha que a própria documentação de
//! distribuição do WebView2 manda usar nos dois casos. De bônus, o stub
//! reinstala o próprio Edge Update, que é justamente a peça que quebrou na
//! máquina do usuário: se o reparo pegar, o runtime volta a se atualizar
//! sozinho e este módulo não precisa agir de novo.
//!
//! **Per-machine × per-user.** Sem elevação o bootstrapper instala *per-user*
//! (`%LOCALAPPDATA%\Microsoft\EdgeWebView\Application`). Se o runtime velho
//! estiver *per-machine* (`Program Files (x86)`, que exige admin), os dois
//! passam a conviver — e o carregador do WebView2 (`WebView2Loader`/o que o
//! wry embute) escolhe a **versão mais nova** entre as instalações Evergreen
//! que encontra, per-machine e per-user. Ou seja, a instalação per-user basta,
//! sem UAC. O caso que isso não cobre: um Omaha que insiste em elevar para
//! atualizar a instalação per-machine; com `/silent` não há janela de UAC, o
//! processo sai com código diferente de zero e caímos no `falhou` — que é
//! honesto, e o [`INTERVALO_ENTRE_TENTATIVAS`] impede de repetir a cada boot.
//!
//! **Por que `curl.exe` e não uma crate HTTP.** Nenhum cliente HTTP é
//! dependência direta deste crate: o `reqwest` do `Cargo.lock` vem do
//! `tauri-plugin-updater` (e em duas versões), e usá-lo aqui seria declarar uma
//! terceira dependência de rede, com as features casadas à mão, para baixar um
//! arquivo uma vez na vida de uma máquina rara. O `curl.exe` vem no Windows 10
//! 1803+ e no 11 — e o WebView2 Evergreen só existe do 10 para cima, então a
//! máquina que chega aqui quase certamente o tem. Ele é chamado pelo caminho
//! absoluto em `%SystemRoot%\System32`, não pelo `PATH`, para não executar um
//! `curl.exe` qualquer que esteja na pasta atual. Sem ele, falha limpa.
//!
//! **Nunca derruba o app.** Toda falha vira `log::warn!` e o evento `falhou`;
//! nada aqui usa `unwrap`, e a thread nasce por `Builder::spawn`, que devolve
//! `Result` em vez de entrar em pânico.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::{Emitter, Manager};

/// Major mínimo do Chromium do WebView2. Abaixo disso o WebRTC é antigo o
/// bastante para já nos ter custado quedas de voz (o 126 do defeito acima).
/// Subir a constante quando precisarmos de algo de um Chromium mais novo — o
/// Evergreen está sempre várias versões à frente, então 140 não força ninguém
/// que esteja se atualizando normalmente.
const VERSAO_MINIMA: u32 = 140;

/// Evergreen Bootstrapper oficial (o link da página de download do WebView2).
const URL_DO_BOOTSTRAPPER: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

/// Nome do instalador em `%TEMP%`.
const NOME_DO_INSTALADOR: &str = "StreamzWebView2Setup.exe";

/// Marcador da última tentativa, na pasta local do app. Local (e não roaming)
/// porque é estado desta máquina: num perfil móvel, a tentativa de um PC não
/// pode calar a de outro.
const NOME_DO_MARCADOR: &str = "webview2-ultima-tentativa.txt";

/// Máquina em que a instalação falha sempre (sem rede para a Microsoft,
/// política de grupo bloqueando, Omaha pedindo elevação): tentar a cada
/// abertura seria baixar ~2 MB e rodar um instalador toda vez, para o mesmo
/// erro. Um dia é o bastante para uma rede ou uma política mudar.
const INTERVALO_ENTRE_TENTATIVAS: Duration = Duration::from_secs(24 * 60 * 60);

/// Teto do download. O bootstrapper tem ~2 MB; cinco minutos cobrem rede ruim
/// sem deixar um `curl` pendurado para sempre.
const TETO_DO_DOWNLOAD: Duration = Duration::from_secs(5 * 60);

/// Teto da instalação. O bootstrapper baixa o runtime inteiro (~150 MB) antes
/// de instalar; dez minutos é folga para conexão lenta, e depois disso é mais
/// provável que ele esteja preso esperando algo que nunca vem.
const TETO_DA_INSTALACAO: Duration = Duration::from_secs(10 * 60);

/// `CREATE_NO_WINDOW`: o app é `windows_subsystem = "windows"`; sem isto cada
/// processo filho de console piscaria uma janela preta na cara do usuário.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Nome do evento que a web ouve.
const EVENTO: &str = "webview2:atualizacao";

/// Último estado emitido. O evento pode sair antes de a página registrar o
/// ouvinte (a verificação começa no `setup`, a web ainda está carregando), e
/// um evento do Tauri não é reentregue — daí guardar o último para
/// [`estado_do_webview2`]. `None` = nada a relatar (versão em dia ou ainda
/// verificando).
static ULTIMO_ESTADO: Mutex<Option<Value>> = Mutex::new(None);

/// O último estado da atualização do WebView2, para a web que abriu depois do
/// evento. `None` quando não houve (nem há) atualização.
#[tauri::command]
pub fn estado_do_webview2() -> Option<Value> {
    ULTIMO_ESTADO.lock().ok().and_then(|estado| estado.clone())
}

/// Confere a versão do runtime e, se velha, atualiza em segundo plano. Chamada
/// no `setup` depois do registro de log; volta na hora.
pub fn verificar_e_atualizar<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app = app.clone();
    let criada = std::thread::Builder::new()
        .name("webview2-atualizacao".into())
        .spawn(move || verificar(&app));
    if let Err(erro) = criada {
        log::warn!("webview2: não foi possível criar a thread de verificação: {erro}");
    }
}

fn verificar<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let versao = match tauri::webview_version() {
        Ok(versao) => versao,
        Err(erro) => {
            // Sem versão não há o que comparar. Se o runtime nem existisse, a
            // janela já não teria subido — então isto é uma leitura que falhou,
            // não um runtime ausente, e instalar às cegas não se justifica.
            log::warn!("webview2: não foi possível ler a versão: {erro}");
            return;
        }
    };
    log::info!("webview2: versão {versao}");

    match major(&versao) {
        Some(m) if m >= VERSAO_MINIMA => return,
        Some(_) => {}
        None => {
            log::warn!("webview2: versão ilegível ({versao}), sem atualização");
            return;
        }
    }

    let marcador = app
        .path()
        .app_local_data_dir()
        .ok()
        .map(|pasta| pasta.join(NOME_DO_MARCADOR));
    if let Some(marcador) = &marcador {
        if tentou_ha_pouco(marcador) {
            log::info!(
                "webview2: abaixo do mínimo ({VERSAO_MINIMA}), mas houve tentativa nas últimas 24 h"
            );
            return;
        }
        // Grava **antes** de tentar: um app fechado (ou derrubado) no meio da
        // instalação também conta como tentativa, senão a próxima abertura
        // repetiria tudo.
        gravar_marcador(marcador);
    }

    log::info!("webview2: abaixo do mínimo ({VERSAO_MINIMA}), atualizando");
    publicar(app, json!({ "estado": "atualizando", "versao": versao }));

    match atualizar() {
        Ok(()) => {
            // A leitura nova diz o que a **próxima** abertura vai carregar; se
            // falhar, a atual é o melhor que há — o exit 0 já é o sinal.
            let nova = tauri::webview_version().unwrap_or_else(|_| versao.clone());
            log::info!("webview2: instalação concluída, {nova} vale após reiniciar o app");
            publicar(app, json!({ "estado": "concluida", "versao": nova }));
        }
        Err(erro) => {
            log::warn!("webview2: atualização falhou: {erro}");
            publicar(
                app,
                json!({ "estado": "falhou", "versao": versao, "erro": erro }),
            );
        }
    }
}

/// Guarda e emite. O guardar vem primeiro: quem chama o comando logo depois do
/// evento tem de ver o mesmo estado.
fn publicar<R: tauri::Runtime>(app: &tauri::AppHandle<R>, estado: Value) {
    if let Ok(mut ultimo) = ULTIMO_ESTADO.lock() {
        *ultimo = Some(estado.clone());
    }
    if let Err(erro) = app.emit(EVENTO, estado) {
        log::warn!("webview2: falha ao emitir {EVENTO}: {erro}");
    }
}

/// `"126.0.2592.113"` → `126`.
fn major(versao: &str) -> Option<u32> {
    versao.trim().split('.').next()?.parse().ok()
}

fn agora() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// O marcador guarda os segundos Unix da tentativa. Ilegível ou do futuro
/// (relógio trocado) conta como "não tentou": melhor uma tentativa a mais do
/// que ficar preso para sempre.
fn tentou_ha_pouco(marcador: &Path) -> bool {
    let Ok(texto) = std::fs::read_to_string(marcador) else {
        return false;
    };
    let Ok(quando) = texto.trim().parse::<u64>() else {
        return false;
    };
    let agora = agora();
    quando <= agora && agora - quando < INTERVALO_ENTRE_TENTATIVAS.as_secs()
}

fn gravar_marcador(marcador: &Path) {
    if let Some(pasta) = marcador.parent() {
        let _ = std::fs::create_dir_all(pasta);
    }
    if let Err(erro) = std::fs::write(marcador, agora().to_string()) {
        // Sem marcador a próxima abertura tenta de novo — custo, não defeito.
        log::warn!("webview2: não foi possível gravar o marcador: {erro}");
    }
}

/// Baixa e roda o bootstrapper. `Err` com um texto para o log e para a web.
fn atualizar() -> Result<(), String> {
    let instalador = std::env::temp_dir().join(NOME_DO_INSTALADOR);
    let resultado = baixar(&instalador).and_then(|()| instalar(&instalador));
    // Apagar sempre: um `.exe` esquecido em `%TEMP%` com o nome do app é lixo
    // e, pior, o que outro processo poderia trocar antes da próxima tentativa.
    let _ = std::fs::remove_file(&instalador);
    resultado
}

fn baixar(destino: &Path) -> Result<(), String> {
    let _ = std::fs::remove_file(destino);
    let curl = caminho_do_curl();
    let mut comando = Command::new(&curl);
    comando
        // `-f`: HTTP 4xx/5xx é erro (sem isto a página de erro viraria o
        // "instalador"); `-L`: o fwlink redireciona; `-s`: sem barra de
        // progresso. O código de saída do curl basta para o log.
        .args(["-fsL", "--retry", "2", "--max-time"])
        .arg(TETO_DO_DOWNLOAD.as_secs().to_string())
        .arg("-o")
        .arg(destino)
        .arg(URL_DO_BOOTSTRAPPER);
    let saida = executar(comando, TETO_DO_DOWNLOAD + Duration::from_secs(30))
        .map_err(|erro| format!("download ({}): {erro}", curl.display()))?;
    if !saida.0 {
        return Err(format!("download: curl saiu com {}", saida.1));
    }
    match std::fs::metadata(destino) {
        Ok(meta) if meta.len() > 0 => Ok(()),
        _ => Err("download: arquivo vazio ou ausente".into()),
    }
}

fn instalar(instalador: &Path) -> Result<(), String> {
    let mut comando = Command::new(instalador);
    comando.args(["/silent", "/install"]);
    let (ok, codigo) =
        executar(comando, TETO_DA_INSTALACAO).map_err(|erro| format!("instalação: {erro}"))?;
    if ok {
        Ok(())
    } else {
        // O código do Omaha é um HRESULT; em hexadecimal é o que se pesquisa.
        Err(format!("instalação: bootstrapper saiu com {codigo}"))
    }
}

/// `%SystemRoot%\System32\curl.exe`, nunca o `curl` do `PATH`.
fn caminho_do_curl() -> PathBuf {
    let raiz = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
    PathBuf::from(raiz).join("System32").join("curl.exe")
}

/// Roda sem janela e espera até `teto`; passou disso, mata. Devolve
/// `(sucesso, código em texto)`.
fn executar(mut comando: Command, teto: Duration) -> Result<(bool, String), String> {
    let mut filho = comando
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|erro| format!("não iniciou: {erro}"))?;
    let inicio = Instant::now();
    loop {
        match filho.try_wait() {
            Ok(Some(status)) => {
                let codigo = match status.code() {
                    Some(c) => format!("0x{:08X}", c as u32),
                    None => "sem código".into(),
                };
                return Ok((status.success(), codigo));
            }
            Ok(None) if inicio.elapsed() >= teto => {
                let _ = filho.kill();
                let _ = filho.wait();
                return Err(format!("passou de {} s", teto.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(500)),
            Err(erro) => return Err(format!("espera falhou: {erro}")),
        }
    }
}
