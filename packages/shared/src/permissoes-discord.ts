// Tradução bidirecional entre o bitfield do Streamz e o do Discord (D8).
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.
//
// ── Lote C (tradução) implementa, com testes. Puro, sem dependência. ──
//
// Por que não basta "zerar o que não existe": um bot que lê `permissions` e vê
// o bit apagado **desiste antes de tentar**. O `@discordjs/voice` checa
// `CONNECT`/`SPEAK`; vários bots de música checam `READ_MESSAGE_HISTORY` e
// `EMBED_LINKS` antes de responder qualquer coisa. Ver §6 do documento.
//
// **Divergência do documento, conferida no código**: o §6 fala em "19 bits" e
// lista `STREAM` e `MOVE_MEMBERS` como "sempre apagadas". Elas existem hoje —
// `packages/shared/src/permissoes.ts` tem 21 permissões, com
// `MOVE_MEMBERS = 1 << 19` e `STREAM = 1 << 20`, acrescentadas depois de o
// documento ser escrito. As duas **mapeiam** (`MOVE_MEMBERS` = 1<<24,
// `STREAM` = 1<<9 no Discord) e saem da lista de apagadas.

import { Permission } from "./permissoes";
import type { PermissionName } from "./permissoes";

/**
 * Bits do Discord que a tradução usa. Os valores vão até 1<<49, então o tipo é
 * `bigint` — `1 << 40` em JavaScript dá 256, não 2^40.
 */
export const PERMISSAO_DO_DISCORD = {
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_TTS_MESSAGES: 1n << 12n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  VIEW_GUILD_INSIGHTS: 1n << 19n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
  REQUEST_TO_SPEAK: 1n << 32n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  USE_EXTERNAL_STICKERS: 1n << 37n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  USE_EMBEDDED_ACTIVITIES: 1n << 39n,
  MODERATE_MEMBERS: 1n << 40n,
  USE_SOUNDBOARD: 1n << 42n,
  SEND_VOICE_MESSAGES: 1n << 46n,
  SEND_POLLS: 1n << 49n,
} as const;

/** Nome de um bit do Discord conhecido pela tradução. */
export type PermissaoDoDiscord = keyof typeof PERMISSAO_DO_DISCORD;

/**
 * Bits do Discord que **saem sempre ligados**, porque no Streamz essas coisas
 * simplesmente são permitidas — não há como negá-las.
 *
 * `SEND_POLLS` é a exceção: deriva de `SEND_MESSAGES` (temos enquete, e ela
 * nasce como mensagem), então só acende quando `SEND_MESSAGES` acende.
 */
export const SEMPRE_LIGADAS: readonly (keyof typeof PERMISSAO_DO_DISCORD)[] = [
  "READ_MESSAGE_HISTORY",
  "EMBED_LINKS",
  "USE_EXTERNAL_EMOJIS",
  "USE_EXTERNAL_STICKERS",
  "USE_APPLICATION_COMMANDS",
  "USE_VAD",
  "CHANGE_NICKNAME",
  "USE_SOUNDBOARD",
];

/**
 * Os pares — as 22 permissões do Streamz e o bit do Discord de cada uma.
 *
 * A lista é a tabela do §6 do documento, com as duas linhas que faltavam lá
 * (`MOVE_MEMBERS` e `STREAM`, acrescentadas ao Streamz depois). É exaustiva de
 * propósito: o `Record<PermissionName, …>` faz o compilador cobrar a linha nova
 * quando alguém acrescentar uma permissão em `permissoes.ts` — sem isso, a
 * permissão nova sairia calada para os bots.
 */
export const PAR_NO_DISCORD: Record<PermissionName, PermissaoDoDiscord> = {
  VIEW_CHANNEL: "VIEW_CHANNEL",
  SEND_MESSAGES: "SEND_MESSAGES",
  MANAGE_MESSAGES: "MANAGE_MESSAGES",
  MANAGE_CHANNELS: "MANAGE_CHANNELS",
  MANAGE_ROLES: "MANAGE_ROLES",
  KICK_MEMBERS: "KICK_MEMBERS",
  BAN_MEMBERS: "BAN_MEMBERS",
  MANAGE_GUILD: "MANAGE_GUILD",
  CREATE_INVITE: "CREATE_INSTANT_INVITE",
  ATTACH_FILES: "ATTACH_FILES",
  ADD_REACTIONS: "ADD_REACTIONS",
  MENTION_EVERYONE: "MENTION_EVERYONE",
  CONNECT: "CONNECT",
  SPEAK: "SPEAK",
  MUTE_MEMBERS: "MUTE_MEMBERS",
  MODERATE_MEMBERS: "MODERATE_MEMBERS",
  // não temos "expressões" separadas de emoji: o nosso MANAGE_EMOJIS é o guarda-chuva
  MANAGE_EMOJIS: "MANAGE_GUILD_EXPRESSIONS",
  VIEW_AUDIT_LOG: "VIEW_AUDIT_LOG",
  ADMINISTRATOR: "ADMINISTRATOR",
  MOVE_MEMBERS: "MOVE_MEMBERS",
  STREAM: "STREAM",
  MANAGE_NICKNAMES: "MANAGE_NICKNAMES",
};

const PARES = Object.entries(PAR_NO_DISCORD) as [PermissionName, PermissaoDoDiscord][];

/**
 * Bitfield do Streamz → bitfield do Discord.
 *
 * Serializado sempre como **string decimal** por quem chama
 * (`"137411140374081"`), nunca como number: acima de 2^53 o `Number` perde
 * precisão em silêncio.
 *
 * `ADMINISTRATOR` **não** é expandido para "tudo ligado": no Discord ele já
 * significa isso, e as libs (`PermissionsBitField#has`) fazem a expansão
 * sozinhas. Expandir aqui só faria a ida-e-volta mentir.
 */
export function paraBitfieldDoDiscord(bits: number): bigint {
  let saida = 0n;
  for (const [nosso, deles] of PARES) {
    if ((bits & Permission[nosso]) !== 0) saida |= PERMISSAO_DO_DISCORD[deles];
  }
  for (const nome of SEMPRE_LIGADAS) saida |= PERMISSAO_DO_DISCORD[nome];
  if ((bits & Permission.SEND_MESSAGES) !== 0) saida |= PERMISSAO_DO_DISCORD.SEND_POLLS;
  return saida;
}

/**
 * Bitfield do Discord → bitfield do Streamz.
 *
 * Só os bits com par são considerados; o resto (`MANAGE_THREADS`,
 * `MANAGE_WEBHOOKS`, automod…) é descartado **em silêncio**, porque a
 * funcionalidade não existe e recusar a chamada inteira por causa dele deixaria
 * a tela de "Adicionar ao servidor" impossível de usar.
 */
export function doBitfieldDoDiscord(bits: bigint): number {
  let saida = 0;
  for (const [nosso, deles] of PARES) {
    if ((bits & PERMISSAO_DO_DISCORD[deles]) !== 0n) saida |= Permission[nosso];
  }
  return saida;
}
