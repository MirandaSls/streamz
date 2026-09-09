//! O plugin `chamada`: a ponte entre o webview e o serviço de primeiro plano
//! do Android (`ChamadaService.kt`).
//!
//! **Só existe no Android.** O módulo inteiro entra em `lib.rs` atrás de
//! `#[cfg(target_os = "android")]`, e não há implementação para os outros
//! alvos de propósito: no Windows a janela escondida na bandeja já segura a
//! call (ver os argumentos do WebView2 em `lib.rs`), e no iOS quem faz esse
//! papel é `UIBackgroundModes: audio` no `Info.ios.plist`, que é configuração,
//! não código. Um "stub que não faz nada" nos outros alvos seria uma promessa
//! falsa na superfície de API.
//!
//! **Formato.** É um plugin do Tauri 2 no desenho da doc oficial de plugins
//! mobile (<https://v2.tauri.app/develop/plugins/develop-mobile/>): um
//! `plugin::Builder` cujo `setup` chama `register_android_plugin`, comandos que
//! repassam com `run_mobile_plugin`, e a classe Kotlin do outro lado. O que ele
//! **não** é: um crate separado. O `tauri-build` chama isso de *inlined
//! plugin* (`InlinedPlugin` no `build.rs`) e é o caminho suportado para um
//! plugin que só faz sentido dentro deste app — não há o que publicar, e um
//! crate a mais seria um `Cargo.toml`, um `package.json` e uma versão a
//! sincronizar para três funções.
//!
//! Consequência de ser um plugin (e não um comando do app, como o `tela`): os
//! comandos passam pela ACL, e é por isso que `capabilities/mobile.json` lista
//! `chamada:default`. O `build.rs` gera essa permissão a partir da lista de
//! comandos.

use tauri::{
    ipc::Channel,
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Manager, Runtime,
};

/// O pacote Java onde a classe mora. O Tauri instancia
/// `dev.streamz.app.ChamadaPlugin` por reflexão a partir destes dois pedaços.
const IDENTIFICADOR: &str = "dev.streamz.app";
const CLASSE: &str = "ChamadaPlugin";

/// O `PluginHandle` guardado no estado do app: é ele que fala com o Kotlin.
struct Chamada<R: Runtime>(PluginHandle<R>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ArgumentosDeInicio {
    titulo: String,
    texto: String,
}

#[derive(serde::Serialize)]
struct ArgumentosDeOuvinte {
    /// Serializa como `"__CHANNEL__:<id>"`, que é exatamente o que o
    /// `ChannelDeserializer` do Kotlin sabe ler. A partir daí o Kotlin escreve
    /// direto no IPC do webview — o Rust não fica no meio do caminho de volta.
    canal: Channel<serde_json::Value>,
}

/// Liga o serviço de primeiro plano. Idempotente: chamar duas vezes só
/// atualiza a notificação.
//
// Os três comandos recebem `app: AppHandle<R>` e buscam o estado a partir dele
// em vez de declarar `State<'_, Chamada<R>>` no argumento. Não é estilo: o
// `generate_handler!` só consegue amarrar o `R` do comando ao `R` do runtime
// por um argumento que o carregue, e um `State<'_, Chamada<R>>` sozinho deixa o
// `R` solto — o compilador recusa com "type annotations needed: cannot infer
// type", apontando para a macro e não para o comando.
#[tauri::command]
async fn iniciar_servico_de_chamada<R: Runtime>(
    app: AppHandle<R>,
    titulo: String,
    texto: String,
) -> Result<(), String> {
    app.state::<Chamada<R>>()
        .0
        .run_mobile_plugin::<()>(
            "iniciarServicoDeChamada",
            ArgumentosDeInicio { titulo, texto },
        )
        .map_err(|e| e.to_string())
}

/// Desliga o serviço e tira a notificação. Idempotente: parar o que já parou
/// não é erro — e o caminho de saída da web passa por aqui em toda queda,
/// inclusive nas que ninguém pediu.
#[tauri::command]
async fn parar_servico_de_chamada<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.state::<Chamada<R>>()
        .0
        .run_mobile_plugin::<()>("pararServicoDeChamada", ())
        .map_err(|e| e.to_string())
}

/// Registra o canal por onde o botão "Sair da chamada" da notificação avisa a
/// web. Chamar de novo substitui o canal anterior (é o que se quer depois de um
/// reload: o canal velho aponta para um webview que não existe mais).
#[tauri::command]
async fn registrar_ouvinte_de_saida<R: Runtime>(
    app: AppHandle<R>,
    canal: Channel<serde_json::Value>,
) -> Result<(), String> {
    app.state::<Chamada<R>>()
        .0
        .run_mobile_plugin::<()>("registrarOuvinteDeSaida", ArgumentosDeOuvinte { canal })
        .map_err(|e| e.to_string())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("chamada")
        .invoke_handler(tauri::generate_handler![
            iniciar_servico_de_chamada,
            parar_servico_de_chamada,
            registrar_ouvinte_de_saida,
        ])
        .setup(|app: &AppHandle<R>, api| {
            let handle = api.register_android_plugin(IDENTIFICADOR, CLASSE)?;
            app.manage(Chamada(handle));
            Ok(())
        })
        .build()
}
