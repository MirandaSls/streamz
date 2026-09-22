//! Ícone do aplicativo dono de uma janela, como data URL PNG.
//!
//! Aqui **não** há fachada comum, de propósito: a chave do ícone é diferente
//! em cada sistema — o caminho do executável no Windows, o pid do processo no
//! macOS — e quem chama é sempre o `fontes` do mesmo alvo, que já tem em mãos
//! a chave certa. Inventar um nome único faria as duas pontas converterem de
//! ida e de volta para nada.

#[cfg(windows)]
mod windows;

// `self::` é obrigatório: sem ele o caminho seria ambíguo com o crate
// `windows`, que tem exatamente o mesmo nome do módulo.
#[cfg(windows)]
pub use self::windows::do_executavel;
