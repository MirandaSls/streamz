import { z } from "zod";

/**
 * Contratos compartilhados entre a API (NestJS) e o cliente (Next.js).
 * Um único lugar para os tipos de payload e os schemas de validação.
 */

// ── Auth ─────────────────────────────────────────────────────
export const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Domínio ──────────────────────────────────────────────────
export type UserStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";
/**
 * Tipo do canal. TEXT/VOICE vivem num servidor; DM/GROUP são conversas sem
 * servidor (`guildId` null) cujo acesso é ser participante — ver ADR-0001.
 */
export type ChannelType = "TEXT" | "VOICE" | "DM" | "GROUP";
/** Só os tipos que um usuário cria dentro de um servidor. */
export type GuildChannelType = Extract<ChannelType, "TEXT" | "VOICE">;
export const GUILD_CHANNEL_TYPES: readonly GuildChannelType[] = ["TEXT", "VOICE"];
export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export interface PublicUser {
  id: string;
  username: string;
  /** nome de exibição escolhido pelo usuário; null = mostrar o username. */
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
}

/** Nome a mostrar na tela: displayName, senão username. */
export function displayNameOf(u: Pick<PublicUser, "username" | "displayName">): string {
  return u.displayName?.trim() || u.username;
}

export const MAX_DISPLAY_NAME = 32;
export const MAX_AVATAR_SIZE = 4 * 1024 * 1024; // 4 MB

/** Campos editáveis do próprio perfil (PATCH /users/me). */
export interface ProfileUpdate {
  displayName?: string | null;
}

/** Status escolhido pelo usuário (PATCH /users/me/status). null = automático. */
export interface StatusUpdate {
  manualStatus: UserStatus | null;
}

export interface Guild {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  /** há mensagem nova em algum canal visível (por espectador). */
  unread: boolean;
  /** menções a mim não lidas, somadas nos canais visíveis (por espectador). */
  mentionCount: number;
}

export interface Channel {
  id: string;
  /** null em DM/GROUP: a conversa não pertence a servidor nenhum. */
  guildId: string | null;
  /** null em DM (o título é derivado dos participantes); opcional em GROUP. */
  name: string | null;
  type: ChannelType;
  position: number;
  private: boolean;
  readOnly: boolean;
  /** quando chegou a última mensagem (null = canal vazio). */
  lastMessageAt: string | null;
  /** até onde eu li (null = nunca abri). Por espectador. */
  lastReadAt: string | null;
  /** menções a mim depois de lastReadAt. Por espectador. */
  mentionCount: number;
}

/** Não lido = existe mensagem depois do que eu li (ou nunca li e há mensagem). */
export function isUnread(c: Pick<Channel, "lastMessageAt" | "lastReadAt">): boolean {
  if (!c.lastMessageAt) return false;
  if (!c.lastReadAt) return true;
  return new Date(c.lastMessageAt).getTime() > new Date(c.lastReadAt).getTime();
}

/** true se o texto menciona `@username` (limite de palavra dos dois lados). */
export function mentionsUser(content: string, username: string): boolean {
  const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w.])@${esc}(?![\\w.-])`, "i").test(content);
}

/** Primeira URL http(s) do texto — a que vira embed. */
export function extractFirstUrl(content: string): string | null {
  const m = content.match(/https?:\/\/[^\s<>"')\]]+/i);
  return m ? m[0] : null;
}

/** Prévia de link (Open Graph) que a API monta para a primeira URL da mensagem. */
export interface LinkEmbed {
  url: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
}

/** Servidor com os canais que o usuário pode ver (GET /guilds/:id, POST /guilds). */
export interface GuildWithChannels extends Guild {
  channels: Channel[];
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}

// ── Anexos ───────────────────────────────────────────────────
/** Teto de tamanho por arquivo (bytes). Espelhado na validação da API. */
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB
/** Máximo de anexos por mensagem. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
/**
 * Validade (segundos) da URL de leitura de um anexo. A API devolve URL assinada
 * do R2 (ou do seu próprio proxy) que expira — não há URL pública permanente.
 * O cliente deve rebuscar a mensagem se a URL vencer.
 */
export const ATTACHMENT_URL_TTL_SECONDS = 60 * 60; // 1 h

export interface Attachment {
  id: string;
  /** URL pronta para <img>/download (bucket público ou proxy da API). */
  url: string;
  filename: string;
  contentType: string;
  size: number;
  /** dimensões da imagem, quando o arquivo é uma imagem reconhecida. */
  width: number | null;
  height: number | null;
}

/** true se o content-type indica uma imagem que renderizamos inline. */
export function isImageAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType.startsWith("image/");
}

export interface Message {
  id: string;
  channelId: string;
  /** servidor do canal (null em conversa direta) — o rail usa para "não lido". */
  guildId: string | null;
  author: PublicUser;
  content: string;
  createdAt: string;
  editedAt: string | null;
  reactions: ReactionGroup[];
  /** null = mensagem raiz; preenchido = resposta dentro de uma thread. */
  parentId: string | null;
  /** nº de respostas (só relevante em mensagens raiz). */
  replyCount: number;
  /** anexos vinculados (imagens/arquivos). */
  attachments: Attachment[];
  /**
   * Eco do nonce que o cliente mandou no `message.create`. Só aparece no evento
   * `message.new`; nunca é persistido nem volta no histórico REST. Serve para o
   * autor casar a mensagem real com a versão otimista que já está na tela.
   */
  nonce?: string;
  // ── a-mensagens ──
  /** DEFAULT ou mensagem de sistema (fixar, entrada de membro). */
  type: MessageType;
  /** mensagem respondida (referência curta), quando esta é uma resposta. */
  replyTo: MessageReplyRef | null;
  /** true quando a resposta menciona o autor da original ("@ ligado"). */
  replyMention: boolean;
  /** thread nomeada iniciada nesta mensagem (só em mensagem raiz). */
  thread: ThreadSummary | null;
  /** true quando a mensagem está fixada no canal. */
  pinned: boolean;
}

export interface GuildMemberView {
  user: PublicUser;
  role: MemberRole;
}

export interface InviteInfo {
  code: string;
  guildId: string;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
}

export interface InvitePreview {
  code: string;
  guild: { id: string; name: string; iconUrl: string | null };
  valid: boolean;
  reason?: string;
}

/**
 * Projeção de uma conversa (DM ou GROUP) para quem está olhando: o canal mais os
 * participantes *exceto* o espectador — informação por usuário, que não cabe na
 * tabela. Mensagens, histórico e busca são os de qualquer `Channel`.
 */
export interface DMChannelView extends Channel {
  /** participantes exceto o próprio usuário. */
  others: PublicUser[];
}

/** true para conversa de grupo (3+); false para DM 1-a-1. */
export function isGroupChannel(c: Pick<Channel, "type">): boolean {
  return c.type === "GROUP";
}

/** true para conversa sem servidor (DM ou grupo). */
export function isDirectChannel(c: Pick<Channel, "type">): boolean {
  return c.type === "DM" || c.type === "GROUP";
}

/** Máximo de convidados num grupo de DM, além de quem cria. */
export const MAX_DM_GROUP_INVITEES = 10;

/** Resultado de sair de um grupo de DM. */
export interface DMLeaveResult {
  channelId: string;
  /** true quando o grupo ficou sem ninguém e a conversa foi apagada. */
  deleted: boolean;
}

// ── Eventos do WebSocket (Socket.IO) ─────────────────────────
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
  CHANNEL_CREATED: "channel.created",
  CHANNEL_UPDATED: "channel.updated",
  CHANNEL_DELETED: "channel.deleted",
  MEMBER_UPDATED: "member.updated",
  MEMBER_JOINED: "member.joined",
  MEMBER_LEFT: "member.left",
  USER_UPDATED: "user.updated",
  // ── a-mensagens ──
  MESSAGE_PINNED: "message.pinned",
  MESSAGE_UNPINNED: "message.unpinned",
  THREAD_UPDATED: "thread.updated",
} as const;

/** Teto de caracteres de uma mensagem (canal ou DM). */
export const MAX_MESSAGE_LENGTH = 2000;

/** id opaco (cuid) — só precisamos rejeitar vazio e string absurda. */
const idSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .min(1, "id ausente")
  .max(64, "id inválido");

/** Corpo de mensagem: texto dentro do teto. `min` fica a cargo de quem usa. */
const conteudoSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .max(MAX_MESSAGE_LENGTH, `Mensagem acima de ${MAX_MESSAGE_LENGTH} caracteres`);

/** Idem, mas rejeitando mensagem só de espaço. */
const conteudoNaoVazioSchema = conteudoSchema.refine((c) => c.trim().length > 0, {
  message: "Mensagem vazia",
});

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
  })
  // uma mensagem vazia sem anexo não é mensagem
  .refine((m) => m.content.trim().length > 0 || (m.attachmentIds?.length ?? 0) > 0, {
    message: "Mensagem vazia",
  });
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

// ── Voz (LiveKit) ────────────────────────────────────────────
export interface VoiceTokenResponse {
  token: string;
  url: string;
  room: string;
}

// ── a-mensagens ──────────────────────────────────────────────

/**
 * Tipo da mensagem. `SYSTEM_*` é narração do canal ("X fixou uma mensagem"):
 * renderizada sem avatar, com ícone e texto apagado. `SYSTEM_JOIN` (entrada de
 * membro) é declarado aqui para o contrato ser um só — quem o emite é a
 * moderação.
 */
export type MessageType = "DEFAULT" | "SYSTEM_PIN" | "SYSTEM_JOIN";

/** true para mensagem narrada pelo sistema (sem avatar, sem ações de autor). */
export function isSystemMessage(m: Pick<Message, "type">): boolean {
  return m.type !== "DEFAULT";
}

/** Tamanho do trecho citado na linha de referência de uma resposta. */
export const MESSAGE_REPLY_SNIPPET = 100;

/** Achata e corta o conteúdo citado para caber numa linha só. */
export function replySnippet(content: string, limit = MESSAGE_REPLY_SNIPPET): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/** Referência curta à mensagem respondida — o que a linha acima da resposta mostra. */
export interface MessageReplyRef {
  id: string;
  author: PublicUser;
  /** trecho já achatado, de até `MESSAGE_REPLY_SNIPPET` caracteres. */
  content: string;
  /** true quando a original tinha anexo (o trecho pode vir vazio). */
  hasAttachments: boolean;
}

/**
 * Menção a mim: `@usuario` no texto **ou** ser o autor da mensagem respondida
 * com "@ ligado" — a mesma regra do Discord. Vale para o destaque na timeline
 * e para o contador de menções do não-lido, que é onde ela erra caro.
 */
export function mentionsMe(
  m: Pick<Message, "content" | "replyTo" | "replyMention" | "author">,
  me: Pick<PublicUser, "id" | "username">,
): boolean {
  if (m.author.id === me.id) return false;
  if (mentionsUser(m.content, me.username)) return true;
  return Boolean(m.replyMention && m.replyTo && m.replyTo.author.id === me.id);
}

/** Quantas mensagens antes e depois `GET .../messages/around/:id` devolve. */
export const MESSAGE_AROUND_RADIUS = 25;

/** Caminho da rota que abre o canal e pula até a mensagem ("copiar link"). */
export function messageLinkPath(
  guildId: string | null,
  channelId: string,
  messageId: string,
): string {
  return `/app/channels/${guildId ?? "@me"}/${channelId}/${messageId}`;
}

// ── Fixadas ──────────────────────────────────────────────────

/** Teto de mensagens fixadas por canal (o mesmo do Discord). */
export const MAX_PINS_PER_CHANNEL = 50;

export interface PinnedMessage {
  message: Message;
  pinnedBy: PublicUser;
  pinnedAt: string;
}

export interface MessagePinnedEvent {
  channelId: string;
  pin: PinnedMessage;
}

export interface MessageUnpinnedEvent {
  channelId: string;
  messageId: string;
}

// ── Threads nomeadas ─────────────────────────────────────────

export const MAX_THREAD_NAME = 100;

/**
 * Thread na visão da mensagem raiz (o "ver thread" da timeline). O id é o da
 * própria mensagem raiz: uma raiz tem no máximo uma thread, e respostas antigas
 * (`parentId` sem `Thread`) continuam sendo uma thread sem nome.
 */
export interface ThreadSummary {
  id: string;
  name: string;
  archived: boolean;
  messageCount: number;
  /** primeiros participantes, para os avatares empilhados. */
  participants: PublicUser[];
  lastMessageAt: string | null;
}

/** Thread na lista do painel do cabeçalho. */
export interface ThreadView extends ThreadSummary {
  channelId: string;
  createdBy: PublicUser;
  createdAt: string;
}

/** Thread criada, renomeada ou (des)arquivada. */
export interface ThreadUpdatedEvent {
  channelId: string;
  thread: ThreadView;
}

// ── Caixa de entrada ─────────────────────────────────────────

/** Uma menção não lida na aba "Para você". */
export interface InboxMention {
  message: Message;
  /** nome do canal (null em DM 1-a-1: o título vem dos participantes). */
  channelName: string | null;
  channelType: ChannelType;
  guildId: string | null;
  guildName: string | null;
}

/** Um canal com não-lido, dentro do grupo do servidor. */
export interface InboxUnreadChannel {
  channelId: string;
  channelName: string | null;
  channelType: ChannelType;
  mentionCount: number;
  lastMessageAt: string | null;
}

/** Não-lidos agrupados por servidor (`guildId` null = mensagens diretas). */
export interface InboxUnreadGroup {
  guildId: string | null;
  guildName: string;
  channels: InboxUnreadChannel[];
}

// ── Busca avançada ───────────────────────────────────────────

export const SEARCH_HAS_VALUES = ["link", "image", "file"] as const;
export type SearchHas = (typeof SEARCH_HAS_VALUES)[number];

/** Filtros de uma busca, já separados do texto livre. */
export interface SearchFilters {
  /** o que sobrou depois de tirar os filtros — busca por conteúdo. */
  text: string;
  /** `from:@fulano` — autor. */
  from: string | null;
  /** `in:#canal` — canal (só na busca do servidor inteiro). */
  in: string | null;
  /** `has:link|image|file` — pode repetir; todos precisam valer. */
  has: SearchHas[];
  /** `before:AAAA-MM-DD` — mensagens antes deste dia (exclusivo). */
  before: string | null;
  /** `after:AAAA-MM-DD` — mensagens depois deste dia (exclusivo). */
  after: string | null;
  /** `mentions:@fulano` — mensagens que mencionam alguém. */
  mentions: string | null;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  text: "",
  from: null,
  in: null,
  has: [],
  before: null,
  after: null,
  mentions: null,
};

const SEARCH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** true quando `AAAA-MM-DD` existe no calendário (rejeita 2026-02-31). */
function isCalendarDate(value: string): boolean {
  if (!SEARCH_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Separa `from:`, `in:`, `has:`, `before:`, `after:` e `mentions:` do texto
 * livre da busca. Token com valor inválido (data que não existe, `has:xpto`)
 * **volta a ser texto** em vez de virar filtro silencioso — assim a busca não
 * devolve "nada encontrado" por um erro de digitação invisível.
 */
export function parseSearchQuery(raw: string): SearchFilters {
  const out: SearchFilters = { ...EMPTY_SEARCH_FILTERS, has: [] };
  const livre: string[] = [];

  for (const token of raw.trim().split(/\s+/)) {
    if (!token) continue;
    const m = /^(from|in|has|before|after|mentions):(.*)$/i.exec(token);
    if (!m) {
      livre.push(token);
      continue;
    }
    const chave = m[1].toLowerCase();
    const valor = m[2].trim();
    if (!valor) {
      livre.push(token);
      continue;
    }
    switch (chave) {
      case "from":
        out.from = valor.replace(/^@/, "");
        break;
      case "mentions":
        out.mentions = valor.replace(/^@/, "");
        break;
      case "in":
        out.in = valor.replace(/^#/, "");
        break;
      case "has": {
        const v = valor.toLowerCase() as SearchHas;
        if (SEARCH_HAS_VALUES.includes(v)) {
          if (!out.has.includes(v)) out.has.push(v);
        } else {
          livre.push(token);
        }
        break;
      }
      case "before":
      case "after":
        if (isCalendarDate(valor)) out[chave] = valor;
        else livre.push(token);
        break;
    }
  }

  out.text = livre.join(" ");
  return out;
}

/** true quando não há nem texto nem filtro — não há o que consultar. */
export function isEmptySearch(f: SearchFilters): boolean {
  return (
    !f.text.trim() &&
    !f.from &&
    !f.in &&
    !f.mentions &&
    !f.before &&
    !f.after &&
    f.has.length === 0
  );
}
