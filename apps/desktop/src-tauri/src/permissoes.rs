//! Permissão de microfone e câmera no WebView2, concedida pelo app.
//!
//! O usuário pediu que o desktop **não** pergunte "permitir microfone e
//! câmera?". A primeira solução foi o argumento de linha de comando
//! `--auto-accept-camera-and-microphone-capture`, e ele custava a lista de
//! dispositivos inteira: aceita a *captura* sem registrar a *permissão*, e o
//! Chromium esconde nome e id de quem não tem permissão concedida —
//! `enumerateDevices()` devolve uma entrada por tipo, vazia. Era a causa de
//! "Padrão do sistema / Microfone 1" (prints `docs/Reference/Captura de tela
//! 2026-09-03 191339.png` e `191344.png`).
//!
//! Medido em Chromium headless com `--use-fake-device-for-media-stream`:
//!
//! | flags                                        | `getUserMedia` | `permissions.query(microphone)` | `enumerateDevices`                 |
//! |----------------------------------------------|----------------|---------------------------------|------------------------------------|
//! | nenhuma                                      | —              | —                               | uma entrada vazia por tipo         |
//! | `--auto-accept-camera-and-microphone-capture`| OK, com nome   | `"prompt"`                      | uma entrada vazia por tipo — com a faixa **viva** e depois de pará-la |
//! | `--use-fake-ui-for-media-stream`             | OK             | `"granted"`                     | 7 aparelhos, todos com nome        |
//!
//! Ou seja: enumerar com a trilha aberta não salva o caso da flag; só a
//! permissão de verdade. É o que este módulo faz, e é o caminho que a própria
//! documentação do WebView2 indica: responder ao evento `PermissionRequested`
//! com `COREWEBVIEW2_PERMISSION_STATE_ALLOW`. O evento é levantado **antes** de
//! qualquer interface: respondido aqui, nenhum pop-up chega a existir, e — ao
//! contrário da flag — a concessão fica registrada no gerenciador de permissões
//! do WebView2, que é justamente o que o `enumerateDevices` consulta.
//!
//! Só microfone e câmera. Os outros pedidos (geolocalização, notificações,
//! leitura da área de transferência, sensores) caem no `default`, que é o
//! comportamento do WebView2 — conceder tudo em silêncio seria dar de graça
//! permissões que o app não usa.
//!
//! Nada de `--use-fake-ui-for-media-stream` como atalho para o mesmo efeito:
//! além de ser mutuamente exclusivo com o outro argumento por `CHECK` em
//! `content/browser/renderer_host/media/media_stream_manager.cc`, ele sequestra
//! o `getDisplayMedia` — escolheria uma tela para transmitir sem ninguém pedir.

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Controller, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION,
    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
};
use webview2_com::PermissionRequestedEventHandler;

/// Assina o `PermissionRequested` da janela e libera microfone e câmera.
///
/// Falhar aqui não pode derrubar o app: no pior caso o WebView2 volta a
/// perguntar, que é o comportamento de antes deste módulo. Por isso os erros
/// são engolidos em vez de subirem — não há nada que o usuário possa fazer com
/// um `HRESULT` na tela de abertura.
pub fn liberar_camera_e_microfone(controle: &ICoreWebView2Controller) {
    let manipulador = PermissionRequestedEventHandler::create(Box::new(|_webview, argumentos| {
        let Some(argumentos) = argumentos else {
            return Ok(());
        };
        let mut tipo = COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION;
        unsafe { argumentos.PermissionKind(&mut tipo) }?;
        if tipo == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
            || tipo == COREWEBVIEW2_PERMISSION_KIND_CAMERA
        {
            unsafe { argumentos.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW) }?;
        }
        Ok(())
    }));

    // O token de remoção não é guardado: a assinatura vale enquanto a janela
    // existir, e a janela principal só morre com o processo.
    let mut token = 0i64;
    unsafe {
        if let Ok(webview) = controle.CoreWebView2() {
            let _ = webview.add_PermissionRequested(&manipulador, &mut token);
        }
    }
}
