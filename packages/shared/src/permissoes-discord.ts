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
 * Bitfield do Streamz → bitfield do Discord.
 *
 * Serializado sempre como **string decimal** por quem chama
 * (`"137411140374081"`), nunca como number: acima de 2^53 o `Number` perde
 * precisão em silêncio.
 */
export function paraBitfieldDoDiscord(_bits: number): bigint {
  throw new Error("F1 lote C: paraBitfieldDoDiscord não implementado");
}

/**
 * Bitfield do Discord → bitfield do Streamz.
 *
 * Só os bits com par são considerados; o resto (`MANAGE_THREADS`,
 * `MANAGE_WEBHOOKS`, automod…) é descartado **em silêncio**, porque a
 * funcionalidade não existe e recusar a chamada inteira por causa dele deixaria
 * a tela de "Adicionar ao servidor" impossível de usar.
 */
export function doBitfieldDoDiscord(_bits: bigint): number {
  throw new Error("F1 lote C: doBitfieldDoDiscord não implementado");
}
