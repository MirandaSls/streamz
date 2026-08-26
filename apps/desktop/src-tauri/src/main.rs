// Evita abrir o console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

fn main() {
    tauri::Builder::default()
        // Notificações nativas (Tauri 2 → crate própria).
        .plugin(tauri_plugin_notification::init())
        // O auto-update está DESLIGADO de propósito: não existe par de chaves de
        // assinatura nem servidor de releases. Um updater apontando para um
        // endpoint inexistente com pubkey placeholder só produz erro em runtime.
        // Como religar: apps/desktop/README.md (seção "Auto-update").
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
        // Fechar a janela minimiza para a bandeja em vez de encerrar o app.
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
