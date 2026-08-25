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
  /** h-moderacao: preenchido quando a mensagem foi escrita pelo servidor. */
  systemType?: MessageSystemType | null;
  /** h-moderacao: preenchido quando a mensagem é uma enquete. */
  poll?: Poll | null;
}

export interface GuildMemberView {
  user: PublicUser;
  role: MemberRole;
  /** h-moderacao: fim do castigo (ISO) — null/passado = sem castigo. */
  timeoutUntil?: string | null;
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
  /** h-moderacao: fim do castigo (ISO) — null = castigo removido. */
  timeoutUntil?: string | null;
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

// ── h-moderacao ──────────────────────────────────────────────
// Moderação, registro de auditoria, convites, enquetes, denúncias, onboarding
// e servidores públicos. Tudo o que a api e a web trocam sobre esses assuntos
// mora aqui — inclusive as listas de presets que a UI desenha, para que os dois
// lados nunca discordem sobre o que é "1 semana de castigo" ou "10 usos".

/** Teto do motivo escrito por um moderador (castigo, expulsão, banimento). */
export const MAX_MODERATION_REASON = 512;

// ── Registro de auditoria ────────────────────────────────────

/**
 * O que um registro de auditoria descreve. Um valor por ação *moderável*: se
 * uma ação nova precisa aparecer no registro, ela entra aqui, no enum do banco
 * e em `AUDIT_ACTION_LABELS` — os três travados pelo typecheck.
 */
export type AuditAction =
  | "MEMBER_KICK"
  | "MEMBER_BAN"
  | "MEMBER_UNBAN"
  | "MEMBER_TIMEOUT"
  | "MEMBER_TIMEOUT_REMOVE"
  | "MEMBER_ROLE_UPDATE"
  | "CHANNEL_CREATE"
  | "CHANNEL_UPDATE"
  | "CHANNEL_DELETE"
  | "ROLE_CREATE"
  | "ROLE_UPDATE"
  | "ROLE_DELETE"
  | "INVITE_CREATE"
  | "INVITE_REVOKE"
  | "MESSAGE_DELETE"
  | "MESSAGE_BULK_DELETE"
  | "GUILD_UPDATE"
  | "EMOJI_CREATE"
  | "STICKER_CREATE";

/** Que tipo de coisa o `targetId` de um registro aponta. */
export type AuditTargetType =
  | "USER"
  | "CHANNEL"
  | "ROLE"
  | "INVITE"
  | "MESSAGE"
  | "GUILD"
  | "EMOJI"
  | "STICKER";

/** Rótulo em pt-BR de cada ação, para o filtro e a linha do registro. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  MEMBER_KICK: "Membro expulso",
  MEMBER_BAN: "Membro banido",
  MEMBER_UNBAN: "Banimento removido",
  MEMBER_TIMEOUT: "Membro de castigo",
  MEMBER_TIMEOUT_REMOVE: "Castigo removido",
  MEMBER_ROLE_UPDATE: "Cargo alterado",
  CHANNEL_CREATE: "Canal criado",
  CHANNEL_UPDATE: "Canal editado",
  CHANNEL_DELETE: "Canal apagado",
  ROLE_CREATE: "Cargo criado",
  ROLE_UPDATE: "Cargo editado",
  ROLE_DELETE: "Cargo apagado",
  INVITE_CREATE: "Convite criado",
  INVITE_REVOKE: "Convite revogado",
  MESSAGE_DELETE: "Mensagem apagada",
  MESSAGE_BULK_DELETE: "Mensagens apagadas em lote",
  GUILD_UPDATE: "Servidor editado",
  EMOJI_CREATE: "Emoji criado",
  STICKER_CREATE: "Figurinha criada",
};

/** Todas as ações, na ordem em que o filtro as lista. */
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

/** Um campo que mudou, do jeito que o registro guarda (antes → depois). */
export interface AuditLogChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditLogEntry {
  id: string;
  guildId: string;
  /** quem agiu; null quando a conta já não existe. */
  actor: PublicUser | null;
  action: AuditAction;
  targetId: string | null;
  targetType: AuditTargetType | null;
  /**
   * Nome do alvo *no momento do registro*. Guardado junto porque o alvo pode
   * deixar de existir (canal apagado, convite revogado) e o registro continua
   * precisando dizer sobre o quê ele fala.
   */
  targetName: string | null;
  changes: AuditLogChange[];
  reason: string | null;
  createdAt: string;
}

/** Página do registro; `nextCursor` null = acabou. */
export interface AuditLogPage {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

export const AUDIT_PAGE_SIZE = 50;

// ── Castigo (timeout) ────────────────────────────────────────

/** Durações que a UI oferece, como no Discord. */
export const TIMEOUT_PRESETS: readonly { label: string; minutes: number }[] = [
  { label: "60 segundos", minutes: 1 },
  { label: "5 minutos", minutes: 5 },
  { label: "10 minutos", minutes: 10 },
  { label: "1 hora", minutes: 60 },
  { label: "1 dia", minutes: 60 * 24 },
  { label: "1 semana", minutes: 60 * 24 * 7 },
];

/** Teto de um castigo (o Discord também para em 28 dias). */
export const MAX_TIMEOUT_MINUTES = 60 * 24 * 28;

/**
 * O castigo está valendo agora? Um `timeoutUntil` no passado é lixo histórico —
 * quem lê nunca deve tratar "tem data" como "está de castigo".
 */
export function isTimedOut(until: string | null | undefined, now: number = Date.now()): boolean {
  if (!until) return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > now;
}

// ── Remoção em lote ──────────────────────────────────────────

/** Máximo de mensagens por chamada de remoção em lote (o Discord usa 100). */
export const MAX_BULK_DELETE = 100;

/** Janelas de limpeza oferecidas no modal de banimento. */
export const PURGE_WINDOWS: readonly { label: string; hours: number }[] = [
  { label: "Não apagar mensagens", hours: 0 },
  { label: "Última hora", hours: 1 },
  { label: "Últimas 24 horas", hours: 24 },
  { label: "Últimos 7 dias", hours: 24 * 7 },
];

/** Várias mensagens sumiram de um canal de uma vez (moderação). */
export interface MessagesBulkDeletedEvent {
  channelId: string;
  messageIds: string[];
}

// ── Mensagens de sistema ─────────────────────────────────────

/**
 * Mensagem que o servidor escreve sozinho. `SYSTEM_JOIN` é o "X entrou no
 * servidor" do canal de sistema; `SYSTEM_MOD_NOTICE` é o aviso que a moderação
 * manda na DM de quem foi expulso ou banido.
 */
export type MessageSystemType = "SYSTEM_JOIN" | "SYSTEM_MOD_NOTICE";

// ── Enquetes ─────────────────────────────────────────────────

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 10;
export const MAX_POLL_QUESTION = 300;
export const MAX_POLL_OPTION = 55;

/** Durações de enquete oferecidas na UI. */
export const POLL_DURATIONS: readonly { label: string; hours: number }[] = [
  { label: "1 hora", hours: 1 },
  { label: "4 horas", hours: 4 },
  { label: "8 horas", hours: 8 },
  { label: "1 dia", hours: 24 },
  { label: "3 dias", hours: 24 * 3 },
  { label: "1 semana", hours: 24 * 7 },
  { label: "2 semanas", hours: 24 * 14 },
];

export interface PollOption {
  /** posição da opção na enquete; é ela que o voto referencia. */
  index: number;
  text: string;
  votes: number;
  /** o espectador votou nesta opção. */
  me: boolean;
}

export interface Poll {
  /** a enquete é uma face da mensagem — o id dela é a chave. */
  messageId: string;
  question: string;
  options: PollOption[];
  /** aceita marcar mais de uma opção. */
  multi: boolean;
  expiresAt: string | null;
  /** encerrada à mão pelo autor ou pela moderação. */
  closedAt: string | null;
  /** votos somados (com `multi`, uma pessoa pode contar mais de uma vez). */
  totalVotes: number;
}

/** Não aceita mais voto: encerrada à mão ou vencida. */
export function isPollClosed(
  poll: Pick<Poll, "expiresAt" | "closedAt">,
  now: number = Date.now(),
): boolean {
  if (poll.closedAt) return true;
  if (!poll.expiresAt) return false;
  const t = new Date(poll.expiresAt).getTime();
  return Number.isFinite(t) && t <= now;
}

/**
 * Porcentagem inteira de uma opção. Arredonda para baixo de propósito: a soma
 * nunca passa de 100%, que é o que estragaria as barras.
 */
export function pollPercent(votes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((votes / total) * 100);
}

/** Contagem da enquete mudou (voto, desvoto ou encerramento). */
export interface PollUpdatedEvent {
  channelId: string;
  poll: Poll;
}

/** Quem votou em cada opção (só moderação enxerga). */
export interface PollVoters {
  messageId: string;
  /** por índice de opção, os usuários que a marcaram. */
  byOption: { index: number; users: PublicUser[] }[];
}

// ── Denúncias ────────────────────────────────────────────────

export type ReportReason =
  | "SPAM"
  | "HARASSMENT"
  | "HATE"
  | "VIOLENCE"
  | "NSFW"
  | "SELF_HARM"
  | "OTHER";

export const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam ou propaganda" },
  { value: "HARASSMENT", label: "Assédio ou perseguição" },
  { value: "HATE", label: "Discurso de ódio" },
  { value: "VIOLENCE", label: "Violência ou ameaça" },
  { value: "NSFW", label: "Conteúdo adulto" },
  { value: "SELF_HARM", label: "Automutilação ou suicídio" },
  { value: "OTHER", label: "Outro motivo" },
];

export const MAX_REPORT_DETAILS = 500;

export interface ReportView {
  id: string;
  guildId: string;
  channelId: string;
  channelName: string | null;
  messageId: string | null;
  /** conteúdo da mensagem no momento da denúncia (ela pode sumir depois). */
  messageContent: string | null;
  reporter: PublicUser | null;
  /** autor da mensagem denunciada. */
  target: PublicUser | null;
  reason: ReportReason;
  details: string | null;
  resolved: boolean;
  resolvedBy: PublicUser | null;
  resolvedAt: string | null;
  createdAt: string;
}

// ── Convites ─────────────────────────────────────────────────

/** Expirações oferecidas na UI; `minutes: 0` = nunca expira. */
export const INVITE_EXPIRY_OPTIONS: readonly { label: string; minutes: number }[] = [
  { label: "30 minutos", minutes: 30 },
  { label: "1 hora", minutes: 60 },
  { label: "6 horas", minutes: 360 },
  { label: "12 horas", minutes: 720 },
  { label: "1 dia", minutes: 1440 },
  { label: "7 dias", minutes: 10080 },
  { label: "Nunca", minutes: 0 },
];

/** Limites de uso oferecidos na UI; `uses: 0` = sem limite. */
export const INVITE_USES_OPTIONS: readonly { label: string; uses: number }[] = [
  { label: "1 uso", uses: 1 },
  { label: "5 usos", uses: 5 },
  { label: "10 usos", uses: 10 },
  { label: "25 usos", uses: 25 },
  { label: "50 usos", uses: 50 },
  { label: "100 usos", uses: 100 },
  { label: "Sem limite", uses: 0 },
];

/** Opções de criação de convite (0 = "sem limite"/"nunca", como na UI). */
export interface InviteOptions {
  expiresInMinutes?: number;
  maxUses?: number;
  /** convidado só continua no servidor enquanto estiver conectado. */
  temporary?: boolean;
  /** canal para onde o convite leva; null = canal de sistema ou o primeiro. */
  channelId?: string | null;
}

/** Convite na lista de moderação: o `InviteInfo` mais o contexto. */
export interface InviteDetail extends InviteInfo {
  creator: PublicUser | null;
  temporary: boolean;
  channelId: string | null;
  channelName: string | null;
  createdAt: string;
}

/** Prévia pública, com o que a página `/invite/:code` mostra antes do login. */
export interface InviteFullPreview extends InvitePreview {
  memberCount: number;
  onlineCount: number;
  description: string | null;
  channelName: string | null;
  inviter: PublicUser | null;
  /** já sou membro deste servidor (só vale para quem está logado). */
  member: boolean;
}

// ── Onboarding, regras e boas-vindas ─────────────────────────

export const MAX_WELCOME_DESCRIPTION = 300;
export const MAX_WELCOME_CHANNELS = 5;
export const MAX_GUILD_DESCRIPTION = 300;

/** Configuração do servidor que governa entrada, regras e descoberta. */
export interface GuildOnboarding {
  /** canal onde entram as mensagens "X entrou no servidor"; null = desligado. */
  systemChannelId: string | null;
  /** canal de regras; quando existe, postar exige aceite. */
  rulesChannelId: string | null;
  welcomeDescription: string | null;
  /** canais em destaque na tela de boas-vindas, na ordem escolhida. */
  welcomeChannelIds: string[];
  /** aparece em "Descobrir". */
  discoverable: boolean;
  description: string | null;
}

export type GuildOnboardingUpdate = Partial<GuildOnboarding>;

/** O que o cliente precisa saber sobre *mim* neste servidor. */
export interface GuildMembership {
  guildId: string;
  onboarding: GuildOnboarding;
  /** canais em destaque já resolvidos (id + nome), na ordem escolhida. */
  welcomeChannels: { id: string; name: string | null }[];
  acceptedRulesAt: string | null;
  timeoutUntil: string | null;
  /** o servidor tem canal de regras e eu ainda não aceitei. */
  mustAcceptRules: boolean;
  /** nunca vi a tela de boas-vindas deste servidor (e há o que mostrar). */
  showWelcome: boolean;
}

/** A configuração de onboarding/descoberta do servidor mudou. */
export interface GuildSettingsUpdatedEvent {
  guildId: string;
  onboarding: GuildOnboarding;
}

// ── Descobrir servidores ─────────────────────────────────────

export interface DiscoverableGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  memberCount: number;
  onlineCount: number;
  /** já sou membro — o card mostra "Abrir" em vez de "Entrar". */
  joined: boolean;
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
