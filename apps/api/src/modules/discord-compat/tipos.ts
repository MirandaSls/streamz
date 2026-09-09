// Vocabulário da casca de compatibilidade: as formas que atravessam os lotes.
//
// Este arquivo é **o contrato entre os lotes A (REST), B (gateway), C
// (tradução) e D (ponte de eventos)** da F1. Ele é escrito pelo coordenador
// antes de os lotes começarem e **ninguém o edita** durante a fase: mudar uma
// forma aqui quebra três branches ao mesmo tempo. Quem precisar de um campo
// novo relata, não acrescenta.
//
// Duas famílias de tipo moram aqui:
//
// 1. **`LinhaDe*`** — o que sai do banco, já com o `snowflake` junto. É o que o
//    lote A (`dados.service.ts`) produz e o lote C (`traducao/*.ts`) consome.
//    Note que **não** são os DTOs de `@streamz/shared`: aqueles carregam o
//    `id` cuid e não têm snowflake, e a tradução precisa do número.
// 2. **`*DoDiscord`** — o JSON que sai na resposta HTTP e no dispatch do
//    gateway. Campos em inglês e em snake_case porque é o formato do Discord;
//    todo id é **string decimal**, nunca `number` nem `bigint` (um `bigint` num
//    `JSON.stringify` lança `TypeError`).
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §5, §6 e §7.

import type { ChannelType, MessageType } from "@streamz/shared";

// ── quem está falando ────────────────────────────────────────

/**
 * O bot autenticado, posto em `req.bot` pelo `BotTokenGuard` (lote A) e
 * devolvido pelo `IDENTIFY` do gateway (lote B).
 *
 * Os ids internos são cuid (é o que os services do Streamz esperam); os
 * snowflakes acompanham porque a resposta precisa deles e uma segunda consulta
 * para buscá-los seria desperdício.
 */
export interface BotAutenticado {
  /** cuid da `Application`. */
  applicationId: string;
  applicationSnowflake: bigint;
  applicationName: string;
  /** cuid do `User` do bot — é este id que vai para `MessagesService` e afins. */
  botUserId: string;
  botSnowflake: bigint;
}

/** O `Request` do Express depois de o `BotTokenGuard` passar. */
export interface RequisicaoDeBot {
  bot: BotAutenticado;
  headers: Record<string, string | string[] | undefined>;
  [chave: string]: unknown;
}

// ── linhas do banco (entrada da tradução) ────────────────────

export interface LinhaDeUsuario {
  /** cuid. */
  id: string;
  snowflake: bigint;
  username: string;
  displayName: string | null;
  isBot: boolean;
}

export interface LinhaDeCategoria {
  id: string;
  snowflake: bigint;
  guildId: string;
  guildSnowflake: bigint;
  name: string;
  position: number;
}

export interface LinhaDeCanal {
  id: string;
  snowflake: bigint;
  /** null em DM/GROUP. */
  guildId: string | null;
  guildSnowflake: bigint | null;
  name: string | null;
  type: ChannelType;
  position: number;
  topic: string | null;
  nsfw: boolean;
  slowmodeSeconds: number;
  /** categoria do canal (vira `parent_id`); null quando solto ou em DM. */
  categoriaSnowflake: bigint | null;
  /** participantes, só em DM/GROUP (vira `recipients`). */
  destinatarios: LinhaDeUsuario[];
}

export interface LinhaDeCargo {
  id: string;
  snowflake: bigint;
  guildId: string;
  guildSnowflake: bigint;
  name: string;
  /** "#rrggbb" ou null. */
  color: string | null;
  position: number;
  /** bitfield de `Permission` (o nosso, de 21 bits). */
  permissions: number;
  hoist: boolean;
  mentionable: boolean;
  /** o `@everyone`: no Discord o id dele é o id da guild. */
  isDefault: boolean;
}

export interface LinhaDeMembro {
  user: LinhaDeUsuario;
  /** snowflakes dos cargos atribuídos — **sem** o `@everyone`, como no Discord. */
  cargoSnowflakes: bigint[];
  joinedAt: Date;
  /** fim do castigo; null/passado = sem castigo (vira `communication_disabled_until`). */
  timeoutUntil: Date | null;
}

export interface LinhaDeAnexo {
  id: string;
  snowflake: bigint;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  /** URL pronta (assinada ou externa). */
  url: string;
}

/**
 * ── j-bots F5 ── Um emoji personalizado do servidor, com as duas identidades.
 *
 * `id` é o cuid (o que vai dentro do token interno `<:nome:cuid>`) e
 * `snowflake` é o número que o bot vê. Ver `traducao/emoji.ts`.
 */
export interface LinhaDeEmojiPersonalizado {
  id: string;
  snowflake: bigint;
  name: string;
  animated: boolean;
}

export interface LinhaDeReacao {
  /** o token interno: o caractere unicode, ou `<:nome:cuid>`. */
  emoji: string;
  count: number;
  /** o bot da sessão reagiu? */
  euReagi: boolean;
  /**
   * ── j-bots F5 ── a linha de `CustomEmoji`, quando `emoji` é `<:nome:cuid>`.
   *
   * `null` em emoji unicode **e** em emoji personalizado já apagado — a
   * tradução trata os dois casos (`emojiParaDiscord`).
   */
  personalizado: LinhaDeEmojiPersonalizado | null;
}

export interface LinhaDeMensagem {
  id: string;
  snowflake: bigint;
  channelSnowflake: bigint;
  guildSnowflake: bigint | null;
  author: LinhaDeUsuario;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  type: MessageType;
  attachments: LinhaDeAnexo[];
  reactions: LinhaDeReacao[];
  /** mensagem citada (`message_reference` + `referenced_message` mínimo). */
  respostaA: { snowflake: bigint; channelSnowflake: bigint } | null;
  pinned: boolean;
}

/**
 * Tudo que o `GUILD_CREATE` e o `GET /guilds/:id` precisam de um servidor.
 *
 * É deliberadamente gordo: o `GUILD_CREATE` é de onde o cache do bot nasce, e
 * campo obrigatório faltando trava o `ready` sem erro (§7, risco (a) do §12).
 */
export interface LinhaDeServidor {
  id: string;
  snowflake: bigint;
  name: string;
  ownerSnowflake: bigint;
  createdAt: Date;
  systemChannelSnowflake: bigint | null;
  rulesChannelSnowflake: bigint | null;
  cargos: LinhaDeCargo[];
  canais: LinhaDeCanal[];
  categorias: LinhaDeCategoria[];
  membros: LinhaDeMembro[];
  memberCount: number;
}

// ── saída (JSON do Discord) ──────────────────────────────────

/** Objeto JSON qualquer do formato do Discord. */
export type JsonDoDiscord = Record<string, unknown>;

export interface UsuarioDoDiscord {
  id: string;
  username: string;
  /** "0" desde a migração de nomes do Discord; as libs ainda leem o campo. */
  discriminator: string;
  global_name: string | null;
  /** sempre null na F1: não temos CDN no formato do Discord (§5). */
  avatar: null;
  bot: boolean;
  system: boolean;
  public_flags: number;
}

export interface CargoDoDiscord {
  id: string;
  name: string;
  /** inteiro decimal (0 = sem cor). */
  color: number;
  hoist: boolean;
  position: number;
  /** bitfield de 64 bits, **string decimal**. */
  permissions: string;
  managed: boolean;
  mentionable: boolean;
  flags: number;
}

export interface CanalDoDiscord {
  id: string;
  type: number;
  guild_id?: string;
  name?: string | null;
  position?: number;
  parent_id?: string | null;
  topic?: string | null;
  nsfw?: boolean;
  rate_limit_per_user?: number;
  recipients?: UsuarioDoDiscord[];
  permission_overwrites?: JsonDoDiscord[];
  last_message_id?: string | null;
  /**
   * Só em canal de voz (tipo 2), e **obrigatórios**: o
   * `VocalGuildChannel._update` do discord.py lê `data['bitrate']` e
   * `data['user_limit']` sem `.get`. Faltando, o `GUILD_CREATE` inteiro
   * levanta `KeyError` dentro da lib e o `ready` nunca dispara — foi assim que
   * a prova 4 da F1 falhou.
   */
  bitrate?: number;
  user_limit?: number;
  rtc_region?: string | null;
}

export interface MembroDoDiscord {
  user?: UsuarioDoDiscord;
  nick: string | null;
  avatar: null;
  roles: string[];
  joined_at: string;
  premium_since: null;
  deaf: boolean;
  mute: boolean;
  flags: number;
  pending: boolean;
  communication_disabled_until: string | null;
}

export interface MensagemDoDiscord {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: UsuarioDoDiscord;
  member?: Omit<MembroDoDiscord, "user">;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: UsuarioDoDiscord[];
  mention_roles: string[];
  attachments: JsonDoDiscord[];
  embeds: JsonDoDiscord[];
  /**
   * Botões e selects. Sempre `[]` na F1 (componentes são F5), mas o campo tem
   * que **existir**: o §5 o lista e algumas libs o leem sem default.
   */
  components: JsonDoDiscord[];
  reactions?: JsonDoDiscord[];
  pinned: boolean;
  type: number;
  flags: number;
  message_reference?: JsonDoDiscord;
  referenced_message?: MensagemDoDiscord | null;
  nonce?: string;
}

// ── gateway: opcodes, intents e códigos de fechamento ────────

/** Opcodes do gateway do Discord. Só os da tabela do §7 nos interessam. */
export const OPCODE = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  REQUEST_GUILD_MEMBERS: 8,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

/**
 * Intents do Discord. O dispatch é filtrado por eles (§7) — não por economia,
 * mas para um bot que não pediu `GUILD_MESSAGES` não processar comando que não
 * deveria.
 *
 * `MESSAGE_CONTENT` está aqui por completude: no Streamz ele é **sempre
 * concedido** e o `content` vem preenchido mesmo sem ele. É uma diferença
 * declarada em relação ao Discord (§7, "Intents").
 */
export const INTENT = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_MODERATION: 1 << 2,
  GUILD_EXPRESSIONS: 1 << 3,
  GUILD_VOICE_STATES: 1 << 7,
  GUILD_PRESENCES: 1 << 8,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  GUILD_MESSAGE_TYPING: 1 << 11,
  DIRECT_MESSAGES: 1 << 12,
  DIRECT_MESSAGE_REACTIONS: 1 << 13,
  DIRECT_MESSAGE_TYPING: 1 << 14,
  MESSAGE_CONTENT: 1 << 15,
} as const;

/**
 * Códigos de fechamento que as libs tratam como **irrecuperáveis** (não
 * reconectam). Use com precisão: um 4004 acidental faz o bot desistir de vez.
 */
export const FECHAMENTO = {
  ERRO_DESCONHECIDO: 4000,
  OPCODE_INVALIDO: 4001,
  PAYLOAD_INVALIDO: 4002,
  NAO_AUTENTICADO: 4003,
  TOKEN_INVALIDO: 4004,
  JA_AUTENTICADO: 4005,
  SEQUENCIA_INVALIDA: 4007,
  LIMITE_DE_TAXA: 4008,
  SESSAO_EXPIRADA: 4009,
  SHARD_INVALIDO: 4010,
  SHARDING_OBRIGATORIO: 4011,
  VERSAO_INVALIDA: 4012,
  INTENTS_INVALIDOS: 4013,
  INTENTS_NAO_PERMITIDOS: 4014,
} as const;

/** Versão do gateway que anunciamos no READY. */
export const VERSAO_DO_GATEWAY = 10;

/**
 * Intervalo do heartbeat, em ms. O do Discord é ~41250; usamos o mesmo para que
 * bot nenhum encoste num relógio diferente do que já testou lá.
 */
export const INTERVALO_DE_HEARTBEAT_MS = 41_250;
