/**
 * Traduz falhas de autenticação em texto que o usuário entende e recusa o que
 * a API recusaria, antes do round-trip.
 *
 * As **regras** não moram aqui: são os schemas de `@newdisc/shared`
 * (`contaRegistroSchema`, `contaLoginSchema`, `validarSenhaNova`), os mesmos que
 * a API valida na borda. Aqui fica só a apresentação — qual frase cada status
 * vira em cada formulário, e o texto neutro para o inesperado, em vez de vazar
 * `Erro 500` na tela.
 */
import {
  MIN_ACCOUNT_AGE_YEARS,
  MIN_PASSWORD_LENGTH,
  contaLoginSchema,
  contaRegistroSchema,
  forcaDeSenha,
  validarSenhaNova,
} from "@newdisc/shared";
import type { ForcaDeSenha } from "@newdisc/shared";
import { ApiError } from "./api-error";

type Formulario = "login" | "registro" | "conta";

export function mensagemDeAuth(erro: unknown, formulario: Formulario): string {
  if (!(erro instanceof ApiError)) {
    return "Não foi possível concluir. Tente de novo.";
  }
  switch (erro.status) {
    case 0:
      return "Sem conexão com o servidor. Verifique sua rede e tente de novo.";
    case 400:
      // validação do contrato: a mensagem da API é específica e já vem em pt-BR
      return erro.message;
    case 401:
      return formulario === "login"
        ? "Usuário ou senha incorretos."
        : "Senha ou código incorretos.";
    case 403:
      return erro.message;
    case 404:
      return erro.message;
    case 409:
      // a API distingue e-mail de usuário na mensagem — repeti-la é mais útil
      return erro.message;
    case 429:
      return "Tentativas demais. Espere um instante e tente de novo.";
    case 503:
      return "Envio de e-mail indisponível no servidor. Fale com quem administra.";
    default:
      return formulario === "login"
        ? "Não foi possível entrar agora. Tente de novo em instantes."
        : formulario === "registro"
          ? "Não foi possível criar a conta agora. Tente de novo em instantes."
          : "Não foi possível concluir agora. Tente de novo em instantes.";
  }
}

/**
 * O mínimo de um schema zod que este arquivo usa. Declarado estruturalmente
 * porque `zod` é dependência do contrato, não da web — os schemas chegam
 * prontos de `@newdisc/shared`, e a web não precisa da biblioteca.
 */
interface SchemaValidavel {
  safeParse(valor: unknown):
    | { success: true }
    | { success: false; error: { issues: { message: string }[] } };
}

/** Primeira mensagem de recusa do schema, ou `null` quando o valor serve. */
function primeiroProblema(schema: SchemaValidavel, valor: unknown): string | null {
  const resultado = schema.safeParse(valor);
  return resultado.success ? null : (resultado.error.issues[0]?.message ?? "Dados inválidos");
}

/** Valida o formulário de registro; `null` quando está tudo certo. */
export function validarRegistro(input: {
  email: string;
  username: string;
  password: string;
  birthDate?: string;
}): string | null {
  return primeiroProblema(contaRegistroSchema, {
    ...input,
    // campo vazio é "não informei", não "informei errado"
    birthDate: input.birthDate?.trim() ? input.birthDate : undefined,
  });
}

/** Valida o formulário de login (e-mail **ou** usuário + senha). */
export function validarLogin(identificador: string, password: string): string | null {
  return primeiroProblema(contaLoginSchema, { identificador, password });
}

/** Recusa de uma senha nova (registro, redefinição, troca). */
export function validarSenha(senha: string): string | null {
  return validarSenhaNova(senha);
}

/** Medidor mostrado sob o campo de senha nova. */
export function forcaDaSenha(senha: string): ForcaDeSenha {
  return forcaDeSenha(senha);
}

/** Textos fixos que as telas de conta repetem. */
export const TEXTOS_CONTA = {
  senhaMinima: `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  idadeMinima: `É preciso ter ao menos ${MIN_ACCOUNT_AGE_YEARS} anos.`,
} as const;
