// Nomes e payloads dos eventos do WebSocket (Socket.IO).
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── Eventos do WebSocket (Socket.IO) ─────────────────────────
import { conteudoNaoVazioSchema, conteudoSchema, idSchema } from "./internos";

import { z } from "zod";
import { MAX_POLL_OPTION, MAX_POLL_OPTIONS, MAX_POLL_QUESTION, MIN_POLL_OPTIONS } from "./comunidade";
import type { Guild, MemberRole, UserStatus } from "./dominio";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "./midia";
import type { GuildMemberView } from "./midia";

export const WS_EVENTS = {
  // cliente → servidor
  MESSAGE_CREATE: "message.create",
  MESSAGE_EDIT: "message.edit",
  MESSAGE_DELETE: "message.delete",
  REACTION_ADD: "reaction.add",
  REACTION_REMOVE: "reaction.remove",
  TYPING: "typing",
  CHANNEL_JOIN: "channel.join",
  CHANNEL_LEAVE: "channel.leave",
  // servidor → cliente
  ERROR: "ws.error",
  MESSAGE_NEW: "message.new",
  MESSAGE_UPDATED: "message.updated",
  MESSAGE_DELETED: "message.deleted",
  PRESENCE_UPDATE: "presence.update",
  GUILD_REMOVED: "guild.removed",
  /**
   * Entrei num servidor: criei, resgatei um convite ou fui adicionado.
   *
   * Vai para a **sala do usuário** (`user:<id>`), ou seja, para todas as
   * conexões dele — é o par de `guild.removed` e o que faz a segunda sessão
   * (o desktop enquanto o site entra, ou vice-versa) mostrar o servidor no
   * rail sem recarregar. Um único evento cobre "criei" e "entrei": o que o
   * cliente faz com os dois é idêntico (pôr o servidor na lista).
   */
  GUILD_JOINED: "guild.joined",
  CHANNEL_CREATED: "channel.created",
  CHANNEL_UPDATED: "channel.updated",
  CHANNEL_DELETED: "channel.deleted",
  /**
   * Li um canal (ou um lote deles) — vai para a sala `user:<id>`.
   *
   * É o par de "não lido" do lado da leitura: sem ele, abrir a conversa no
   * desktop deixava o badge aceso no site até recarregar a página.
   */
  CHANNEL_READ: "channel.read",
  MEMBER_UPDATED: "member.updated",
  MEMBER_JOINED: "member.joined",
  MEMBER_LEFT: "member.left",
  USER_UPDATED: "user.updated",
  // ── f-voz ──
  // cliente → servidor
  VOICE_JOIN: "voice.join",
  VOICE_LEAVE: "voice.leave",
  VOICE_UPDATE: "voice.update",
  CALL_ACCEPT: "call.accept",
  CALL_DECLINE: "call.decline",
  CALL_END: "call.end",
  // servidor → cliente
  VOICE_STATE: "voice.state",
  /**
   * Você entrou em voz de outro lugar: esta conexão está fora.
   *
   * Vai para **um socket só**, não para a sala do usuário — quem acabou de
   * entrar não pode receber a própria expulsão.
   */
  VOICE_EVICTED: "voice.evicted",
  /**
   * Alguém com "mover membros" me arrastou para outro canal de voz.
   *
   * Vai só para o usuário movido: é ele quem troca de sala no LiveKit. Todo o
   * resto do servidor já sabe pelos dois `voice.state` (saiu de lá, entrou
   * aqui) que o próprio `move` emite.
   */
  VOICE_MOVED: "voice.moved",
  CALL_RING: "call.ring",
  CALL_ENDED: "call.ended",
  /**
   * Alguém apertou um som do painel de efeitos sonoros.
   *
   * Vai só para **quem está no canal de voz** (a lista vem do estado de voz,
   * não da sala do servidor): o som é da chamada, e quem está lendo um canal de
   * texto do mesmo servidor não deve ouvir nada. Cada cliente toca o arquivo
   * localmente, no volume de efeitos dele — o áudio não passa pelo LiveKit.
   */
  SOUNDBOARD_PLAY: "soundboard.play",
  /** servidor → cliente: a lista de sons do servidor mudou. */
  SOUNDBOARD_UPDATED: "soundboard.updated",
  // ── c-cargos ──
  ROLE_CREATED: "role.created",
  ROLE_UPDATED: "role.updated",
  ROLE_DELETED: "role.deleted",
  CHANNEL_OVERRIDES: "channel.overrides",
  CATEGORY_OVERRIDES: "category.overrides",
  GUILD_UPDATED: "guild.updated",
  GUILD_OWNER_CHANGED: "guild.ownerChanged",
  // ── b-canais ──
  CATEGORY_CREATED: "category.created",
  CATEGORY_UPDATED: "category.updated",
  CATEGORY_DELETED: "category.deleted",
  // ── a-mensagens ──
  MESSAGE_PINNED: "message.pinned",
  MESSAGE_UNPINNED: "message.unpinned",
  THREAD_UPDATED: "thread.updated",
  // ── e-configuracoes ──
  /** preferência de notificação mudou (outra aba/dispositivo do mesmo usuário) */
  NOTIFICATION_UPDATED: "notification.updated",
  // ── d-social ──
  FRIEND_REQUEST: "friend.request",
  FRIEND_ACCEPTED: "friend.accepted",
  FRIEND_REMOVED: "friend.removed",
  USER_BLOCKED: "user.blocked",
  // ── g-emojis-midia ──
  /** cliente → servidor: liga/desliga a prévia de link de uma mensagem. */
  MESSAGE_SUPPRESS_EMBEDS: "message.suppressEmbeds",
  /** servidor → cliente: a lista de emojis personalizados do servidor mudou. */
  EMOJI_UPDATED: "emoji.updated",
  /** servidor → cliente: a lista de figurinhas do servidor mudou. */
  STICKER_UPDATED: "sticker.updated",
  // ── h-moderacao ──
  /** cliente → servidor: cria uma enquete (que nasce como mensagem no canal). */
  POLL_CREATE: "poll.create",
  /** servidor → cliente: contagem da enquete mudou (voto, desvoto, encerramento). */
  POLL_UPDATED: "poll.updated",
  /** servidor → cliente: várias mensagens sumiram de uma vez (moderação). */
  MESSAGES_BULK_DELETED: "messages.bulkDeleted",
  /** servidor → moderação: chegou uma denúncia nova. */
  REPORT_CREATED: "report.created",
  /** cliente → servidor: vota ou desvota numa opção da enquete. */
  POLL_VOTE: "poll.vote",
  /** cliente → servidor: encerra a enquete (autor ou moderação). */
  POLL_CLOSE: "poll.close",
  /** servidor → cliente: onboarding/descoberta do servidor mudou. */
  GUILD_SETTINGS_UPDATED: "guild.settingsUpdated",
  // ── i-conta ──
  /** a minha conta mudou (e-mail verificado, 2FA ligado/desligado). */
  ACCOUNT_UPDATED: "account.updated",
  /** sessões encerradas: as abas atingidas caem para o login na hora. */
  SESSIONS_REVOKED: "sessions.revoked",
  // ── j-bots ──
  /**
   * servidor → cliente (sala do servidor): os comandos de barra dos
   * aplicativos daquele servidor mudaram.
   *
   * Sai quando um bot faz `PUT applications/:app/commands` ou
   * `PUT applications/:app/guilds/:gid/commands` — o `deploy-commands.js` de
   * todo tutorial. O payload é `{ guildId: string }` e nada mais: quem recebe
   * recarrega `GET /api/guilds/:id/comandos-de-app`. Mandar a lista inteira
   * aqui seria empurrar para todo mundo o que só quem abre o composer usa.
   */
  APPLICATION_COMMANDS_UPDATED: "application.commandsUpdated",
  /**
   * servidor → cliente (sala do canal): **uma** reação foi posta ou tirada.
   *
   * Nasceu para os bots. O Streamz sempre soube dizer só "a mensagem mudou"
   * (`message.updated` com a mensagem inteira), e isso não basta para o
   * `MESSAGE_REACTION_ADD` do Discord, que carrega **quem** reagiu e **com
   * quê** — sem os dois, bot de "reaction roles" e de votação não funciona.
   *
   * O `message.updated` **continua saindo** junto, com a mensagem inteira: é
   * ele que o navegador (e o desktop já instalado) escuta, e trocar um pelo
   * outro quebraria cliente antigo. O par não é redundante — são duas leituras
   * do mesmo fato, uma grossa (o estado novo) e uma fina (o delta).
   *
   * Payload: `ReactionEvent`.
   */
  REACTION_ADDED: "reaction.added",
  /** O par de `reaction.added`: uma reação saiu. Payload: `ReactionEvent`. */
  REACTION_REMOVED: "reaction.removed",
  /**
   * servidor → cliente (sala do canal): a moderação **limpou** as reações.
   *
   * `emoji: null` quer dizer "todas"; preenchido, só as daquele emoji. Vira
   * `MESSAGE_REACTION_REMOVE_ALL` / `_REMOVE_EMOJI` no gateway dos bots.
   *
   * Payload: `ReactionClearedEvent`.
   */
  REACTIONS_CLEARED: "reactions.cleared",
  // ── onda 3 ── interações de componente, modal e autocomplete
  //
  // Todos vão para a **sala do usuário** que disparou a interação
  // (`user:<id>`), nunca para a do canal: o "carregando", o "Esta interação
  // falhou", o modal e as sugestões são de uma pessoa só. A mensagem que o bot
  // escreve ou edita **não** vem aqui: continua saindo por `message.new` e
  // `message.updated` (callback 7 incluído), na sala de sempre. Payloads em
  // `mensagens-de-bot.ts`; contrato inteiro em `docs/CONTRATO-ONDA-3.md`.
  /** O bot respondeu dentro do prazo (callback 4, 5, 6, 7 ou 9). Payload: `InteracaoConcluidaEvent`. */
  INTERACTION_SUCCESS: "interaction.success",
  /** "Esta interação falhou": sem callback em 3 s, ou bot offline. Payload: `InteracaoFalhouEvent`. */
  INTERACTION_FAILED: "interaction.failed",
  /** O bot abriu um modal (callback 9). Payload: `ModalDeBotAbertoEvent`. */
  INTERACTION_MODAL: "interaction.modal",
  /** Sugestões para a opção em foco (callback 8). Payload: `AutocompleteDeBotEvent`. */
  INTERACTION_AUTOCOMPLETE: "interaction.autocomplete",
  // ── menus de contexto ── todos para a sala `user:<eu>` (outras abas e o
  // desktop do mesmo usuário); nenhum sai para o outro lado. Ver
  // `docs/CONTRATO-MENUS.md`. Payloads em `menus.ts`.
  /** Fixei/desafixei uma conversa. Payload: `ConversaFixadaEvent`. */
  DM_PIN_UPDATED: "dm.pinUpdated",
  /** Minha nota sobre alguém mudou. Payload: `NotaDeUsuario`. */
  USER_NOTE_UPDATED: "user.noteUpdated",
  /** Meu apelido de amigo para alguém mudou. Payload: `ApelidoDeAmigoEvent`. */
  FRIEND_NICKNAME_UPDATED: "friend.nicknameUpdated",
  /** Ignorei/deixei de ignorar alguém. Payload: `UsuarioIgnoradoEvent`. */
  USER_IGNORED: "user.ignored",
} as const;


export const messageCreateSchema = z
  .object({
    channelId: idSchema,
    content: conteudoSchema,
    /** quando presente, cria a mensagem como resposta na thread desse id. */
    parentId: idSchema.optional(),
    /** ids de anexos já enviados (POST /uploads) a vincular nesta mensagem. */
    attachmentIds: z
      .array(idSchema)
      .max(MAX_ATTACHMENTS_PER_MESSAGE, `Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos`)
      .optional(),
    /**
     * Identificador efêmero gerado pelo cliente. O servidor devolve o mesmo valor
     * em `message.new` para que o autor substitua a mensagem otimista pela real.
     */
    nonce: z.string().max(64).optional(),
    // ── a-mensagens ──
    /** id da mensagem respondida (reply do Discord — não abre thread). */
    replyToId: idSchema.optional(),
    /** "@ ligado": a resposta menciona o autor da original (default: ligado). */
    replyMention: z.boolean().optional(),
    /** figurinha a enviar; sozinha já é mensagem (g-emojis-midia). */
    stickerId: idSchema.optional(),
  })
  // uma mensagem vazia sem anexo nem figurinha não é mensagem
  .refine(
    (m) => m.content.trim().length > 0 || (m.attachmentIds?.length ?? 0) > 0 || !!m.stickerId,
    { message: "Mensagem vazia" },
  );
export type MessageCreatePayload = z.infer<typeof messageCreateSchema>;

export const messageEditSchema = z.object({
  messageId: idSchema,
  content: conteudoNaoVazioSchema,
});
export type MessageEditPayload = z.infer<typeof messageEditSchema>;

export const messageDeleteSchema = z.object({ messageId: idSchema });
export type MessageDeletePayload = z.infer<typeof messageDeleteSchema>;

export const reactionSchema = z.object({
  messageId: idSchema,
  // emoji é texto curto vindo do cliente; o teto evita usar a coluna como blob
  emoji: z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .min(1, "Emoji ausente")
    .max(64, "Emoji inválido"),
});
export type ReactionPayload = z.infer<typeof reactionSchema>;

/**
 * ── j-bots ── O delta de uma reação (`reaction.added` / `reaction.removed`).
 *
 * Só ids: quem escuta já tem a mensagem (o `message.updated` sai junto) e o
 * gateway de compatibilidade resolve os snowflakes por conta própria. O
 * `emoji` é o **token interno**: o caractere unicode, ou `<:nome:id>` quando é
 * um emoji personalizado do servidor (`parseCustomEmoji`).
 */
export interface ReactionEvent {
  messageId: string;
  channelId: string;
  /** servidor do canal, ou null em conversa direta. */
  guildId: string | null;
  /** quem pôs ou tirou a reação. */
  userId: string;
  emoji: string;
}

/**
 * ── j-bots ── A moderação limpou reações de uma mensagem
 * (`reactions.cleared`).
 *
 * `emoji: null` = todas as reações da mensagem; preenchido = só as daquele
 * emoji (mesmo token interno de `ReactionEvent`).
 */
export interface ReactionClearedEvent {
  messageId: string;
  channelId: string;
  guildId: string | null;
  emoji: string | null;
}

export const typingSchema = z.object({ channelId: idSchema });
export type TypingPayload = z.infer<typeof typingSchema>;

/** `channel.join` / `channel.leave` mandam o id do canal cru, sem envelope. */
export const channelIdSchema = idSchema;

export interface MessageDeletedEvent {
  messageId: string;
  channelId: string;
  /** id da mensagem raiz, se a apagada era uma resposta de thread. */
  parentId: string | null;
}

/** Erro de um comando WS, devolvido ao cliente que o enviou. */
export interface WsErrorEvent {
  message: string;
}

/** Resultado da validação de um payload WS. */
export type WsParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * Helper único de validação dos comandos WS (cliente→servidor). Mora aqui, e
 * não na API, para que o contrato e a mensagem de erro sejam os mesmos dos dois
 * lados — e para a API não precisar depender de zod diretamente.
 */
export function parseWsPayload<S extends z.ZodTypeAny>(
  schema: S,
  body: unknown,
): WsParseResult<z.infer<S>> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  const path = issue.path.join(".");
  return { ok: false, message: path ? `${path}: ${issue.message}` : issue.message };
}

export interface PresenceUpdatePayload {
  userId: string;
  status: UserStatus;
}

/** Emitido ao usuário que saiu/perdeu acesso a um servidor. */
export interface GuildRemovedEvent {
  guildId: string;
  reason: "kicked" | "banned" | "left" | "deleted";
}

/**
 * Entrei num servidor (`guild.joined`).
 *
 * Carrega o servidor inteiro, e não só o id, para o rail desenhar na hora sem
 * uma volta ao `GET /guilds`. Servidor recém-entrado não tem não-lido nem
 * menção — `unread: false`, `mentionCount: 0`.
 */
export interface GuildJoinedEvent {
  guild: Guild;
  /** `created` quando fui eu que criei o servidor; `joined` no convite. */
  reason: "created" | "joined";
}

/** Canal apagado (guildId null = conversa direta). */
export interface ChannelDeletedEvent {
  channelId: string;
  guildId: string | null;
}

/** Papel de um membro mudou. */
export interface MemberUpdatedEvent {
  guildId: string;
  userId: string;
  role: MemberRole;
  /** cargos do membro depois da mudança (ausente = só o papel mudou). */
  roleIds?: string[];
  /** h-moderacao: fim do castigo (ISO) — null = castigo removido. */
  timeoutUntil?: string | null;
  /**
   * ── menus de contexto ── apelido no servidor depois da mudança. Ausente =
   * o apelido não mudou; `null` = apelido removido. Quando só o apelido muda,
   * `role` vem com o papel atual (o campo é obrigatório).
   */
  nickname?: string | null;
}

/** Alguém entrou no servidor (convite). */
export interface MemberJoinedEvent {
  guildId: string;
  member: GuildMemberView;
}

/** Alguém saiu do servidor (saiu, foi expulso ou banido). */
export interface MemberLeftEvent {
  guildId: string;
  userId: string;
}

// ── Comandos WS de enquete ───────────────────────────────────

export const pollCreateSchema = z.object({
  channelId: idSchema,
  question: z
    .string({ required_error: "obrigatório" })
    .trim()
    .min(1, "Pergunta vazia")
    .max(MAX_POLL_QUESTION, `Pergunta acima de ${MAX_POLL_QUESTION} caracteres`),
  options: z
    .array(z.string().trim().min(1, "Opção vazia").max(MAX_POLL_OPTION, "Opção longa demais"))
    .min(MIN_POLL_OPTIONS, `Mínimo de ${MIN_POLL_OPTIONS} opções`)
    .max(MAX_POLL_OPTIONS, `Máximo de ${MAX_POLL_OPTIONS} opções`),
  multi: z.boolean().optional(),
  /** duração em horas; ausente = enquete sem prazo. */
  durationHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 14)
    .optional(),
  nonce: z.string().max(64).optional(),
});
export type PollCreatePayload = z.infer<typeof pollCreateSchema>;

export const pollVoteSchema = z.object({
  messageId: idSchema,
  optionIndex: z.number().int().min(0).max(MAX_POLL_OPTIONS - 1),
});
export type PollVotePayload = z.infer<typeof pollVoteSchema>;

export const pollCloseSchema = z.object({ messageId: idSchema });
export type PollClosePayload = z.infer<typeof pollCloseSchema>;
