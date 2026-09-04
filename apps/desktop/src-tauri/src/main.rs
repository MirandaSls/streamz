// Evita abrir o console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tela;

// Só o WebView2 tem `PermissionRequested`; nos outros alvos o módulo nem
// existe (ver o porquê dele no próprio arquivo).
#[cfg(windows)]
mod permissoes;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

fn main() {
    // A janela escondida na bandeja precisa continuar na chamada. O WebView2 é
    // Chromium: com a janela oculta ele "backgrounda" o renderer e estrangula
    // os timers, e aí o socket cai e a voz vai junto — exatamente o que a
    // bandeja promete não fazer. Estes três argumentos desligam esse
    // comportamento e precisam estar no ambiente ANTES de o webview subir.
    //
    // Só o WebView2 (Windows) lê esta variável. No WebKit (macOS/Linux) não há
    // equivalente, e a rede de segurança é a do servidor: a carência de voz
    // segura o usuário na sala e o cliente reentra ao voltar
    // (VOICE_RECONNECT_GRACE_MS + `rejoinAposReconexao`).
    //
    // **Não** volte a pôr `--auto-accept-camera-and-microphone-capture` aqui.
    // Ele estava neste bloco para tirar o "permitir microfone e câmera?" do
    // WebView2 e o preço era a lista de dispositivos inteira: a flag aceita a
    // *captura* sem registrar a *permissão*, e o Chromium esconde nome e id de
    // quem não tem permissão concedida. Quem tira o pop-up agora é o
    // `PermissionRequested` do módulo `permissoes` (registrado no `setup`), que
    // responde `ALLOW` **e** deixa a concessão registrada — que é o que o
    // `enumerateDevices()` consulta. A medição que separa os dois casos está lá.
    // Nada de `--use-fake-device-for-media-stream`, que trocaria o microfone
    // real por um gerador de tom.
    //
    // `--autoplay-policy=no-user-gesture-required` é o que faz o **toque de
    // chamada** sair. O WebView2 é Chromium e herda a política padrão
    // (`document-user-activation-required`): `HTMLAudioElement.play()` só é
    // aceito depois que o documento recebeu um clique ou uma tecla. É a razão
    // de o áudio da call funcionar e o telefone não — os `<audio>` do
    // `AudioRemotoHost` nascem **depois** do clique de entrar na chamada
    // (está escrito lá), enquanto o toque precisa começar com o app parado na
    // bandeja, sem gesto nenhum, que é exatamente o caso recusado. No navegador
    // quase sempre já houve um clique na aba antes de o telefone tocar, e por
    // isso o mesmo código soa no site e não soava aqui. A rede de segurança do
    // lado da web (retomar no primeiro gesto) está em `lib/toque-com-gesto.ts`.
    if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-background-timer-throttling \
             --disable-renderer-backgrounding \
             --disable-backgrounding-occluded-windows \
             --autoplay-policy=no-user-gesture-required",
        );
    }

    tauri::Builder::default()
        // Notificações nativas (Tauri 2 → crate própria).
        .plugin(tauri_plugin_notification::init())
        // Auto-update. Quem pede é a janelinha `splash` (ver
        // `components/desktop/JanelaSplash.tsx`): na abertura, antes de a
        // janela principal aparecer, e de novo quando a setinha verde da barra
        // de título é clicada. A checagem falha em silêncio quando o endpoint
        // não tem versão a oferecer.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // `relaunch()` depois de instalar; é o que fecha o ciclo.
        .plugin(tauri_plugin_process::init())
        // Compartilhamento de tela nativo: o que dá para capturar aqui, as
        // fontes, as miniaturas da grade e a transmissão em si. A web só chama
        // isto quando está dentro do app; no navegador ela continua no
        // `getDisplayMedia`.
        .manage(tela::Transmissao::default())
        .invoke_handler(tauri::generate_handler![
            tela::capacidades_de_tela,
            tela::fontes_de_tela,
            tela::miniaturas_de_tela,
            tela::preparar_tela,
            tela::descartar_tela,
            tela::iniciar_tela,
            tela::parar_tela,
        ])
        .setup(|app| {
            // --- Permissão de mídia ------------------------------------------
            // Antes da bandeja e antes de a janela carregar a web: o primeiro
            // `getUserMedia` da página tem de encontrar o ouvinte de pé, senão
            // o WebView2 cai no comportamento padrão e pergunta. Falhar aqui
            // não pode impedir o app de subir — no pior caso volta o pop-up.
            #[cfg(windows)]
            {
                if let Some(janela) = app.get_webview_window("main") {
                    let _ = janela.with_webview(|webview| {
                        permissoes::liberar_camera_e_microfone(&webview.controller());
                    });
                }
            }

            // --- System tray (bandeja) ---------------------------------------
            // Menu de contexto: "Abrir Streamz" e "Sair".
            let abrir = MenuItem::with_id(app, "abrir", "Abrir Streamz", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair])?;

            let mut tray = TrayIconBuilder::with_id("streamz-tray")
                .tooltip("Streamz")
                .menu(&menu)
                // No Windows o menu deve abrir só com o botão direito; o esquerdo
                // reabre a janela (tratado em on_tray_icon_event).
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "abrir" => mostrar_janela(app),
                    "sair" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        mostrar_janela(tray.app_handle());
                    }
                });

            // O ícone da janela só existe se os PNGs de `bundle.icon` tiverem
            // sido gerados (ver src-tauri/icons/README.md). Sem eles o antigo
            // `.unwrap()` derrubava o app no boot; agora a bandeja sobe sem
            // ícone — degradada, mas funcional.
            if let Some(icone) = app.default_window_icon() {
                tray = tray.icon(icone.clone());
            }

            tray.build(app)?;

            Ok(())
        })
        // Fechar a janela principal minimiza para a bandeja em vez de encerrar
        // o app — e a chamada em curso continua, que é a promessa da bandeja.
        // Ver os argumentos do WebView2 no `main`: sem eles a janela escondida
        // seria congelada e a call cairia assim mesmo.
        //
        // Só a principal. A janelinha de abertura/atualização (`splash`) fecha
        // de verdade quando pede: se ela também fosse escondida, continuaria
        // existindo com o rótulo ocupado, e a próxima atualização não
        // conseguiria criar a janela ("window label already exists").
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o Streamz")
        // Sair pela bandeja no meio de uma transmissão: tirar o `#tela` da
        // sala antes de o processo morrer, em vez de deixar o LiveKit
        // descobrir pelo timeout e a tela "congelar" para os outros.
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<tela::Transmissao>().encerrar();
            }
        });
}

/// Mostra e foca a janela principal (usada pelo menu e pelo clique no ícone).
fn mostrar_janela<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
