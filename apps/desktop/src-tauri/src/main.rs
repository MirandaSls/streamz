// Evita abrir o console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tela;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
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
    if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-background-timer-throttling \
             --disable-renderer-backgrounding \
             --disable-backgrounding-occluded-windows",
        );
    }

    tauri::Builder::default()
        // Notificações nativas (Tauri 2 → crate própria).
        .plugin(tauri_plugin_notification::init())
        // Auto-update. O plugin só busca quando a interface pede (ver
        // `AvisoDeAtualizacao` na web): nada é baixado sozinho, e a checagem
        // falha em silêncio quando o endpoint não tem versão a oferecer.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // `relaunch()` depois de instalar; é o que fecha o ciclo.
        .plugin(tauri_plugin_process::init())
        // Fontes de compartilhamento de tela. A web só chama isto quando está
        // dentro do app; no navegador ela continua no `getDisplayMedia`.
        .invoke_handler(tauri::generate_handler![tela::fontes_de_tela])
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
        // Fechar a janela minimiza para a bandeja em vez de encerrar o app —
        // e a chamada em curso continua, que é a promessa da bandeja. Ver os
        // argumentos do WebView2 no `main`: sem eles a janela escondida seria
        // congelada e a call cairia assim mesmo.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Streamz");
}

/// Mostra e foca a janela principal (usada pelo menu e pelo clique no ícone).
fn mostrar_janela<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
