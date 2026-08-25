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
  /** status personalizado (texto), já expirado = null. Ver `// ── d-social ──`. */
  customStatusText: string | null;
  /** emoji do status personalizado. */
  customStatusEmoji: string | null;
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
  /** "Sobre mim" do perfil rico (d-social). */
  aboutMe?: string | null;
  /** pronomes exibidos ao lado do nome no perfil (d-social). */
  pronouns?: string | null;
  /** cor da faixa do perfil, em hex `#rrggbb` (d-social). */
  bannerColor?: string | null;
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
  /** DEFAULT = escrita por alguém; SYSTEM_* = evento do grupo (d-social). */
  type: MessageType;
  /**
   * Eco do nonce que o cliente mandou no `message.create`. Só aparece no evento
   * `message.new`; nunca é persistido nem volta no histórico REST. Serve para o
   * autor casar a mensagem real com a versão otimista que já está na tela.
   */
  nonce?: string;
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
  /** ícone do grupo (upload), null em DM 1-a-1 e em grupo sem ícone. */
  iconUrl: string | null;
  /** dono do grupo — quem pode remover participantes. null em DM 1-a-1. */
  ownerId: string | null;
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
  // ── d-social ──
  FRIEND_REQUEST: "friend.request",
  FRIEND_ACCEPTED: "friend.accepted",
  FRIEND_REMOVED: "friend.removed",
  USER_BLOCKED: "user.blocked",
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

// ── d-social ────────────────────────────────────────────────
// Amizades, bloqueio, status personalizado, perfil rico e o que é específico
// de grupo de DM. Tudo o que a API e o cliente trocam sobre "gente" (e não
// sobre "canal") mora nesta seção.

/**
 * Tipo de uma mensagem. `DEFAULT` é a mensagem escrita por alguém; as `SYSTEM_*`
 * são eventos do grupo de DM renderizados como uma linha discreta ("X adicionou
 * Y"), sem avatar nem ações. O autor é sempre *quem fez* a ação; o `content`
 * guarda o alvo (username) ou o valor novo (nome do grupo).
 */
export type MessageType =
  | "DEFAULT"
  | "SYSTEM_MEMBER_ADDED"
  | "SYSTEM_MEMBER_REMOVED"
  | "SYSTEM_MEMBER_LEFT"
  | "SYSTEM_GROUP_RENAMED"
  | "SYSTEM_GROUP_ICON";

/** true quando a mensagem é um evento do grupo, não texto de alguém. */
export function isSystemMessage(m: Pick<Message, "type">): boolean {
  return m.type !== "DEFAULT";
}

// ── Amigos ───────────────────────────────────────────────────

/** Estado de uma amizade. `PENDING` = pedido enviado e ainda não respondido. */
export type FriendshipStatus = "PENDING" | "ACCEPTED";

/**
 * Um pedido de amizade na visão de quem lista: o outro lado já resolvido em
 * `user`, mais quem pediu — a UI precisa saber se o pedido é recebido (aceitar
 * / recusar) ou enviado (cancelar).
 */
export interface FriendRequest {
  id: string;
  requesterId: string;
  addresseeId: string;
  user: PublicUser;
  createdAt: string;
}

/** As listas da página Amigos numa chamada só (`GET /friends`). */
export interface FriendLists {
  friends: PublicUser[];
  /** pedidos que me mandaram (aceitar/recusar). */
  incoming: FriendRequest[];
  /** pedidos que eu mandei (cancelar). */
  outgoing: FriendRequest[];
  /** quem eu bloqueei. */
  blocked: PublicUser[];
}

/**
 * Minha relação com outro usuário — o que decide as ações do popover e do
 * modal de perfil. "Ele me bloqueou" não é revelado ao cliente: a API responde
 * `none` para não vazar o bloqueio, como o Discord.
 */
export type RelationshipKind = "self" | "none" | "friend" | "incoming" | "outgoing" | "blocked";

/** Pedido de amizade por nome de usuário (é assim que o Discord adiciona). */
export const friendRequestSchema = z.object({
  username: z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .trim()
    .min(3, "Nome de usuário muito curto")
    .max(32, "Nome de usuário muito longo"),
});
export type FriendRequestInput = z.infer<typeof friendRequestSchema>;

/** Evento: alguém me mandou um pedido (chega a quem recebe). */
export interface FriendRequestEvent {
  request: FriendRequest;
}

/** Evento: um pedido virou amizade (chega aos dois lados). */
export interface FriendAcceptedEvent {
  user: PublicUser;
}

/**
 * Evento: a relação acabou — recusa, cancelamento, remoção de amigo ou
 * bloqueio. `userId` é o outro lado, na visão de quem recebe o evento.
 */
export interface FriendRemovedEvent {
  userId: string;
}

/** Evento: eu bloqueei/desbloqueei alguém (só as minhas abas recebem). */
export interface UserBlockedEvent {
  userId: string;
  blocked: boolean;
}

// ── Status personalizado ─────────────────────────────────────

export const MAX_CUSTOM_STATUS = 128;

/** Prazos que o Discord oferece para o status personalizado expirar. */
export type CustomStatusDuration = "never" | "1h" | "4h" | "today" | "week";

export const CUSTOM_STATUS_DURATIONS: { value: CustomStatusDuration; label: string }[] = [
  { value: "never", label: "Não limpar" },
  { value: "1h", label: "1 hora" },
  { value: "4h", label: "4 horas" },
  { value: "today", label: "Hoje" },
  { value: "week", label: "Esta semana" },
];

export const customStatusSchema = z.object({
  text: z
    .string()
    .trim()
    .max(MAX_CUSTOM_STATUS, `Status acima de ${MAX_CUSTOM_STATUS} caracteres`)
    .nullable(),
  /** o emoji é conteúdo do usuário; o teto só evita usar a coluna como blob. */
  emoji: z.string().max(64, "Emoji inválido").nullable(),
  duration: z.enum(["never", "1h", "4h", "today", "week"]),
});
export type CustomStatusUpdate = z.infer<typeof customStatusSchema>;

/**
 * Quando o status personalizado deixa de valer. Fica no contrato (e não na API)
 * porque a tela mostra o mesmo prazo que o servidor vai gravar — e porque é
 * lógica pura, testável dos dois lados. "Hoje" = meia-noite seguinte; "esta
 * semana" = meia-noite do próximo domingo.
 */
export function customStatusExpiry(duration: CustomStatusDuration, agora: Date): Date | null {
  switch (duration) {
    case "never":
      return null;
    case "1h":
      return new Date(agora.getTime() + 60 * 60 * 1000);
    case "4h":
      return new Date(agora.getTime() + 4 * 60 * 60 * 1000);
    case "today": {
      const d = new Date(agora);
      d.setHours(24, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(agora);
      // 0 = domingo; sempre avança ao menos um dia para não expirar na hora
      const faltam = 7 - d.getDay() || 7;
      d.setDate(d.getDate() + faltam);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
}

/** Texto do status personalizado com o emoji, ou null quando não há status. */
export function customStatusOf(
  u: Pick<PublicUser, "customStatusText" | "customStatusEmoji">,
): string | null {
  const partes = [u.customStatusEmoji, u.customStatusText].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return partes.length > 0 ? partes.join(" ") : null;
}

// ── Perfil rico ──────────────────────────────────────────────

export const MAX_ABOUT_ME = 190;
export const MAX_PRONOUNS = 40;
/** Teto do banner do perfil (bytes) — mesma ordem de grandeza do avatar. */
export const MAX_BANNER_SIZE = 6 * 1024 * 1024;

/** `#rrggbb`. Hex de 3 dígitos é recusado para o valor gravado ser sempre igual. */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Perfil completo de um usuário (`GET /users/:id/profile`), na visão de quem
 * pede: os "em comum" e a `relationship` mudam por espectador, por isso não
 * cabem no `PublicUser`.
 */
export interface UserProfile {
  user: PublicUser;
  aboutMe: string | null;
  pronouns: string | null;
  bannerColor: string | null;
  bannerUrl: string | null;
  /** "Membro desde" — quando a conta foi criada. */
  createdAt: string;
  /** última desconexão; null = nunca esteve online ou está online agora. */
  lastSeenAt: string | null;
  relationship: RelationshipKind;
  mutualFriends: PublicUser[];
  mutualGuilds: { id: string; name: string; iconUrl: string | null }[];
  /**
   * Papel no servidor passado em `?guildId=` (null fora desse contexto). Os
   * cargos coloridos entram aqui quando o agente C entregar `Permission`.
   */
  guildRole: MemberRole | null;
}

// ── Presença rica ────────────────────────────────────────────

/**
 * Silêncio na aba que faz o cliente se declarar ausente (Discord: 10 min). É o
 * cliente quem detecta — o servidor só recebe o `PATCH /users/me/status`.
 */
export const IDLE_APOS_MS = 10 * 60 * 1000;

// ── Grupos de DM ─────────────────────────────────────────────

export const MAX_DM_GROUP_NAME = 64;
/** Teto do ícone do grupo (bytes). */
export const MAX_GROUP_ICON_SIZE = 4 * 1024 * 1024;

export const dmGroupUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_DM_GROUP_NAME, `Nome acima de ${MAX_DM_GROUP_NAME} caracteres`)
    .nullable(),
});
export type DMGroupUpdate = z.infer<typeof dmGroupUpdateSchema>;

/** Linha de uma mensagem de sistema, montada a partir do tipo e do conteúdo. */
export function systemMessageText(m: Pick<Message, "type" | "content">, autor: string): string {
  switch (m.type) {
    case "SYSTEM_MEMBER_ADDED":
      return `${autor} adicionou ${m.content} ao grupo.`;
    case "SYSTEM_MEMBER_REMOVED":
      return `${autor} removeu ${m.content} do grupo.`;
    case "SYSTEM_MEMBER_LEFT":
      return `${autor} saiu do grupo.`;
    case "SYSTEM_GROUP_RENAMED":
      return m.content
        ? `${autor} mudou o nome do grupo para ${m.content}.`
        : `${autor} removeu o nome do grupo.`;
    case "SYSTEM_GROUP_ICON":
      return `${autor} mudou o ícone do grupo.`;
    default:
      return m.content;
  }
}
