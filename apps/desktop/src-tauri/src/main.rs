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
        // Auto-update — endpoint/pubkey são configurados em tauri.conf.json
        // (`plugins.updater`). Sem servidor real ainda: ver README (seção desktop).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // --- System tray (bandeja) ---------------------------------------
            // Menu de contexto: "Abrir NewDisc" e "Sair".
            let abrir = MenuItem::with_id(app, "abrir", "Abrir NewDisc", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair])?;

            TrayIconBuilder::with_id("newdisc-tray")
                // Reaproveita o ícone da janela já embutido no bundle.
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("NewDisc")
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
                })
                .build(app)?;

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
        .expect("erro ao iniciar o NewDisc");
}

/// Mostra e foca a janela principal (usada pelo menu e pelo clique no ícone).
fn mostrar_janela<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
