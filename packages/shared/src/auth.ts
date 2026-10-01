// Autenticação — tokens e sessão.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── Auth ─────────────────────────────────────────────────────
import { z } from "zod";

// ── Nome de usuário ──────────────────────────────────────────
// A regra é a do Discord desde o fim do discriminador (`#1234`): o nome é o
// identificador único da conta, então só aceita o que não gera ambiguidade —
// minúsculas, dígitos, `_` e `.`. Maiúscula e hífen deixaram de valer.

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 32;

/**
 * A regra inteira de um nome **já normalizado** (`normalizarUsername`):
 * caracteres permitidos, comprimento e nada de `..`. Montada a partir das
 * constantes para que "o que a tela testa" e "o que o schema exige" não possam
 * divergir.
 */
export const USERNAME_REGEX = new RegExp(
  `^(?!.*\\.\\.)[a-z0-9_.]{${USERNAME_MIN},${USERNAME_MAX}}$`,
);

/**
 * Forma canônica do que alguém digita como nome de usuário: sem espaços nas
 * pontas, sem o `@` que as pessoas copiam de menção, em minúsculas. É a mesma
 * forma em que o nome é gravado — por isso comparar dois nomes passa sempre por
 * aqui dos dois lados.
 */
export function normalizarUsername(s: string): string {
  return s.trim().replace(/^@/, "").toLowerCase();
}

/** Normaliza antes de validar; o que não é string segue cru para o erro de tipo. */
function preNormalizarUsername(valor: unknown): unknown {
  return typeof valor === "string" ? normalizarUsername(valor) : valor;
}

/**
 * Nome de usuário novo (registro, troca de nome). Normaliza antes de validar:
 * "Fulano" vira "fulano" em vez de ser recusado, porque a pessoa digitou um
 * nome válido com a caixa errada — recusar seria pedir que ela adivinhasse.
 */
export const usernameSchema = z.preprocess(
  preNormalizarUsername,
  z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .min(USERNAME_MIN, `O usuário precisa de ao menos ${USERNAME_MIN} caracteres`)
    .max(USERNAME_MAX, `O usuário precisa de no máximo ${USERNAME_MAX} caracteres`)
    .superRefine((nome, ctx) => {
      // comprimento fora já tem a sua mensagem; repetir aqui só empilharia erro
      if (nome.length < USERNAME_MIN || nome.length > USERNAME_MAX) return;
      if (USERNAME_REGEX.test(nome)) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        // `..` passa no conjunto de caracteres; dizer "apenas letras…" ali
        // deixaria a pessoa sem saber o que corrigir
        message: /^[a-z0-9_.]+$/.test(nome)
          ? "O usuário não pode ter dois pontos seguidos (..)"
          : "O usuário aceita apenas letras minúsculas, números, _ e .",
      });
    }),
);

export const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(6).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  // Só normaliza e limita o tamanho: conta criada antes da regra nova (com
  // maiúscula ou hífen) precisa continuar entrando. A API compara o nome em
  // minúsculas, então normalizar aqui não tranca ninguém do lado de fora.
  username: z.preprocess(
    preNormalizarUsername,
    z
      .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
      .min(USERNAME_MIN, `O usuário precisa de ao menos ${USERNAME_MIN} caracteres`)
      .max(USERNAME_MAX, `O usuário precisa de no máximo ${USERNAME_MAX} caracteres`),
  ),
  password: z.string().min(6).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
