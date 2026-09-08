// Aplicativos (bots): o registro do bot, o usuário-bot e o token.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §10 e §11. A instalação por
// servidor (`AppInstalacao`) e os comandos de barra (`ComandoDeApp`) entram nas
// fases seguintes, junto com as tabelas correspondentes — não existem ainda e
// por isso não estão aqui.

import { z } from "zod";
import type { PublicUser } from "./dominio";

// ── limites ──────────────────────────────────────────────────

/** Nome do aplicativo. O mesmo teto do nome de exibição de uma pessoa. */
export const MAX_APP_NAME = 32;

/** Descrição de uma linha, a que aparece no card de "Descobrir aplicativos". */
export const MAX_APP_DESCRIPTION = 300;

// ── DTOs ─────────────────────────────────────────────────────

/**
 * Um aplicativo na lista do portal.
 *
 * `snowflake` é **string decimal**, nunca number: o valor passa de 2^53 e um
 * `number` o truncaria em silêncio. É a mesma regra do `id` do Discord.
 */
export interface AppView {
  id: string;
  snowflake: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  /** aparece em "Descobrir aplicativos" (opt-in do dono). */
  publico: boolean;
  /** bitfield de `Permission` que a tela de instalação sugere por padrão. */
  permissoesPadrao: number;
  createdAt: string;
  /** o usuário-bot, com `bot: true` — é ele que aparece na lista de membros. */
  botUser: PublicUser;
}

/** O mesmo, mais o que só o dono vê. */
export interface AppDetalhe extends AppView {
  /**
   * Os 8 primeiros caracteres do token em vigor. Identificam **o bot** (saem
   * do id dele, dentro da parte 1) e não mudam ao regenerar: servem para o
   * dono reconhecer de quem é um token que ele achou num arquivo de
   * configuração. Um token do outro se distingue por `tokenCriadoEm`.
   * `null` quando o único token foi revogado e nenhum outro foi gerado.
   */
  tokenPrefixo: string | null;
  tokenCriadoEm: string | null;
}

/**
 * A resposta de criar o aplicativo ou regenerar o token.
 *
 * **`token` é a única vez que o valor em claro existe.** O banco guarda só o
 * SHA-256; fechou a tela, perdeu. Nunca logue este objeto.
 */
export interface TokenCriado {
  token: string;
  prefixo: string;
  criadoEm: string;
}

/** Criar o aplicativo devolve o registro e o primeiro token, de uma vez. */
export interface AppCriado {
  app: AppDetalhe;
  token: TokenCriado;
}

// ── schemas ──────────────────────────────────────────────────

/** Criar: só o nome. O resto se edita depois. */
export const appCriarSchema = z.object({
  name: z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .trim()
    .min(2, "Nome curto demais")
    .max(MAX_APP_NAME, "Nome longo demais"),
});

export type AppCriarInput = z.infer<typeof appCriarSchema>;
