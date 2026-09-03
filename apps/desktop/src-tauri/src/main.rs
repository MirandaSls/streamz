// Evita abrir o console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tela;

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
    // Ele estava neste bloco para tirar o "permitir microfone e câmera?" que o
    // WebView2 mostra no `getUserMedia`, e o preço era a lista de dispositivos
    // inteira: a flag aceita a *captura* sem registrar a *permissão*, e o
    // Chromium esconde a lista de quem não tem permissão concedida —
    // `enumerateDevices()` devolve uma entrada por tipo, sem id e sem nome. Era
    // a causa de "Padrão do sistema / Microfone 1" nos prints
    // `docs/Reference/Captura de tela 2026-09-03 191339.png` e `191344`.
    //
    // Medido em Chromium headless (`--use-fake-device-for-media-stream`):
    //   sem flag        → enumerate: [audioinput ""], [videoinput ""], [audiooutput ""]
    //   +auto-accept    → getUserMedia OK ("Fake Default Audio Input"),
    //                     permissions.query(microphone) = "prompt",
    //                     enumerate (com a faixa viva E depois de pará-la):
    //                     [audioinput ""], [videoinput ""], [audiooutput ""]
    //   +fake-ui        → permissions.query = "granted", 7 aparelhos com nome
    // Ou seja: nem enumerar com a trilha aberta salva o caso da flag; só a
    // permissão de verdade. E `--use-fake-ui-for-media-stream` não serve de
    // troca: além de ser mutuamente exclusivo com o outro por `CHECK` em
    // content/browser/renderer_host/media/media_stream_manager.cc, ele também
    // sequestra o `getDisplayMedia` (escolhe uma tela sem abrir o seletor), o
    // que aqui seria transmitir a tela sem ninguém ter escolhido nada. Nada de
    // `--use-fake-device-for-media-stream`, que trocaria o microfone real por
    // um gerador de tom.
    //
    // Sem a flag o WebView2 volta a mostrar o próprio prompt no primeiro
    // `getUserMedia` e guarda a resposta no perfil: uma pergunta na primeira
    // chamada de cada instalação, em troca de a lista de microfones e de saídas
    // existir. Se um dia isso incomodar, o caminho certo é tratar o
    // `PermissionRequested` do WebView2 (`with_webview` + `webview2-com`) e
    // responder `Allow`, que concede a permissão de verdade.
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
            tela::iniciar_tela,
            tela::parar_tela,
        ])
        .setup(|app| {
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
