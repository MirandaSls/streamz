//! Permissão de microfone e câmera no WebKitGTK, concedida pelo app.
//!
//! É o par Linux de `permissoes.rs` (WebView2), e existe pelo mesmo motivo com
//! um sintoma pior: lá o padrão era **perguntar**, aqui é **negar**. O wry
//! 0.55 (`src/webkitgtk/mod.rs`, `set_webview_settings`) liga só WebGL e
//! WebAudio e não assina o sinal `permission-request` do `WebKitWebView`; sem
//! ninguém responder, o manipulador padrão do próprio WebKit
//! (`webkitWebViewPermissionRequest` em `WebKitWebView.cpp`) chama
//! `webkit_permission_request_deny` para tudo que não é pointer lock. Não há
//! pop-up nenhum: o `getUserMedia` simplesmente falha com `NotAllowedError`, e
//! voz e vídeo morrem antes de o LiveKit ser chamado.
//!
//! Três coisas, na ordem em que o WebKit as consulta:
//!
//! - `enable-media-stream`: sem ela `navigator.mediaDevices` nem existe. Nas
//!   versões recentes (2.50) o padrão do GTK já é ligado, mas foi desligado por
//!   muito tempo e o `.deb` roda em distro com WebKitGTK mais velho — ligar
//!   explicitamente custa uma linha e tira a dúvida.
//! - `enable-webrtc` (`RTCPeerConnection`): padrão desligado em toda versão.
//!   **Só tem efeito se o WebKitGTK da distro foi compilado com
//!   `ENABLE_WEB_RTC`**, que é opção experimental e fica de fora nos pacotes
//!   do Ubuntu, Debian, Fedora e Arch. Nesses sistemas a chamada é inócua e
//!   `typeof RTCPeerConnection` continua `"undefined"`: o microfone passa a
//!   abrir, mas o LiveKit não conecta. Não há o que fazer daqui — é a
//!   biblioteca do sistema que não tem o código.
//! - `permission-request`: responder `allow` ao pedido de mídia. É o equivalente
//!   do `COREWEBVIEW2_PERMISSION_STATE_ALLOW` do Windows.
//!
//! O `DeviceInfoPermissionRequest` entra junto pelo mesmo motivo que fez o
//! Windows trocar a flag de linha de comando pelo evento: sem essa concessão o
//! WebKit responde ao `enumerateDevices()` com ids opacos e rótulos vazios, e o
//! seletor de dispositivos das configurações de voz volta a mostrar
//! "Microfone 1".
//!
//! O pedido de mídia cobre também a captura de tela (`getDisplayMedia` chega
//! como `UserMediaPermissionRequest` com `is_for_display_device`). Conceder
//! aqui não escolhe tela nenhuma: no GTK a captura passa pelo portal
//! `xdg-desktop-portal` (PipeWire), e é o diálogo do sistema que pergunta qual
//! janela ou monitor — ao contrário do `--use-fake-ui-for-media-stream` que o
//! `permissoes.rs` recusa.
//!
//! Só esses dois tipos. Geolocalização, notificação, dados de site, EME e o
//! resto seguem o padrão do WebKit (negar): conceder tudo em silêncio seria dar
//! de graça o que o app não usa.
//!
//! E só para a nossa página. Conceder mídia sem perguntar é aceitável porque
//! quem pede é o nosso próprio bundle (`frontendDist`, servido pelo protocolo
//! do Tauri) — links externos são abertos pelo `tauri-plugin-opener` no
//! navegador do sistema. Mas "a janela só carrega o bundle" é uma promessa do
//! resto do código, não uma garantia do WebKit: se um dia a janela navegar
//! para outro site (um redirecionamento, um link que escapou do opener), esse
//! site ganharia microfone e câmera sem pergunta nenhuma. Por isso o pedido só
//! é concedido quando a URI da janela, no momento do pedido, está na origem do
//! app; fora dela o manipulador padrão do WebKit nega.
//!
//! Qual origem, conferido no Tauri 2.11.5 (`manager/mod.rs`,
//! `tauri_protocol_url`): `http://tauri.localhost` é só no Windows e no
//! Android; aqui o bundle é servido em **`tauri://localhost`**. No `tauri dev`
//! (sem a feature `custom-protocol`, que é o que o `tauri::is_dev()` responde e
//! o mesmo critério do `get_app_url`) a janela carrega o `devUrl` —
//! `http://localhost:3000` —, que só entra na lista nesse modo. O critério não
//! é `debug_assertions`: um `tauri build --debug` tem `debug_assertions` e
//! serve o bundle pelo protocolo, e um `tauri dev --release` não tem e carrega
//! o `devUrl`.
//!
//! A comparação é de origem (esquema, host, porta), e não de prefixo de texto:
//! `http://localhost:3000` é prefixo de `http://localhost:30000`. Não dá para
//! usar o `Url::origin()`: para esquema que não é especial (`tauri:`) ele
//! devolve uma origem opaca, e origens opacas nunca são iguais entre si.
//!
//! Um `<iframe>` de outra origem dentro da nossa página (o player do YouTube
//! do CSP) chega com a URI da janela, que é a nossa. Quem o barra é a
//! Permissions Policy do próprio WebKit (`microphone`/`camera` são `'self'`
//! por padrão, e o `<iframe>` não tem `allow=`), antes do `permission-request`.

use tauri::Url;
use webkit2gtk::glib::prelude::Cast;
use webkit2gtk::{
    DeviceInfoPermissionRequest, PermissionRequestExt, SettingsExt, UserMediaPermissionRequest,
    WebView, WebViewExt,
};

/// Origem no sentido da web (esquema, host, porta), comparável por igualdade
/// também para o esquema `tauri:` — ver o topo do arquivo.
#[derive(Debug, PartialEq, Eq)]
struct Origem {
    esquema: String,
    host: Option<String>,
    porta: Option<u16>,
}

impl Origem {
    fn de(url: &Url) -> Self {
        Self {
            esquema: url.scheme().to_owned(),
            host: url.host_str().map(str::to_owned),
            // `http://localhost` e `http://localhost:80` são a mesma origem
            porta: url.port_or_known_default(),
        }
    }
}

/// De onde o app é servido: sempre o protocolo do Tauri, e o `devUrl` só
/// quando é ele que a janela carrega (`tauri dev`).
fn origens_do_app(dev_url: Option<&Url>) -> Vec<Origem> {
    let mut origens = Vec::with_capacity(2);
    if let Ok(protocolo) = Url::parse("tauri://localhost") {
        origens.push(Origem::de(&protocolo));
    }
    if tauri::is_dev() {
        if let Some(url) = dev_url {
            origens.push(Origem::de(url));
        }
    }
    origens
}

/// Se a página carregada **agora** na janela é a nossa. Sem URI (nada
/// carregado) ou com uma que não se lê como URL, a resposta é não.
fn pagina_do_app(webview: &WebView, origens: &[Origem]) -> bool {
    let Some(uri) = WebViewExt::uri(webview) else {
        return false;
    };
    match Url::parse(uri.as_str()) {
        Ok(url) => origens.contains(&Origem::de(&url)),
        Err(_) => false,
    }
}

/// Liga a pilha de mídia do WebKitGTK na janela e responde aos pedidos de
/// microfone, câmera e lista de dispositivos feitos pela página do app.
///
/// `dev_url` é o `build.devUrl` da configuração; só é consultado no
/// `tauri dev`.
///
/// Não devolve erro pelo mesmo motivo do Windows: no pior caso a chamada
/// continua sem mídia, que é o comportamento de antes deste módulo, e não há
/// nada que o usuário possa fazer com a falha na tela de abertura.
pub fn liberar_camera_e_microfone(webview: &WebView, dev_url: Option<&Url>) {
    // `WebViewExt::settings` explícito, como o wry faz: o `gtk::WidgetExt`
    // também tem um `settings()` (o `GtkSettings` do tema), e a chamada com
    // ponto ficaria ambígua no dia em que o prelude do GTK entrar no escopo.
    if let Some(ajustes) = WebViewExt::settings(webview) {
        ajustes.set_enable_media_stream(true);
        ajustes.set_enable_webrtc(true);
    }

    let origens = origens_do_app(dev_url);

    // O `SignalHandlerId` não é guardado: a assinatura vale enquanto a janela
    // existir, e a janela principal só morre com o processo.
    webview.connect_permission_request(move |webview, pedido| {
        let e_de_midia = pedido
            .downcast_ref::<UserMediaPermissionRequest>()
            .is_some()
            || pedido
                .downcast_ref::<DeviceInfoPermissionRequest>()
                .is_some();
        // A URI é lida a cada pedido, e não guardada na assinatura: o que
        // importa é a página que pede, e a janela pode ter navegado desde o
        // `setup`.
        if !e_de_midia || !pagina_do_app(webview, &origens) {
            // `false` deixa o pedido seguir para o manipulador padrão do
            // WebKit, que nega.
            return false;
        }
        pedido.allow();
        // `true` encerra a emissão: já respondemos.
        true
    });
}
