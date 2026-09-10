//! O plugin `atualizador`: a ponte entre o webview e o `AtualizadorPlugin.kt`,
//! que baixa o `.apk` novo e abre o instalador do sistema.
//!
//! **Só existe no Android.** O módulo inteiro entra em `lib.rs` atrás de
//! `#[cfg(target_os = "android")]`, e isso não é economia: no Windows quem
//! atualiza é o `tauri-plugin-updater`, que baixa, verifica a assinatura
//! minisign e roda o instalador em silêncio; no iOS quem atualiza é a App
//! Store, e um app que instalasse outro seria recusado na revisão. Um "stub que
//! não faz nada" nos outros alvos seria uma promessa falsa na superfície de
//! API — o mesmo raciocínio de `chamada.rs`.
//!
//! **Por que um plugin e não dois comandos do app** (como o `tela`): porque o
//! caminho de volta precisa de um `Channel` que o **Kotlin** escreve direto no
//! IPC do webview, e isso é a forma de plugin mobile do Tauri 2. A consequência
//! é que os comandos passam pela ACL, e por isso `capabilities/mobile.json`
//! lista `atualizador:default`; o `build.rs` gera essa permissão a partir da
//! lista de comandos.
//!
//! **O que este código deliberadamente não faz: conferir o pacote.** O `.apk`
//! tem dezenas de megabytes e nunca atravessa o IPC; quem tem os bytes na mão é
//! o Kotlin, e é lá que o sha256 é calculado no mesmo laço da escrita. O Rust
//! aqui é encanamento, e encanamento que também validasse daria duas verdades
//! sobre o que é um pacote válido.

use tauri::{
    ipc::Channel,
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Manager, Runtime,
};

/// O Tauri instancia `dev.streamz.app.AtualizadorPlugin` por reflexão a partir
/// destes dois pedaços.
const IDENTIFICADOR: &str = "dev.streamz.app";
const CLASSE: &str = "AtualizadorPlugin";

/// O `PluginHandle` guardado no estado do app: é ele que fala com o Kotlin.
struct Atualizador<R: Runtime>(PluginHandle<R>);

#[derive(serde::Serialize)]
struct ArgumentosDeDownload {
    url: String,
    sha256: String,
    /// Serializa como `"__CHANNEL__:<id>"`, que é o que o `ChannelDeserializer`
    /// do Kotlin sabe ler; a partir daí o progresso vai direto do Kotlin ao
    /// webview, sem o Rust no caminho de volta.
    progresso: Channel<serde_json::Value>,
}

#[derive(serde::Serialize)]
struct ArgumentosDeInstalacao {
    caminho: String,
}

/// O que o Kotlin devolve do download: onde o arquivo ficou.
#[derive(serde::Deserialize, serde::Serialize)]
pub struct PacoteBaixado {
    pub caminho: String,
}

/// O que o Kotlin devolve da instalação.
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultadoDaInstalacao {
    /// `true` quando faltava a permissão de "origens desconhecidas". Neste caso
    /// a tela de Ajustes **já foi aberta** e o instalador não; quem explica o
    /// que fazer é a web.
    pub permissao_necessaria: bool,
}

/// Baixa o `.apk` e confere o digest. Falha (com a mensagem do Kotlin) quando o
/// download cai ou quando o sha256 não bate — e nesse caso o arquivo já foi
/// apagado do outro lado.
//
// `app: AppHandle<R>` no argumento, e não `State<'_, Atualizador<R>>`, pelo
// mesmo motivo documentado em `chamada.rs`: o `generate_handler!` precisa de um
// argumento que carregue o `R` para amarrá-lo ao runtime.
#[tauri::command]
async fn baixar_atualizacao<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    sha256: String,
    progresso: Channel<serde_json::Value>,
) -> Result<PacoteBaixado, String> {
    app.state::<Atualizador<R>>()
        .0
        .run_mobile_plugin::<PacoteBaixado>(
            "baixar",
            ArgumentosDeDownload {
                url,
                sha256,
                progresso,
            },
        )
        .map_err(|e| e.to_string())
}

/// Abre o instalador do sistema para o pacote já baixado e conferido.
#[tauri::command]
async fn instalar_atualizacao<R: Runtime>(
    app: AppHandle<R>,
    caminho: String,
) -> Result<ResultadoDaInstalacao, String> {
    app.state::<Atualizador<R>>()
        .0
        .run_mobile_plugin::<ResultadoDaInstalacao>("instalar", ArgumentosDeInstalacao { caminho })
        .map_err(|e| e.to_string())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("atualizador")
        .invoke_handler(tauri::generate_handler![
            baixar_atualizacao,
            instalar_atualizacao,
        ])
        .setup(|app: &AppHandle<R>, api| {
            let handle = api.register_android_plugin(IDENTIFICADOR, CLASSE)?;
            app.manage(Atualizador(handle));
            Ok(())
        })
        .build()
}
