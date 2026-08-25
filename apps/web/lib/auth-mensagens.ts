/**
 * Traduz falhas de autenticação em texto que o usuário entende.
 *
 * A API responde em pt-BR, mas com o vocabulário do backend ("Credenciais
 * inválidas"); aqui o status vira a frase certa para cada formulário e o
 * inesperado ganha um texto neutro em vez de vazar `Erro 500` na tela.
 */
import { ApiError } from "./api-error";

type Formulario = "login" | "registro";

export function mensagemDeAuth(erro: unknown, formulario: Formulario): string {
  if (!(erro instanceof ApiError)) {
    return "Não foi possível concluir. Tente de novo.";
  }
  switch (erro.status) {
    case 0:
      return "Sem conexão com o servidor. Verifique sua rede e tente de novo.";
    case 400:
      // validação do DTO: a mensagem da API é específica e já vem em pt-BR
      return erro.message;
    case 401:
      return "Usuário ou senha incorretos.";
    case 409:
      return "Esse nome de usuário já está em uso.";
    case 429:
      return "Tentativas demais. Espere um instante e tente de novo.";
    default:
      return formulario === "login"
        ? "Não foi possível entrar agora. Tente de novo em instantes."
        : "Não foi possível criar a conta agora. Tente de novo em instantes.";
  }
}

/** Limites espelhados do DTO da API — evita um round-trip para erro previsível. */
export const REGRAS_CREDENCIAIS = {
  usuario: { min: 3, max: 32, formato: /^[a-zA-Z0-9_.-]+$/ },
  senha: { min: 6, max: 128 },
} as const;

/** Valida antes de enviar; `null` quando está tudo certo. */
export function validarCredenciais(username: string, password: string): string | null {
  const { usuario, senha } = REGRAS_CREDENCIAIS;
  if (username.length < usuario.min || username.length > usuario.max) {
    return `O usuário precisa ter de ${usuario.min} a ${usuario.max} caracteres.`;
  }
  if (!usuario.formato.test(username)) {
    return "O usuário aceita apenas letras, números, _ . e -";
  }
  if (password.length < senha.min || password.length > senha.max) {
    return `A senha precisa ter de ${senha.min} a ${senha.max} caracteres.`;
  }
  return null;
}
