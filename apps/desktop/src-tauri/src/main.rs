// Evita abrir o console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Executável de **desktop**. O app inteiro está em `lib.rs`, porque no celular
//! não existe `main()`: o Android carrega a biblioteca nativa e chama o ponto
//! de entrada que o `tauri::mobile_entry_point` gera. Ter as duas formas —
//! binário e biblioteca — é o que o Tauri 2 exige para o mesmo crate servir
//! desktop e mobile (ver o cabeçalho de `lib.rs`).
//!
//! Este arquivo não pode ter lógica: o que estiver aqui **não roda no celular**.

fn main() {
    streamz_desktop_lib::run();
}
