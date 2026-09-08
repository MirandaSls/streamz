// Aplicativos (bots): o registro do bot, o usuário-bot e o token.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §10 e §11. A instalação por
// servidor (`AppInstalacao`) continua fora: a tabela `GuildApplication` é da
// F4. Os comandos de barra e as interações entraram na F3, com a migration 4 —
// estão no fim do arquivo.

import { z } from "zod";
import type { PublicUser } from "./dominio";
import { idSchema } from "./internos";

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

// ── j-bots · F3 · comandos de barra e interações ─────────────
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9 (D6) e §10 (as tabelas
// `ApplicationCommand` e `Interaction`, migration 4).

/**
 * Tipos de opção de comando que a F3 aceita, no valor numérico do Discord.
 *
 * Subcomando (1) e grupo de subcomando (2) ficam para a F5, junto com o
 * autocomplete de opção — um `PUT` que os traga é **recusado** com 50035, e
 * não aceito e ignorado: um comando que aparece no composer e não funciona é
 * pior que um comando que o dono do bot descobre que não subiu.
 */
export const TIPOS_DE_OPCAO_ACEITOS = [3, 4, 5, 6, 7, 8, 10] as const;
export type TipoDeOpcao = (typeof TIPOS_DE_OPCAO_ACEITOS)[number];

/** Uma opção declarada por um comando, como o bot a registrou. */
export interface OpcaoDeComando {
  name: string;
  description: string;
  /** 3 string, 4 integer, 5 boolean, 6 user, 7 channel, 8 role, 10 number. */
  type: TipoDeOpcao;
  required: boolean;
  /** escolhas fixas, quando o comando as declara. */
  choices?: { name: string; value: string | number }[];
}

/**
 * Um comando de barra de um bot, como o composer o mostra.
 *
 * É o DTO de `GET /api/guilds/:id/comandos-de-app`. `snowflake` é **string
 * decimal** pelo mesmo motivo de sempre: o número passa de 2^53.
 */
export interface ComandoDeApp {
  /** cuid do `ApplicationCommand` — é o que o composer manda de volta. */
  id: string;
  snowflake: string;
  name: string;
  description: string;
  options: OpcaoDeComando[];
  /** o aplicativo dono, para o autocomplete mostrar de quem é o comando. */
  applicationId: string;
  applicationName: string;
  /** o usuário-bot: nome, e o `avatarUrl` que o autocomplete desenha. */
  botUser: PublicUser;
}

/**
 * Uma opção preenchida por quem digitou, a caminho do bot.
 *
 * `value` já vem no tipo do Discord: texto para 3, número para 4 e 10, booleano
 * para 5, e **id em string** (cuid, que a API traduz para snowflake) para 6, 7
 * e 8.
 */
export const opcaoDeInteracaoSchema = z.object({
  name: z.string().min(1).max(32),
  type: z.union([
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(10),
  ]),
  value: z.union([z.string().max(6000), z.number(), z.boolean()]),
});

export type OpcaoDeInteracao = z.infer<typeof opcaoDeInteracaoSchema>;

/**
 * O corpo de `POST /api/channels/:id/interactions` — o que o composer manda
 * quando alguém aperta Enter num `/comando`.
 *
 * Não há `content`: uma interação **não é uma mensagem**. Quem escreve no canal
 * é o bot, na resposta dele.
 */
export const interacaoCriarSchema = z.object({
  /** cuid do `ApplicationCommand` escolhido no autocomplete. */
  commandId: idSchema,
  options: z.array(opcaoDeInteracaoSchema).max(25).default([]),
});

export type InteracaoCriarInput = z.infer<typeof interacaoCriarSchema>;

/**
 * O que a API devolve ao criar a interação. A resposta do bot **não** vem
 * aqui: ela chega pelo socket, como `message.new`, quando o bot responder.
 */
export interface InteracaoCriada {
  id: string;
  snowflake: string;
  /** nome do comando, para a tela poder dizer "usou /play" antes da resposta. */
  name: string;
  /** ISO. `createdAt + 15 min` — depois disso o bot leva 404. */
  expiresAt: string;
}

/**
 * A faixa "@fulano usou /play" que aparece acima da resposta do bot.
 *
 * Vai no `Message.interacao`. Existe porque a resposta de um bot a um comando
 * de barra chega ao canal **sem** que haja uma mensagem do usuário antes dela:
 * sem esta faixa, o chat mostraria o bot falando sozinho.
 */
export interface InteracaoDaMensagem {
  id: string;
  /** o nome do comando, sem a barra. */
  name: string;
  /** quem digitou. */
  user: PublicUser;
}

/**
 * O texto do "pensando…" — a mensagem que o callback tipo 5
 * (`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`) põe no canal enquanto o bot
 * resolve.
 *
 * É uma mensagem de verdade, e não um estado de carregamento como no Discord:
 * o Streamz não tem "mensagem que ainda não existe". O `editReply` do bot vira
 * uma edição normal, e é por isso que a prova 3 vê as duas etapas.
 */
export const TEXTO_PENSANDO = "pensando…";
