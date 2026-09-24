fn main() {
    // `tela_nativa`: alvos em que o módulo `tela` tem backend de captura —
    // hoje só o Windows (WGC/DXGI). Linux e celular ficam de fora e caem no
    // `getDisplayMedia` do webview. O macOS tem esqueleto em `tela/captura/mac`
    // e `tela/fontes`, mas também fica de fora: sem backend implementado ele só
    // pagaria o `livekit`/`webrtc-sys`, que pede Apple clang ≥ 15 (Xcode/CLT 15)
    // e quebrou o build num Mac com CLT 14. A volta do macOS aqui anda junto com
    // o `Backend::Sck` virar `implementado` e com o bloco de dependências do
    // `Cargo.toml` — e aí o pré-requisito do README sobe para Xcode/CLT 15.
    // Continua um cfg próprio, e não `windows` direto nos vinte lugares do
    // `tela/mod.rs`, para o macOS voltar mexendo só nesta linha.
    println!("cargo::rustc-check-cfg=cfg(tela_nativa)");
    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("windows")
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
