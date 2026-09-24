//! O app em si — **compartilhado entre desktop e Android/iOS**.
//!
//! Por que este arquivo existe (e por que `main.rs` virou uma linha): no
//! celular **não há `main()`**. O sistema carrega uma biblioteca nativa (`.so`
//! no Android, estática no iOS) e chama um ponto de entrada gerado pelo
//! `tauri::mobile_entry_point`. Por isso o crate precisa ser **lib + bin** ao
//! mesmo tempo (`[lib] crate-type = ["staticlib", "cdylib", "rlib"]` no
//! `Cargo.toml`), com todo o código aqui e o executável de desktop apenas
//! chamando `run()`.
//!
//! Ver <https://v2.tauri.app/start/migrate/from-tauri-1/> ("Mobile support").
//!
//! **O desktop não mudou**: é o mesmo código, na mesma ordem, com os mesmos
//! plugins e a mesma bandeja — só mudou de arquivo. O que é de desktop está
//! atrás de `#[cfg(desktop)]`, que o `tauri-build` define para nós (o par é
//! `#[cfg(mobile)]`). No Android não existe `tauri::tray`, não existe bandeja
//! e não existe "fechar a janela" — daí o recorte.

mod tela;

// A chamada de voz em segundo plano: o serviço de primeiro plano do Android e
// a notificação persistente. Só existe naquele alvo — no Windows quem segura a
// call com a janela escondida é a bandeja, e no iOS é o `UIBackgroundModes` do
// plist. Ver `src/chamada.rs`.
#[cfg(target_os = "android")]
mod chamada;

// O auto-update do app Android: baixar o `.apk` novo, conferir o sha256 e
// abrir o instalador do sistema. Só existe naquele alvo — no Windows quem
// atualiza é o `tauri-plugin-updater` (assinatura minisign, instalação
// silenciosa) e no iOS é a App Store. Ver `src/atualizador.rs`.
#[cfg(target_os = "android")]
mod atualizador;

// Só o WebView2 tem `PermissionRequested`; nos outros alvos o módulo nem
// existe (ver o porquê dele no próprio arquivo).
#[cfg(windows)]
mod permissoes;

// A "atenuação de comunicações" do Windows, suspensa enquanto há call: o
// microfone do WebView2 abre como stream de comunicações e o Windows abaixava
// o volume dos outros apps. Ver o porquê (e o que não funciona) no arquivo.
#[cfg(windows)]
mod atenuacao;

// O par Linux: o WebKitGTK não pergunta, **nega** microfone e câmera quando
// ninguém responde ao `permission-request`, e o wry não responde. Ver
// `src/permissoes_linux.rs`.
#[cfg(target_os = "linux")]
mod permissoes_linux;

// Só o handshake de saída usa isto, e ele é desktop apenas (ver
// `RunEvent::ExitRequested` em `run`).
#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(desktop)]
use std::time::Duration;

#[cfg(desktop)]
use tauri::Emitter;
use tauri::{Manager, RunEvent};

// Bandeja e "fechar minimiza": desktop apenas. No celular o sistema é quem
// tira o app da frente, e `tauri::tray` nem existe no alvo Android.
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

// Só quem esconde ao fechar precisa do evento de janela; no Linux fechar
// encerra (ver `on_window_event` em `run`).
#[cfg(all(desktop, not(target_os = "linux")))]
use tauri::WindowEvent;

/// O aviso de saída já foi **emitido**? Evita um segundo `app:saindo` e um
/// segundo relógio. Ver `RunEvent::ExitRequested` em `run`.
#[cfg(desktop)]
static JA_AVISOU: AtomicBool = AtomicBool::new(false);

/// A despedida **acabou** (a janela respondeu, ou o teto estourou): a próxima
/// saída passa direto. É o par de `JA_AVISOU`, e o porquê de serem dois está
/// no comentário do `RunEvent::ExitRequested`.
#[cfg(desktop)]
static PODE_SAIR: AtomicBool = AtomicBool::new(false);

/// A janela terminou de se despedir (ou não tinha o que dizer): pode sair.
///
/// **Desktop apenas**, como o arm que o convida: quem emite `app:saindo` é o
/// `RunEvent::ExitRequested`, que no celular não existe — registrar aqui um
/// comando que ninguém chama seria promessa falsa. O `generate_handler!`
/// aceita `#[cfg]` por comando, então o ramo some junto no Android/iOS, e a
/// web já trata o comando ausente (ver `ouvirSaidaDoApp` em `lib/desktop.ts`).
#[cfg(desktop)]
#[tauri::command]
fn pronto_para_sair(app: tauri::AppHandle) {
    PODE_SAIR.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // A janela escondida na bandeja precisa continuar na chamada. O WebView2 é
    // Chromium: com a janela oculta ele "backgrounda" o renderer e estrangula
    // os timers, e aí o socket cai e a voz vai junto — exatamente o que a
    // bandeja promete não fazer. Estes três argumentos desligam esse
    // comportamento e precisam estar no ambiente ANTES de o webview subir.
    //
    // Só o WebView2 (Windows) lê esta variável, e **não há equivalente** nos
    // outros alvos. O `backgroundThrottling: "disabled"` da janela `main` no
    // `tauri.macos.conf.json` parece ser e não é: o wry 0.55 o traduz em
    // `WKPreferences.inactiveSchedulingPolicy = none` (só macOS 14+), que diz
    // ao RunningBoard para não suspender nem estrangular o *processo* do
    // WebContent quando a view fica inativa — sem ele a página escondida é
    // suspensa depois de alguns minutos. A página continua sendo uma página
    // oculta para o WebKit: `visibilitychange`, `requestAnimationFrame` parado
    // e o espaçamento dos timers DOM de página oculta são preferências internas,
    // sem chave pública. No macOS 12–13 nem a política existe; no Linux fechar
    // encerra o app (ver `on_window_event`), e a janela só fica escondida
    // durante uma atualização. Por isso a rede de segurança continua sendo a
    // do servidor: a carência de voz segura o usuário na sala e o cliente
    // reentra ao voltar (VOICE_RECONNECT_GRACE_MS + `rejoinAposReconexao`).
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

    let builder = tauri::Builder::default()
        // Notificações nativas (Tauri 2 → crate própria).
        .plugin(tauri_plugin_notification::init())
        // Ações da imagem em tela cheia (ver `ImageModal.tsx` na web):
        // abrir no navegador do sistema, copiar o bitmap e "Salvar como".
        // As permissões — inclusive o escopo de `http`/`https` do `opener` e
        // as pastas onde o `fs` pode escrever — estão em
        // `capabilities/default.json`.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Compartilhamento de tela nativo: o que dá para capturar aqui, as
        // fontes, as miniaturas da grade e a transmissão em si. A web só chama
        // isto quando está dentro do app; no navegador ela continua no
        // `getDisplayMedia`.
        .manage(tela::Transmissao::default())
        .invoke_handler(tauri::generate_handler![
            #[cfg(desktop)]
            pronto_para_sair,
            tela::capacidades_de_tela,
            tela::fontes_de_tela,
            tela::miniaturas_de_tela,
            tela::preparar_tela,
            tela::descartar_tela,
            tela::iniciar_tela,
            tela::parar_tela,
            tela::silenciar_audio_da_tela,
            suspender_atenuacao_do_windows,
            restaurar_atenuacao_do_windows,
        ])
        .setup(|app| {
            // --- Permissão de mídia ------------------------------------------
            // Antes da bandeja e antes de a janela carregar a web: o primeiro
            // `getUserMedia` da página tem de encontrar o ouvinte de pé, senão
            // o WebView2 cai no comportamento padrão e pergunta. Falhar aqui
            // não pode impedir o app de subir — no pior caso volta o pop-up.
            #[cfg(windows)]
            {
                // uma call interrompida por queda deixou a preferência trocada
                if let Some(amb) = ambiente_de_atenuacao(app.handle()) {
                    app.state::<atenuacao::Atenuacao>().recuperar(&amb);
                }
                if let Some(janela) = app.get_webview_window("main") {
                    let _ = janela.with_webview(|webview| {
                        permissoes::liberar_camera_e_microfone(&webview.controller());
                    });
                }
            }
            // No Linux o `inner()` é o `webkit2gtk::WebView` do wry, e o
            // closure roda no laço de eventos (a thread da GTK), que é onde
            // objetos GObject podem ser tocados. Aqui a falha é pior que um
            // pop-up: sem o ouvinte o `getUserMedia` é negado em silêncio.
            //
            // O `devUrl` vai junto porque no `tauri dev` a página não vem do
            // protocolo do Tauri, e sim do servidor do Next — e o módulo só
            // concede mídia à origem de onde o app é servido. Ele é lido da
            // configuração (e não escrito à mão) porque é o mesmo valor que o
            // Tauri usa para carregar a janela.
            #[cfg(target_os = "linux")]
            {
                let dev_url = app.config().build.dev_url.clone();
                if let Some(janela) = app.get_webview_window("main") {
                    let _ = janela.with_webview(move |webview| {
                        permissoes_linux::liberar_camera_e_microfone(
                            &webview.inner(),
                            dev_url.as_ref(),
                        );
                    });
                }
            }

            // --- System tray (bandeja) ---------------------------------------
            // Só no desktop: o Android não tem bandeja, e `tauri::tray` sequer
            // existe naquele alvo. O bloco inteiro é o mesmo de antes.
            #[cfg(desktop)]
            {
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
            }

            Ok(())
        });

    // Auto-update. Quem pede é a janelinha `splash` (ver
    // `components/desktop/JanelaSplash.tsx`): na abertura, antes de a janela
    // principal aparecer, e de novo quando a setinha verde da barra de título é
    // clicada. A checagem falha em silêncio quando o endpoint não tem versão a
    // oferecer. O `process` é o `relaunch()` depois de instalar, que fecha o
    // ciclo.
    //
    // **Desktop apenas, e isto não é uma escolha nossa**: o atualizador do
    // Tauri não existe para Android/iOS — na loja quem atualiza é a loja, e num
    // `.apk` baixado à mão é o usuário. O caminho equivalente no celular é o
    // card "Baixar atualização" da web (`lib/atualizacao-mobile.ts`), que só
    // consulta a mesma rota `/api/updates` e manda o usuário para
    // `streamz.chat` (a raiz virou a página de download). Registrar o plugin
    // aqui no Android não daria erro visível, daria uma promessa falsa.
    #[cfg(windows)]
    let builder = builder.manage(atenuacao::Atenuacao::default());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    // Chamada de voz em segundo plano: o serviço de primeiro plano do Android,
    // com a notificação persistente e o botão "Sair da chamada". Quem o liga e
    // desliga é a web, no instante em que a call conecta e em toda saída (ver
    // `apps/web/lib/desktop.ts` e `apps/web/stores/voice.ts`).
    //
    // **Android apenas.** No Windows a janela escondida na bandeja já continua
    // na chamada — é a promessa da bandeja, e os argumentos do WebView2 lá em
    // cima são o que a sustentam. No iOS o equivalente é `UIBackgroundModes:
    // audio` no `Info.ios.plist`, que é configuração e não código. Registrar
    // este plugin nos outros alvos daria um comando que sempre falha.
    //
    // Pelo mesmo motivo do updater, o registro sai do encadeamento: um `#[cfg]`
    // não se aplica a um `.metodo()` no meio de uma expressão.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(chamada::init());

    // O atualizador do Android, pelo mesmo motivo e com a mesma forma: o
    // `tauri-plugin-updater` logo abaixo é desktop-only, e este é o que faz o
    // papel dele no `.apk`. Ver `src/atualizador.rs`.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(atualizador::init());

    // Fechar a janela principal esconde em vez de encerrar o app — e a chamada
    // em curso continua, que é a promessa da bandeja (Windows) e do Dock
    // (macOS, ver o `RunEvent::Reopen` abaixo). Ver os argumentos do WebView2
    // acima: sem eles a janela escondida seria congelada e a call cairia assim
    // mesmo.
    //
    // Só a principal. A janelinha de abertura/atualização (`splash`) fecha de
    // verdade quando pede: se ela também fosse escondida, continuaria existindo
    // com o rótulo ocupado, e a próxima atualização não conseguiria criar a
    // janela ("window label already exists").
    //
    // **Linux fica de fora, e fechar encerra o app de verdade.** Esconder só
    // presta se houver por onde voltar, e no Linux a volta é o ícone da
    // bandeja — que o GNOME puro (Fedora, Debian, Arch) não mostra sem a
    // extensão AppIndicator. Lá a janela sumiria para sempre com o processo
    // vivo, e abrir o AppImage de novo subiria uma segunda instância (não há
    // single-instance): duas sessões no gateway e a voz duplicada. O Tauri não
    // diz se o ícone ficou visível, e descobrir pelo D-Bus
    // (`StatusNotifierWatcher`) pediria dependência nova. A troca: no Linux a
    // call não sobrevive a fechar a janela. Sem prevenir o fechamento, a
    // última janela destruída leva ao `ExitRequested` e ao `RunEvent::Exit`,
    // que tira a transmissão de tela da sala como na saída pela bandeja.
    //
    // macOS em tela cheia: esconder deixa o Space da tela cheia vazio (preto).
    // Não há saída simples — o `set_fullscreen(false)` é uma animação
    // assíncrona, o `hide()` no meio dela não é confiável, e o Tauri não emite
    // evento de "saiu da tela cheia" (o tao só manda `Resized`/`Moved` no
    // `windowDidExitFullScreen`). Fica como limitação conhecida.
    //
    // **Desktop apenas.** No celular não há bandeja para onde esconder e quem
    // tira o app da frente é o sistema; prevenir o fechamento ali seria prender
    // o usuário. Como no updater, o `#[cfg]` não se aplica a um `.metodo()` no
    // meio de uma expressão, então o valor passa por uma variável.
    #[cfg(all(desktop, not(target_os = "linux")))]
    let builder = builder.on_window_event(|window, event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if window.label() == "main" {
                let _ = window.hide();
                api.prevent_close();
            }
        }
    });

    builder
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o Streamz")
        // Sair pela bandeja no meio de uma transmissão: tirar o `#tela` da
        // sala antes de o processo morrer, em vez de deixar o LiveKit
        // descobrir pelo timeout e a tela "congelar" para os outros.
        .run(|app, event| match event {
            /*
              **Sair não pode ser só matar o processo.**

              O servidor não distingue, no fio, "fechei o programa" de "a rede
              caiu": nos dois casos o socket simplesmente some. Por isso ele
              espera `VOICE_RECONNECT_GRACE_MS` (45 s) antes de tirar alguém da
              voz — e quem clicava em "Sair" na bandeja ficava 45 s na sala,
              para todos os outros, marcado como "reconectando", sem voltar.

              O conserto é avisar antes de morrer: a janela recebe
              `app:saindo`, manda o `voice.leave` e fecha o socket **de
              propósito** (o que muda o motivo que o servidor lê — ver
              `lib/socket.ts` e `modules/gateway/saida-de-voz.ts`), e então
              chama `pronto_para_sair`.

              O teto de meio segundo não é decoração: sem ele, uma janela
              travada ou um socket já caído prenderiam o app aberto para
              sempre. Meio segundo é muito mais do que o aviso precisa (ele é
              um pacote num socket já aberto) e pouco o bastante para ninguém
              reparar.

              **São dois estados, e isso é de propósito.** `JA_AVISOU` diz "o
              aviso já saiu" (não emitir de novo nem abrir um segundo relógio);
              `PODE_SAIR` diz "a despedida acabou", e é armado pelo
              `pronto_para_sair` ou pelo relógio — é ele que evita o laço, já
              que o `app.exit` do fim volta a cair aqui. Um sinalizador só
              colapsaria as duas perguntas, e clicar "Sair" duas vezes dentro
              do meio segundo mataria o app antes do round-trip: a conta
              voltaria a ficar 45 s na sala, que é exatamente o defeito que
              isto conserta. O preço é que o segundo clique **não apressa
              nada** — ele também espera o teto. É troca deliberada: não junte
              os dois de volta.

              **Reiniciar para instalar atualização não passa por aqui**, e
              não é escolha nossa: o `relaunch()` do `tauri-plugin-process`
              pede a saída com `RESTART_EXIT_CODE`, e para esse código o Tauri
              **ignora** o `prevent_exit` (ver `ExitRequestApi::prevent_exit`).
              Segurar o processo seria impossível, então o aviso seria uma
              promessa que ninguém consegue honrar — daí casar o `code` antes
              de tudo, em vez de queimar o handshake numa saída que já está
              decidida. O corolário honesto: **reiniciar para atualizar
              continua custando os 45 s de carência**.

              O que isto **não** resolve, e não tem como: forçar o
              encerramento pelo gerenciador de tarefas mata o processo sem
              evento nenhum. E no **Linux** o `ExitRequested` do wry nasce
              *depois* de a janela ser destruída: ou o `get_webview_window`
              devolve `None` e a saída passa direto, sem despedida, ou o aviso
              vai para um webview morto e o processo fica meio segundo sem
              janela. Lá, portanto, só o "Sair" da bandeja usa o caminho bom —
              fechar a janela (que no Linux encerra de verdade, ver
              `on_window_event`) continua custando a carência. Em todos esses
              casos sobra a carência, que é exatamente para o que ela existe.

              **Desktop apenas**, como todo o resto de comportamento de
              plataforma neste arquivo: no celular não há bandeja nem "Sair",
              ninguém escuta `app:saindo` com sentido, e prevenir a saída
              prenderia o usuário num app que o sistema mandou fechar.
            */
            #[cfg(desktop)]
            RunEvent::ExitRequested { api, code, .. } => {
                if code != Some(tauri::RESTART_EXIT_CODE) && !PODE_SAIR.load(Ordering::SeqCst) {
                    if let Some(janela) = app.get_webview_window("main") {
                        if !JA_AVISOU.swap(true, Ordering::SeqCst) {
                            let _ = janela.emit("app:saindo", ());
                            let app = app.clone();
                            // primeiro a thread, depois prevenir: `spawn` entra
                            // em pânico (não devolve `Result`) se o SO recusar a
                            // thread, e na ordem inversa a saída já estaria
                            // cancelada sem ninguém para retomá-la.
                            std::thread::spawn(move || {
                                std::thread::sleep(Duration::from_millis(500));
                                PODE_SAIR.store(true, Ordering::SeqCst);
                                app.exit(0);
                            });
                        }
                        api.prevent_exit();
                    }
                }
            }
            RunEvent::Exit => {
                app.state::<tela::Transmissao>().encerrar();
                // sair pela bandeja no meio da call devolve o ducking do Windows
                #[cfg(windows)]
                restaurar_atenuacao_do_windows(app.clone());
            }
            // **macOS: clicar no ícone do Dock traz a janela de volta.** O
            // "fechar esconde" lá em cima é a promessa da bandeja no Windows,
            // mas no Mac o gesto de reabrir um app que continua rodando é o
            // Dock, não o ícone da barra de menus. Sem isto o `.app` ficava
            // vivo, com a bolinha acesa no Dock, e o clique não fazia nada —
            // a única saída era achar o ícone lá em cima ou forçar o encerramento.
            //
            // Só quando não há janela visível: com a `splash` na frente
            // (checagem ou instalação de atualização) quem decide mostrar a
            // principal continua sendo ela. `..` porque a variante é
            // `#[non_exhaustive]`.
            //
            // "Nenhuma visível" não quer dizer "só a principal escondida": a
            // `splash` existe sem aparecer antes do primeiro quadro dela (na
            // abertura) e entre o `hide()` da principal e o `show()` dela (ao
            // atualizar). Um clique no Dock nesse intervalo mostraria o app por
            // cima da checagem ou da instalação — por isso, se ela existe, é
            // ela que vem para a frente.
            #[cfg(target_os = "macos")]
            RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows {
                    if let Some(splash) = app.get_webview_window("splash") {
                        let _ = splash.show();
                        let _ = splash.set_focus();
                    } else {
                        mostrar_janela(app);
                    }
                }
            }
            _ => {}
        });
}

/// Começo de uma call: o Windows para de abaixar os outros apps (ver
/// `atenuacao.rs`). A web chama antes de abrir o microfone. Fora do Windows
/// não faz nada.
#[tauri::command]
fn suspender_atenuacao_do_windows(app: tauri::AppHandle) {
    #[cfg(windows)]
    if let Some(amb) = ambiente_de_atenuacao(&app) {
        app.state::<atenuacao::Atenuacao>().suspender(&amb);
    }
    #[cfg(not(windows))]
    let _ = app;
}

/// Fim da call: a preferência de comunicações volta ao que era.
#[tauri::command]
fn restaurar_atenuacao_do_windows(app: tauri::AppHandle) {
    #[cfg(windows)]
    if let Some(amb) = ambiente_de_atenuacao(&app) {
        app.state::<atenuacao::Atenuacao>().restaurar(&amb);
    }
    #[cfg(not(windows))]
    let _ = app;
}

/// O registro do usuário e a marca de "valor original" na pasta local do app.
/// Sem pasta não há marca, e sem marca não se mexe no registro.
#[cfg(windows)]
fn ambiente_de_atenuacao(app: &tauri::AppHandle) -> Option<atenuacao::Real> {
    let pasta = app.path().app_local_data_dir().ok()?;
    Some(atenuacao::Real {
        marca: pasta.join("atenuacao-do-windows.txt"),
    })
}

/// Mostra e foca a janela principal (usada pelo menu e pelo clique no ícone).
#[cfg(desktop)]
fn mostrar_janela<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
