fn main() {
    // `tela_nativa`: alvos em que o módulo `tela` tem backend de captura
    // (Windows: WGC/DXGI; macOS: ScreenCaptureKit). Linux e celular ficam de
    // fora e caem no `getDisplayMedia` do webview. É um cfg de conveniência:
    // sem ele o `tela/mod.rs` repetiria
    // `any(target_os = "windows", target_os = "macos")` em vinte lugares.
    println!("cargo::rustc-check-cfg=cfg(tela_nativa)");
    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("windows") | Ok("macos")
    ) {
        println!("cargo::rustc-cfg=tela_nativa");
    }

    // O plugin `chamada` (o serviço de primeiro plano do Android) vive **dentro
    // deste crate**, não num crate próprio. O `tauri-build` chama isso de
    // *inlined plugin*, e é ele quem gera a ACL: para cada comando da lista
    // nascem as permissões `allow-<comando>`/`deny-<comando>`, e
    // `AllowAllCommands` junta as três num `chamada:default` — que é o que
    // `capabilities/mobile.json` referencia.
    //
    // Sem isto os comandos existiriam em Rust e seriam **negados** pela ACL na
    // primeira chamada, com um erro que diz "not allowed" e não diz onde
    // consertar. Os nomes aqui são os identificadores dos `#[tauri::command]`
    // de `src/chamada.rs`, em snake_case, e têm de acompanhar qualquer
    // renomeação lá.
    //
    // A geração roda em **todos os alvos**, inclusive no Windows: a ACL é
    // estática e ficar sem ela no desktop só faria o build de celular divergir
    // do de desktop. O que é condicional é o registro do plugin em `lib.rs`.
    let atributos = tauri_build::Attributes::new()
        .plugin(
            "chamada",
            tauri_build::InlinedPlugin::new()
                .commands(&[
                    "iniciar_servico_de_chamada",
                    "parar_servico_de_chamada",
                    "registrar_ouvinte_de_saida",
                ])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        )
        // O atualizador do Android (`src/atualizador.rs`), pelo mesmo caminho:
        // um segundo *inlined plugin*, com a ACL `atualizador:default` que a
        // `capabilities/mobile.json` referencia. Sem esta entrada os dois
        // comandos existiriam em Rust e seriam **negados** na primeira chamada,
        // com um "not allowed" que não diz onde consertar.
        .plugin(
            "atualizador",
            tauri_build::InlinedPlugin::new()
                .commands(&["baixar_atualizacao", "instalar_atualizacao"])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        );

    tauri_build::try_build(atributos).expect("erro ao preparar o build do Tauri")
}
