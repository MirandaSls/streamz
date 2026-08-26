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
 * Tipo do canal. TEXT/VOICE/ANNOUNCEMENT vivem num servidor; DM/GROUP são
 * conversas sem servidor (`guildId` null) cujo acesso é ser participante — ver
 * ADR-0001. ANNOUNCEMENT é um canal de texto em que só a moderação posta.
 */
export type ChannelType = "TEXT" | "VOICE" | "DM" | "GROUP" | "ANNOUNCEMENT";
/** Só os tipos que um usuário cria dentro de um servidor. */
export type GuildChannelType = Extract<ChannelType, "TEXT" | "VOICE" | "ANNOUNCEMENT">;
export const GUILD_CHANNEL_TYPES: readonly GuildChannelType[] = ["TEXT", "VOICE", "ANNOUNCEMENT"];
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
  /** texto livre exibido nas configurações e no convite. */
  description: string | null;
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
  /** categoria a que o canal pertence (null = sem categoria, fica no topo). */
  categoryId: string | null;
  /** descrição curta mostrada no cabeçalho (null = sem tópico). */
  topic: string | null;
  /** intervalo mínimo entre mensagens do mesmo autor; 0 = desligado. */
  slowmodeSeconds: number;
  /** conteúdo sensível: pede confirmação antes de abrir. */
  nsfw: boolean;
}

/** Não lido = existe mensagem depois do que eu li (ou nunca li e há mensagem). */
export function isUnread(c: Pick<Channel, "lastMessageAt" | "lastReadAt">): boolean {
  if (!c.lastMessageAt) return false;
  if (!c.lastReadAt) return true;
  return new Date(c.lastMessageAt).getTime() > new Date(c.lastReadAt).getTime();
}

/**
 * Menção a cargo, do jeito que o texto a guarda: `<@&roleId>`.
 *
 * É a forma com id (e não `@nome`) porque cargo é renomeável: guardar o nome
 * quebraria a menção no dia em que alguém renomeasse o cargo. Só cargos com
 * `mentionable` chegam a ser inseridos pelo composer — a marcação em si não
 * autoriza nada, é o cliente que decide o que oferece.
 */
const ROLE_MENTION_RE = /<@&([A-Za-z0-9_-]{1,64})>/g;

/** Ids dos cargos mencionados no texto, sem repetição. */
export function mentionedRoleIds(content: string): string[] {
  const ids = new Set<string>();
  for (const m of content.matchAll(ROLE_MENTION_RE)) ids.add(m[1]);
  return Array.from(ids);
}

/** true se o texto menciona algum dos cargos passados. */
export function mentionsRole(content: string, roleIds: readonly string[]): boolean {
  if (roleIds.length === 0) return false;
  const mencionados = mentionedRoleIds(content);
  return mencionados.some((id) => roleIds.includes(id));
}

/**
 * true se o texto menciona `@username` (limite de palavra dos dois lados), um
 * cargo meu (`<@&roleId>`) ou atinge todo mundo com `@everyone`/`@here` — que
 * também é menção a mim, senão o aviso do Discord que mais importa seria o
 * único a não contar. Quem não tem permissão para mencionar todos não chega a
 * enviar a menção: o cliente manda texto puro (ver `mentionsEveryone`, na
 * seção g-emojis-midia).
 *
 * `roleIds` são os cargos de quem está lendo; em conversa direta é `[]`.
 */
export function mentionsUser(
  content: string,
  username: string,
  roleIds: readonly string[] = [],
): boolean {
  const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|[^\\w.])@${esc}(?![\\w.-])`, "i").test(content)) return true;
  if (mentionsRole(content, roleIds)) return true;
  return mentionsEveryone(content);
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
  /** figurinha enviada no lugar do texto (g-emojis-midia); null quando não há. */
  sticker: Sticker | null;
  /** autor/moderação removeu a prévia de link desta mensagem (g-emojis-midia). */
  suppressEmbeds: boolean;
  /**
   * Eco do nonce que o cliente mandou no `message.create`. Só aparece no evento
   * `message.new`; nunca é persistido nem volta no histórico REST. Serve para o
   * autor casar a mensagem real com a versão otimista que já está na tela.
   */
  nonce?: string;
  // ── a-mensagens ──
  /** DEFAULT ou narração do sistema (fixar, entrada de membro, grupo de DM). */
  type: MessageType;
  /** mensagem respondida (referência curta), quando esta é uma resposta. */
  replyTo: MessageReplyRef | null;
  /** true quando a resposta menciona o autor da original ("@ ligado"). */
  replyMention: boolean;
  /** thread nomeada iniciada nesta mensagem (só em mensagem raiz). */
  thread: ThreadSummary | null;
  /** true quando a mensagem está fixada no canal. */
  pinned: boolean;
  /** h-moderacao: preenchido quando a mensagem é uma enquete. */
  poll?: Poll | null;
}

export interface GuildMemberView {
  user: PublicUser;
  role: MemberRole;
  /** ids dos cargos atribuídos (sem o @everyone, que vale para todos). */
  roleIds: string[];
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
  CALL_RING: "call.ring",
  CALL_ENDED: "call.ended",
  // ── c-cargos ──
  ROLE_CREATED: "role.created",
  ROLE_UPDATED: "role.updated",
  ROLE_DELETED: "role.deleted",
  CHANNEL_OVERRIDES: "channel.overrides",
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
  /** cargos do membro depois da mudança (ausente = só o papel mudou). */
  roleIds?: string[];
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

// ── f-voz ────────────────────────────────────────────────────
/**
 * Estado de voz de um usuário num canal, do jeito que o gateway transmite.
 *
 * Vale tanto para canal de voz de servidor (`guildId` preenchido) quanto para
 * chamada em conversa direta (`guildId` null) — a "sala" é sempre um canal, na
 * mesma linha da ADR-0001. `connected: false` é a saída: o cliente remove o
 * participante em vez de manter um estado zumbi.
// ── b-canais ─────────────────────────────────────────────────

/**
 * Categoria de canais dentro de um servidor. É só agrupamento visual da barra
 * lateral: não autoriza nada e não muda a rota de nenhum canal. Um canal sem
 * categoria (`categoryId` null) fica no topo da lista, como no Discord.
 */
export interface Category {
  id: string;
  guildId: string;
  name: string;
  position: number;
}

export const MAX_CATEGORY_NAME = 64;
/** Teto do tópico do canal (o mesmo do Discord). */
export const MAX_CHANNEL_TOPIC = 1024;
/** Teto do modo lento: 6 horas, como no Discord. */
export const MAX_SLOWMODE_SECONDS = 21600;

/** Presets de modo lento oferecidos na UI (segundos). */
export const SLOWMODE_PRESETS: readonly number[] = [
  0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600,
];

/** Rótulo humano de uma duração de modo lento ("5s", "2min", "6h"). */
export function slowmodeLabel(seconds: number): string {
  if (seconds <= 0) return "Desligado";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * Segundos que ainda faltam para o autor poder mandar outra mensagem.
 *
 * Fica no contrato porque os dois lados precisam do *mesmo* cálculo: a API
 * recusa o envio (429) e o cliente mostra a contagem regressiva. Arredonda para
 * cima para nunca prometer um envio que o servidor ainda recusaria.
 */
export function slowmodeRemaining(
  slowmodeSeconds: number,
  lastMessageAt: Date | string | null,
  now: Date = new Date(),
): number {
  if (slowmodeSeconds <= 0 || !lastMessageAt) return 0;
  const last = typeof lastMessageAt === "string" ? new Date(lastMessageAt) : lastMessageAt;
  const decorrido = (now.getTime() - last.getTime()) / 1000;
  if (!Number.isFinite(decorrido)) return 0;
  return Math.max(0, Math.ceil(slowmodeSeconds - decorrido));
}

/** Canal onde se lê e escreve texto — inclui o canal de anúncios. */
export function isTextChannel(c: Pick<Channel, "type">): boolean {
  return c.type === "TEXT" || c.type === "ANNOUNCEMENT";
}

/** Um canal na nova ordem: posição dentro da categoria (null = sem categoria). */
export interface ChannelPosition {
  id: string;
  position: number;
  categoryId: string | null;
}

/** Uma categoria na nova ordem. */
export interface CategoryPosition {
  id: string;
  position: number;
}

/** Corpo de `PATCH /guilds/:id/channels/positions` (reordenar em lote). */
export interface ReorderPayload {
  channels?: ChannelPosition[];
  categories?: CategoryPosition[];
}

/** Categoria apagada — os canais dela ficam sem categoria. */
export interface CategoryDeletedEvent {
  categoryId: string;
  guildId: string;
}

/** Resultado de "marcar servidor como lido" (`POST /guilds/:id/read`). */
export interface GuildReadResult {
  guildId: string;
  channelIds: string[];
  lastReadAt: string;
}

/**
 * Quem está num canal de voz, ao vivo (emitido pelo gateway do agente F na
 * sala `guild:<id>`; a barra lateral consome para listar sob o canal).
 */
export interface VoiceStateEvent {
  channelId: string;
  guildId: string | null;
  user: PublicUser;
  connected: boolean;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
}

/** Flags que o próprio usuário controla e transmite (`voice.update`). */
export type VoiceFlags = Pick<VoiceStateEvent, "muted" | "deafened" | "video" | "screen">;

export const VOICE_FLAGS_PADRAO: VoiceFlags = {
  muted: false,
  deafened: false,
  video: false,
  screen: false,
};

/** Tempo que uma chamada em DM toca antes de desistir sozinha. */
export const CALL_RING_TIMEOUT_MS = 30_000;

/** Folga entre soltar a tecla de push-to-talk e o microfone fechar de novo. */
export const PTT_RELEASE_MS = 200;

/** Presets de qualidade do compartilhamento de tela (o seletor do botão). */
export type ScreenQuality = "720p30" | "1080p30" | "1080p60";

export interface ScreenQualityPreset {
  label: string;
  width: number;
  height: number;
  frameRate: number;
}

export const SCREEN_QUALITY: Record<ScreenQuality, ScreenQualityPreset> = {
  "720p30": { label: "720p · 30 fps", width: 1280, height: 720, frameRate: 30 },
  "1080p30": { label: "1080p · 30 fps", width: 1920, height: 1080, frameRate: 30 },
  "1080p60": { label: "1080p · 60 fps", width: 1920, height: 1080, frameRate: 60 },
};

/** Quem está numa chamada e o token de mídia, quando o LiveKit está configurado. */
export interface CallStartResponse {
  channelId: string;
  /** null quando o LiveKit não está configurado: a chamada toca, mas não conecta mídia. */
  voice: VoiceTokenResponse | null;
  /** estado de voz de quem já está na sala (inclusive quem acabou de entrar). */
  states: VoiceStateEvent[];
  /** participantes para quem o `call.ring` foi emitido. */
  ringing: PublicUser[];
}

/** Alguém está chamando numa conversa direta. */
export interface CallRingEvent {
  channelId: string;
  from: PublicUser;
}

/** Fim de uma chamada em DM, do ponto de vista de quem recebe o aviso. */
export interface CallEndedEvent {
  channelId: string;
  /** quem encerrou/recusou (null = a chamada expirou sem resposta). */
  by: PublicUser | null;
  reason: "declined" | "ended" | "timeout";
}

export const voiceJoinSchema = z.object({ channelId: idSchema });
export type VoiceJoinPayload = z.infer<typeof voiceJoinSchema>;

export const voiceUpdateSchema = z.object({
  muted: z.boolean(),
  deafened: z.boolean(),
  video: z.boolean(),
  screen: z.boolean(),
});
export type VoiceUpdatePayload = z.infer<typeof voiceUpdateSchema>;

/** `call.decline` / `call.end`: só o canal da conversa. */
export const callSchema = z.object({ channelId: idSchema });
export type CallPayload = z.infer<typeof callSchema>;

/** true se o canal é uma sala de voz possível (canal de voz ou conversa direta). */
export function isVoiceCapable(c: Pick<Channel, "type">): boolean {
  return c.type === "VOICE" || isDirectChannel(c);
}

// ── c-cargos ─────────────────────────────────────────────────
/**
 * Permissões como bitfield (ver `docs/adr/0002-cargos-e-permissoes.md`).
 *
 * Os bits são **estáveis para sempre**: o valor fica gravado em cada linha de
 * `Role` e de `ChannelOverride`. Permissão nova entra no próximo bit livre —
 * nenhuma é renumerada nem reciclada.
 *
 * É `number` (e não `bigint`) porque `&`/`|`/`~` do JavaScript operam em 32 bits
 * com sinal: com bigint toda checagem exigiria conversão, e um `Number()`
 * esquecido viraria bug silencioso. O preço é o teto de 30 bits utilizáveis.
 */
export const Permission = {
  VIEW_CHANNEL: 1 << 0,
  SEND_MESSAGES: 1 << 1,
  MANAGE_MESSAGES: 1 << 2,
  MANAGE_CHANNELS: 1 << 3,
  MANAGE_ROLES: 1 << 4,
  KICK_MEMBERS: 1 << 5,
  BAN_MEMBERS: 1 << 6,
  MANAGE_GUILD: 1 << 7,
  CREATE_INVITE: 1 << 8,
  ATTACH_FILES: 1 << 9,
  ADD_REACTIONS: 1 << 10,
  MENTION_EVERYONE: 1 << 11,
  CONNECT: 1 << 12,
  SPEAK: 1 << 13,
  MUTE_MEMBERS: 1 << 14,
  /** silenciar temporariamente (timeout) — usado pela moderação. */
  MODERATE_MEMBERS: 1 << 15,
  MANAGE_EMOJIS: 1 << 16,
  VIEW_AUDIT_LOG: 1 << 17,
  /** ignora todas as outras checagens, inclusive overrides de canal. */
  ADMINISTRATOR: 1 << 18,
} as const;

export type PermissionName = keyof typeof Permission;

/** Nome legível e explicação de cada permissão (UI de edição de cargo). */
export const PERMISSION_INFO: Record<
  PermissionName,
  { label: string; description: string; group: "geral" | "membros" | "mensagens" | "voz" }
> = {
  VIEW_CHANNEL: {
    label: "Ver canais",
    description: "Permite ver os canais do servidor por padrão (antes das regras de cada canal).",
    group: "geral",
  },
  SEND_MESSAGES: {
    label: "Enviar mensagens",
    description: "Permite escrever nos canais de texto.",
    group: "mensagens",
  },
  MANAGE_MESSAGES: {
    label: "Gerenciar mensagens",
    description: "Permite apagar mensagens de outras pessoas.",
    group: "mensagens",
  },
  MANAGE_CHANNELS: {
    label: "Gerenciar canais",
    description: "Permite criar, renomear, reordenar e apagar canais.",
    group: "geral",
  },
  MANAGE_ROLES: {
    label: "Gerenciar cargos",
    description: "Permite criar e editar cargos abaixo do seu cargo mais alto.",
    group: "geral",
  },
  KICK_MEMBERS: {
    label: "Expulsar membros",
    description: "Permite remover membros do servidor (eles voltam com convite).",
    group: "membros",
  },
  BAN_MEMBERS: {
    label: "Banir membros",
    description: "Permite banir e desbanir membros.",
    group: "membros",
  },
  MANAGE_GUILD: {
    label: "Gerenciar servidor",
    description: "Permite mudar nome, ícone e descrição, e administrar convites.",
    group: "geral",
  },
  CREATE_INVITE: {
    label: "Criar convite",
    description: "Permite gerar convites para o servidor.",
    group: "geral",
  },
  ATTACH_FILES: {
    label: "Anexar arquivos",
    description: "Permite enviar imagens e arquivos nas mensagens.",
    group: "mensagens",
  },
  ADD_REACTIONS: {
    label: "Adicionar reações",
    description: "Permite reagir às mensagens com emoji.",
    group: "mensagens",
  },
  MENTION_EVERYONE: {
    label: "Mencionar todos",
    description: "Permite notificar todo mundo do canal de uma vez.",
    group: "mensagens",
  },
  CONNECT: {
    label: "Conectar",
    description: "Permite entrar em canais de voz.",
    group: "voz",
  },
  SPEAK: {
    label: "Falar",
    description: "Permite transmitir áudio nos canais de voz.",
    group: "voz",
  },
  MUTE_MEMBERS: {
    label: "Silenciar membros",
    description: "Permite tirar o microfone de outras pessoas na voz.",
    group: "voz",
  },
  MODERATE_MEMBERS: {
    label: "Moderar membros",
    description: "Permite deixar um membro de castigo (sem falar) por um tempo.",
    group: "membros",
  },
  MANAGE_EMOJIS: {
    label: "Gerenciar emojis",
    description: "Permite adicionar e remover emojis personalizados.",
    group: "geral",
  },
  VIEW_AUDIT_LOG: {
    label: "Ver registro de auditoria",
    description: "Permite consultar o histórico de ações administrativas.",
    group: "geral",
  },
  ADMINISTRATOR: {
    label: "Administrador",
    description:
      "Concede todas as permissões e ignora as regras de cada canal. Dê com cuidado.",
    group: "geral",
  },
};

/** Ordem em que a UI lista as permissões (agrupada, como no Discord). */
export const PERMISSION_ORDER: readonly PermissionName[] = [
  "ADMINISTRATOR",
  "VIEW_CHANNEL",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_GUILD",
  "MANAGE_EMOJIS",
  "CREATE_INVITE",
  "VIEW_AUDIT_LOG",
  "SEND_MESSAGES",
  "MANAGE_MESSAGES",
  "ATTACH_FILES",
  "ADD_REACTIONS",
  "MENTION_EVERYONE",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "MODERATE_MEMBERS",
  "CONNECT",
  "SPEAK",
  "MUTE_MEMBERS",
];

/** Todas as permissões ligadas — o que o dono e o ADMINISTRATOR recebem. */
export const ALL_PERMISSIONS: number = PERMISSION_ORDER.reduce(
  (bits, name) => bits | Permission[name],
  0,
);

/** O que o @everyone ganha ao nascer o servidor (mesmo padrão do Discord). */
export const DEFAULT_PERMISSIONS: number =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.CREATE_INVITE |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.CONNECT |
  Permission.SPEAK;

/**
 * Permissões numa conversa direta: não há cargo nem override lá.
 * `MANAGE_MESSAGES` fica **de fora** de propósito — é o que faz "em DM só o
 * autor apaga" continuar valendo.
 */
export const DM_PERMISSIONS: number =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.CONNECT |
  Permission.SPEAK;

/** Nome do cargo padrão de todo servidor (não é apagável nem renomeável). */
export const EVERYONE_ROLE_NAME = "@everyone";
/** Cargo criado com o servidor para o atalho `GuildMember.role = ADMIN`. */
export const ADMIN_ROLE_NAME = "Administrador";

export const MAX_ROLE_NAME = 32;

/** true se o bitfield contém **todos** os bits de `permission`. */
export function hasPermission(bits: number, permission: number): boolean {
  return (bits & permission) === permission;
}

/** Nomes das permissões contidas num bitfield (para UI e depuração). */
export function permissionNames(bits: number): PermissionName[] {
  return PERMISSION_ORDER.filter((name) => hasPermission(bits, Permission[name]));
}

/** Paleta de cores de cargo oferecida na UI (as do Discord). */
export const ROLE_COLORS: readonly string[] = [
  "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63",
  "#f1c40f", "#e67e22", "#e74c3c", "#95a5a6", "#607d8b",
  "#11806a", "#1f8b4c", "#206694", "#71368a", "#ad1457",
  "#c27c0e", "#a84300", "#992d22", "#979c9f", "#546e7a",
];

/** Cor de cargo válida: `#rrggbb`. */
export function isRoleColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export interface Role {
  id: string;
  guildId: string;
  name: string;
  /** "#rrggbb"; null = sem cor (o nome fica na cor padrão do tema). */
  color: string | null;
  /** hierarquia: maior = mais alto. O @everyone é sempre 0. */
  position: number;
  permissions: number;
  /** membros deste cargo aparecem numa seção própria da lista de membros. */
  hoist: boolean;
  mentionable: boolean;
  /** o @everyone do servidor: não se apaga, não se renomeia, não se atribui. */
  isDefault: boolean;
}

/** Regra de um canal para um cargo **ou** um usuário (nunca os dois). */
export interface ChannelOverride {
  channelId: string;
  roleId: string | null;
  userId: string | null;
  allow: number;
  deny: number;
}

/** O que `computePermissions` precisa saber do membro. */
export interface PermissionMember {
  /** dono do servidor: recebe tudo e ignora cargos e overrides. */
  isOwner: boolean;
  /** ids dos cargos atribuídos (o @everyone é injetado, não entra aqui). */
  roleIds: readonly string[];
}

/**
 * Permissão efetiva de um membro, opcionalmente dentro de um canal.
 *
 * Função **pura** — a API e o cliente usam esta mesma implementação, para que a
 * UI esconda exatamente o que a API recusaria. A ordem das etapas é a regra do
 * Discord e está justificada na ADR-0002; mexer nela é mudança de segurança:
 *
 *   1. dono → tudo;
 *   2. base = @everyone | OR dos cargos do membro;
 *   3. ADMINISTRATOR → tudo (**antes** dos overrides: um deny de canal não
 *      tranca o administrador para fora do próprio servidor);
 *   4. override do @everyone       (deny, depois allow);
 *   5. overrides dos cargos do membro, **somados entre si** (deny, depois allow);
 *   6. override do próprio usuário (deny, depois allow).
 *
 * `overrides` deve conter só os do canal em questão; fora de canal, passe `[]`.
 */
export function computePermissions(
  member: PermissionMember,
  roles: readonly Role[],
  overrides: readonly ChannelOverride[] = [],
): number {
  if (member.isOwner) return ALL_PERMISSIONS;

  const everyone = roles.find((r) => r.isDefault);
  const meus = roles.filter((r) => !r.isDefault && member.roleIds.includes(r.id));

  let bits = everyone?.permissions ?? 0;
  for (const r of meus) bits |= r.permissions;
  if (hasPermission(bits, Permission.ADMINISTRATOR)) return ALL_PERMISSIONS;

  if (everyone) {
    const o = overrides.find((x) => x.roleId === everyone.id);
    if (o) bits = (bits & ~o.deny) | o.allow;
  }

  // Overrides de cargo não se ordenam entre si: acumula deny e allow e aplica
  // uma vez, deny primeiro — é o comportamento do Discord.
  let allowCargos = 0;
  let denyCargos = 0;
  for (const r of meus) {
    const o = overrides.find((x) => x.roleId === r.id);
    if (!o) continue;
    allowCargos |= o.allow;
    denyCargos |= o.deny;
  }
  bits = (bits & ~denyCargos) | allowCargos;

  const meu = overrides.find((x) => x.userId !== null);
  if (meu) bits = (bits & ~meu.deny) | meu.allow;

  return bits;
}

/** Posição do cargo mais alto do membro — o teto do que ele pode mexer. */
export function highestPosition(member: PermissionMember, roles: readonly Role[]): number {
  if (member.isOwner) return Number.MAX_SAFE_INTEGER;
  return roles
    .filter((r) => !r.isDefault && member.roleIds.includes(r.id))
    .reduce((max, r) => Math.max(max, r.position), 0);
}

/** Cargo mais alto **com cor** do membro — é dele a cor do nome na tela. */
export function colorRoleOf(roleIds: readonly string[], roles: readonly Role[]): Role | null {
  let escolhido: Role | null = null;
  for (const r of roles) {
    if (r.isDefault || !r.color || !roleIds.includes(r.id)) continue;
    if (!escolhido || r.position > escolhido.position) escolhido = r;
  }
  return escolhido;
}

/** Cargos do membro, do mais alto para o mais baixo (sem o @everyone). */
export function rolesOf(roleIds: readonly string[], roles: readonly Role[]): Role[] {
  return roles
    .filter((r) => !r.isDefault && roleIds.includes(r.id))
    .sort((a, b) => b.position - a.position);
}

// ── c-cargos: payloads REST e eventos ────────────────────────
export const MAX_GUILD_DESCRIPTION = 300;
export const MAX_GUILD_ICON_SIZE = 4 * 1024 * 1024; // 4 MB

/** Campos editáveis de um cargo (POST/PATCH /guilds/:id/roles). */
export interface RoleInput {
  name?: string;
  color?: string | null;
  permissions?: number;
  hoist?: boolean;
  mentionable?: boolean;
}

/** Campos editáveis do servidor (PATCH /guilds/:id). */
export interface GuildUpdate {
  name?: string;
  description?: string | null;
}

/** Regra de canal gravada por PUT /guilds/:id/channels/:cid/overrides. */
export interface ChannelOverrideInput {
  roleId?: string | null;
  userId?: string | null;
  allow: number;
  deny: number;
}

/** Resposta de GET /guilds/:id/members/:uid/permissions. */
export interface MemberPermissions {
  userId: string;
  guildId: string;
  /** permissão no servidor (fora de canal). */
  permissions: number;
  roleIds: string[];
}

/** Cargo apagado — evento `role.deleted` na sala `guild:<id>`. */
export interface RoleDeletedEvent {
  guildId: string;
  roleId: string;
}

/** Overrides de um canal mudaram: quem está vendo recalcula o que pode. */
export interface ChannelOverridesEvent {
  guildId: string;
  channelId: string;
  overrides: ChannelOverride[];
}

/** Posse do servidor passou para outra pessoa. */
export interface GuildOwnerChangedEvent {
  guildId: string;
  ownerId: string;
  /** papel de quem entregou (vira ADMIN) — a UI atualiza a coroa. */
  previousOwnerId: string;
}

// ── a-mensagens ──────────────────────────────────────────────

/**
 * Tipo da mensagem. `DEFAULT` é a mensagem escrita por alguém; as `SYSTEM_*`
 * são narração renderizada como uma linha discreta, sem avatar nem ações:
 * fixar (`SYSTEM_PIN`), entrada de membro (`SYSTEM_JOIN`, emitida pela
 * moderação) e os eventos de grupo de DM. O autor é sempre *quem fez* a ação;
 * o `content` guarda o alvo (username) ou o valor novo (nome do grupo).
 *
 * União única de propósito: o enum do banco tem exatamente estes literais, e a
 * equivalência é travada em `apps/api/src/common/enums.ts`.
 */
export type MessageType =
  | "DEFAULT"
  | "SYSTEM_PIN"
  | "SYSTEM_JOIN"
  | "SYSTEM_MEMBER_ADDED"
  | "SYSTEM_MEMBER_REMOVED"
  | "SYSTEM_MEMBER_LEFT"
  | "SYSTEM_GROUP_RENAMED"
  | "SYSTEM_GROUP_ICON"
  | "SYSTEM_MOD_NOTICE";

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
  me: Pick<PublicUser, "id" | "username"> & { roleIds?: readonly string[] },
): boolean {
  if (m.author.id === me.id) return false;
  if (mentionsUser(m.content, me.username, me.roleIds ?? [])) return true;
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

// ── e-configuracoes ──────────────────────────────────────────

/** Quanto um escopo (canal, servidor ou o padrão global) notifica. */
export type NotificationLevel = "ALL" | "MENTIONS" | "NONE";
export const NOTIFICATION_LEVELS: readonly NotificationLevel[] = ["ALL", "MENTIONS", "NONE"];

/**
 * Escopo canônico de uma preferência de notificação.
 *
 * É uma string ("global" | "guild:<id>" | "channel:<id>") e não um par de
 * colunas nuláveis porque no Postgres dois NULLs são distintos: um índice único
 * sobre (userId, guildId, channelId) deixaria passar duplicata do mesmo escopo.
 */
export type NotificationScope = string;
export const GLOBAL_NOTIFICATION_SCOPE = "global";
export function guildNotificationScope(guildId: string): NotificationScope {
  return `guild:${guildId}`;
}
export function channelNotificationScope(channelId: string): NotificationScope {
  return `channel:${channelId}`;
}

/**
 * Preferência de notificação de um escopo. `muted` é independente de `level`
 * (como no Discord): silenciar não apaga a escolha "só menções" por baixo.
 * `mutedUntil` null com `muted` true = silenciado "até eu reativar".
 */
export interface NotificationSetting {
  scope: NotificationScope;
  /** preenchido quando o escopo é um servidor. */
  guildId: string | null;
  /** preenchido quando o escopo é um canal (de servidor ou conversa). */
  channelId: string | null;
  level: NotificationLevel;
  muted: boolean;
  mutedUntil: string | null;
}

/** Durações do "silenciar por…" (minutos). `null` = até eu reativar. */
export const MUTE_PRESETS_MINUTES: readonly number[] = [15, 60, 8 * 60, 24 * 60];

/** true se o escopo está silenciado no instante `now`. */
export function isMuted(
  setting: Pick<NotificationSetting, "muted" | "mutedUntil"> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!setting?.muted) return false;
  if (!setting.mutedUntil) return true; // até eu reativar
  return new Date(setting.mutedUntil).getTime() > now;
}

/**
 * Nível efetivo de um canal: o mais específico ganha (canal > servidor >
 * padrão global) e qualquer escopo silenciado zera tudo — silenciar o servidor
 * cala os canais dele, como no Discord.
 */
export function effectiveNotificationLevel(
  channel: NotificationSetting | null | undefined,
  guild: NotificationSetting | null | undefined,
  global: NotificationSetting | null | undefined,
  now: number = Date.now(),
): NotificationLevel {
  if (isMuted(channel, now) || isMuted(guild, now)) return "NONE";
  return channel?.level ?? guild?.level ?? global?.level ?? "ALL";
}

/** Decide se uma mensagem que chegou deve virar notificação. */
export function shouldNotifyMessage(
  level: NotificationLevel,
  mention: boolean,
  doNotDisturb = false,
): boolean {
  if (doNotDisturb || level === "NONE") return false;
  return level === "ALL" || mention;
}

/** Corpo do `PATCH /me/notifications`. */
export const notificationSettingSchema = z
  .object({
    guildId: idSchema.nullish(),
    channelId: idSchema.nullish(),
    level: z.enum(["ALL", "MENTIONS", "NONE"]).optional(),
    muted: z.boolean().optional(),
    /** ISO; null limpa a expiração (silêncio "até eu reativar"). */
    mutedUntil: z.string().datetime().nullish(),
  })
  .refine((s) => !(s.guildId && s.channelId), {
    message: "Informe guildId ou channelId, nunca os dois",
  })
  .refine((s) => s.level !== undefined || s.muted !== undefined || s.mutedUntil !== undefined, {
    message: "Nada a alterar",
  });
export type NotificationSettingUpdate = z.infer<typeof notificationSettingSchema>;

/** Sessão ativa do usuário (contrato do agente I: `GET/DELETE /me/sessions`). */
export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  /** true para a sessão que está fazendo a requisição. */
  current: boolean;
  userAgent?: string;
}

// ── d-social ────────────────────────────────────────────────
// Amizades, bloqueio, status personalizado, perfil rico e o que é específico
// de grupo de DM. Tudo o que a API e o cliente trocam sobre "gente" (e não
// sobre "canal") mora nesta seção.

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
    case "SYSTEM_PIN":
      return `${autor} fixou uma mensagem neste canal.`;
    case "SYSTEM_JOIN":
      return `${autor} entrou no servidor.`;
    case "SYSTEM_MOD_NOTICE":
      // o texto do aviso da moderação já vem pronto no conteúdo
      return m.content;
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

// ── g-emojis-midia ───────────────────────────────────────────
// Emojis personalizados, figurinhas, GIFs e o que o composer precisa saber.

/** Tamanho máximo do arquivo de um emoji personalizado (bytes). */
export const MAX_CUSTOM_EMOJI_SIZE = 256 * 1024; // 256 KB
/** Lado máximo (px) da imagem de um emoji personalizado. */
export const MAX_CUSTOM_EMOJI_DIMENSION = 128;
/** Tamanho máximo do arquivo de uma figurinha (bytes). */
export const MAX_STICKER_SIZE = 512 * 1024; // 512 KB
/** Lado máximo (px) da imagem de uma figurinha. */
export const MAX_STICKER_DIMENSION = 320;
/** Emojis personalizados por servidor. */
export const MAX_EMOJIS_PER_GUILD = 50;
/** Figurinhas por servidor. */
export const MAX_STICKERS_PER_GUILD = 25;

/**
 * Nome de emoji/figurinha: o que cabe entre os dois-pontos de `:nome:`. Sem
 * maiúscula, acento nem espaço, como no Discord — o nome é chave de busca do
 * autocomplete e precisa ser digitável direto no composer.
 */
export const emojiNameSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .min(2, "Nome curto demais")
  .max(32, "Nome longo demais")
  .regex(/^[a-z0-9_]+$/, "Use só letras minúsculas, números e _");

export interface CustomEmoji {
  id: string;
  guildId: string;
  /** nome sem os dois-pontos (`festa`), único dentro do servidor. */
  name: string;
  /** GIF animado — o picker sinaliza; o render usa `<img>` nos dois casos. */
  animated: boolean;
  /** URL da imagem (`GET /emojis/:id/image`). */
  url: string;
  createdById: string;
}

/** Emojis de um servidor, do jeito que o seletor agrupa. */
export interface GuildEmojis {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  emojis: CustomEmoji[];
}

export interface Sticker {
  id: string;
  guildId: string;
  name: string;
  /** palavras-chave separadas por espaço, para a busca do seletor. */
  tags: string;
  /** URL da imagem (`GET /stickers/:id/image`). */
  url: string;
  createdById: string;
}

/** Figurinhas de um servidor, do jeito que o seletor agrupa. */
export interface GuildStickers {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  stickers: Sticker[];
}

/**
 * Forma interna de um emoji personalizado no texto da mensagem e no campo
 * `emoji` de uma reação: `<:nome:id>`. O usuário digita `:nome:` e o cliente
 * troca pela forma interna antes de enviar — assim o emoji continua resolvendo
 * depois de renomeado, e some de vez quando é apagado (o id é o que manda).
 */
export const CUSTOM_EMOJI_RE = /<:([a-z0-9_]{2,32}):([A-Za-z0-9_-]{1,64})>/;
/** Idem, global — para varrer um texto inteiro. */
export const CUSTOM_EMOJI_RE_G = new RegExp(CUSTOM_EMOJI_RE.source, "g");

/** Monta a forma interna `<:nome:id>`. */
export function formatCustomEmoji(name: string, id: string): string {
  return `<:${name}:${id}>`;
}

/** Lê `<:nome:id>`; devolve null se o texto não for exatamente um token. */
export function parseCustomEmoji(token: string): { name: string; id: string } | null {
  const m = token.match(new RegExp(`^${CUSTOM_EMOJI_RE.source}$`));
  return m ? { name: m[1], id: m[2] } : null;
}

/** true quando o texto inteiro é um emoji personalizado (usado em reação). */
export function isCustomEmoji(token: string): boolean {
  return parseCustomEmoji(token) !== null;
}

/**
 * `message.suppressEmbeds`: liga/desliga a prévia de link de uma mensagem.
 * Como toda escrita de mensagem, vai pelo gateway e volta em `message.updated`.
 */
export const suppressEmbedsSchema = z.object({
  messageId: idSchema,
  suppress: z.boolean({ required_error: "obrigatório" }),
});
export type SuppressEmbedsPayload = z.infer<typeof suppressEmbedsSchema>;

/** Evento de estrutura: a lista de emojis do servidor mudou. */
export interface EmojiUpdatedEvent {
  guildId: string;
  emojis: CustomEmoji[];
}

/** Evento de estrutura: a lista de figurinhas do servidor mudou. */
export interface StickerUpdatedEvent {
  guildId: string;
  stickers: Sticker[];
}

// ── Menções a todos (@everyone / @here) ──────────────────────
/** Menções que atingem mais de uma pessoa; só valem com permissão. */
export const MENCOES_GLOBAIS = ["everyone", "here"] as const;
export type MencaoGlobal = (typeof MENCOES_GLOBAIS)[number];

/**
 * true se o texto contém `@everyone` ou `@here` (limite de palavra).
 *
 * `\@everyone` **não** conta: a barra invertida é o mesmo escape que o markdown
 * já entende, e é o que o composer insere quando quem escreve não tem permissão
 * de mencionar todos. Sem esta exceção a menção seguiria valendo para "não
 * lido" e notificação mesmo depois de virar texto puro na tela.
 */
export function mentionsEveryone(content: string): boolean {
  return /(^|[^\w.\\])@(everyone|here)(?![\w.-])/i.test(content);
}

// ── GIFs (Tenor v2) ──────────────────────────────────────────
/** Um GIF do provedor de busca, reduzido ao que a interface usa. */
export interface GifResult {
  id: string;
  /** URL do GIF em tamanho de envio. */
  url: string;
  /** URL da miniatura do grid do seletor. */
  previewUrl: string;
  description: string;
  width: number;
  height: number;
}

/** Categoria sugerida enquanto ainda não se buscou nada. */
export interface GifCategory {
  name: string;
  previewUrl: string;
  /** termo que o clique joga na busca. */
  searchTerm: string;
}

/**
 * Resposta das rotas de GIF. `configured: false` quando falta `TENOR_API_KEY` —
 * a interface mostra "GIFs não configurados" em vez de um erro, espelhando o
 * tratamento de credencial ausente do LiveKit e do R2.
 */
export interface GifSearchResponse {
  configured: boolean;
  results: GifResult[];
}

export interface GifCategoriesResponse {
  configured: boolean;
  categories: GifCategory[];
}

/** Corpo de `POST /uploads/external`: anexo por URL (GIF do provedor). */
export const externalAttachmentSchema = z.object({
  url: z.string().url("URL inválida").max(1024),
  filename: z.string().min(1).max(200),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
});
export type ExternalAttachmentInput = z.infer<typeof externalAttachmentSchema>;

// ── Comandos de barra (`/`) ──────────────────────────────────
/** O que um comando `/` faz com o texto que o segue. */
export type ComandoBarraTipo =
  /** acrescenta um sufixo fixo ao texto (/shrug, /tableflip, /unflip) */
  | "texto"
  /** envia como ação, em itálico (/me) */
  | "acao"
  /** envolve tudo em ||spoiler|| (/spoiler) */
  | "spoiler"
  /** abre o seletor de GIF já com o termo digitado (/giphy) */
  | "gif"
  /** muda o apelido no servidor (/nick) — depende do agente de cargos */
  | "apelido";

export interface ComandoBarra {
  nome: string;
  descricao: string;
  tipo: ComandoBarraTipo;
  /** rótulo do argumento no autocomplete ("mensagem", "termo"…). */
  argumento?: string;
}

/** Comandos do composer, na ordem em que o autocomplete os mostra. */
export const COMANDOS_BARRA: readonly ComandoBarra[] = [
  { nome: "shrug", descricao: "Acrescenta ¯\\_(ツ)_/¯ à mensagem", tipo: "texto", argumento: "mensagem" },
  { nome: "tableflip", descricao: "Acrescenta (╯°□°)╯︵ ┻━┻ à mensagem", tipo: "texto", argumento: "mensagem" },
  { nome: "unflip", descricao: "Acrescenta ┬─┬ ノ( ゜-゜ノ) à mensagem", tipo: "texto", argumento: "mensagem" },
  { nome: "me", descricao: "Envia a mensagem como ação, em itálico", tipo: "acao", argumento: "mensagem" },
  { nome: "spoiler", descricao: "Marca a mensagem inteira como spoiler", tipo: "spoiler", argumento: "mensagem" },
  { nome: "giphy", descricao: "Procura um GIF para enviar", tipo: "gif", argumento: "termo" },
  { nome: "nick", descricao: "Muda seu apelido neste servidor", tipo: "apelido", argumento: "apelido" },
];

/** Sufixo de cada comando que só acrescenta texto. */
export const SUFIXOS_COMANDO: Record<string, string> = {
  shrug: "¯\\_(ツ)_/¯",
  tableflip: "(╯°□°)╯︵ ┻━┻",
  unflip: "┬─┬ ノ( ゜-゜ノ)",
};

/** Prefixo que marca um anexo como spoiler (o Discord usa o mesmo). */
export const SPOILER_PREFIX = "SPOILER_";

/** true se o anexo deve entrar borrado (nome começa com `SPOILER_`). */
export function isSpoilerAttachment(a: Pick<Attachment, "filename">): boolean {
  return a.filename.startsWith(SPOILER_PREFIX);
}

/** Nome do anexo sem o prefixo de spoiler, para mostrar na tela. */
export function attachmentDisplayName(a: Pick<Attachment, "filename">): string {
  return isSpoilerAttachment(a) ? a.filename.slice(SPOILER_PREFIX.length) : a.filename;
}

// ── Classificação de mídia (o que o cliente sabe tocar/mostrar) ──
export function isVideoAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType.startsWith("video/");
}

export function isAudioAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType.startsWith("audio/");
}

export function isPdfAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType === "application/pdf";
}

/**
 * Quebra uma URL http(s) em host, caminho e query, sem `URL` — o contrato é
 * compilado com `lib: ES2022` (sem DOM), onde `URL` não existe como tipo, e
 * este pacote roda nos dois lados. Devolve null se não for http(s).
 */
function partesDaUrl(url: string): { host: string; path: string; query: string } | null {
  const m = url.match(/^https?:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i);
  if (!m) return null;
  // fora o host, tudo é comparado como veio; só o host é normalizado
  return {
    host: m[1].toLowerCase().replace(/:\d+$/, "").replace(/^www\./, ""),
    path: m[2] || "/",
    query: m[3] ?? "",
  };
}

/** Valor de um parâmetro da query, ou string vazia. */
function paramDaQuery(query: string, nome: string): string {
  for (const par of query.split("&")) {
    const i = par.indexOf("=");
    if (i > 0 && decodeURIComponent(par.slice(0, i)) === nome) {
      return decodeURIComponent(par.slice(i + 1));
    }
  }
  return "";
}

/**
 * Id do vídeo do YouTube numa URL, ou null. É o que troca o card de prévia pelo
 * player embutido — o Discord toca o vídeo dentro da própria mensagem.
 */
export function youtubeVideoId(url: string): string | null {
  const u = partesDaUrl(url);
  if (!u) return null;
  const valido = (id: string) => (/^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);
  if (u.host === "youtu.be") return valido(u.path.slice(1));
  if (u.host !== "youtube.com" && u.host !== "m.youtube.com" && u.host !== "music.youtube.com") {
    return null;
  }
  if (u.path === "/watch") return valido(paramDaQuery(u.query, "v"));
  const m = u.path.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

/** true se a URL aponta direto para uma imagem (vira anexo visual, não card). */
export function isDirectImageUrl(url: string): boolean {
  const u = partesDaUrl(url);
  return !!u && /\.(png|jpe?g|gif|webp|avif)$/i.test(u.path);
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
// ── i-conta ──────────────────────────────────────────────────
// Conta e segurança: e-mail, senha, 2FA (TOTP), sessões, exclusão e OAuth.
// Tudo o que a API e a web precisam falar sobre "a minha conta" mora aqui.

/**
 * Regras de senha: só comprimento. Não há medidor de força nem lista de senhas
 * óbvias — a única recusa é a de tamanho, igual na tela e na API.
 */
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

/** Teto do e-mail: o que a RFC 5321 permite no caminho de retorno. */
export const MAX_EMAIL_LENGTH = 254;

/** Mensagem de recusa de uma senha nova, ou `null` quando ela serve. */
export function validarSenhaNova(senha: string): string | null {
  if (senha.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (senha.length > MAX_PASSWORD_LENGTH) {
    return `A senha precisa ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

/** E-mail normalizado: sem espaços nas pontas e em minúsculas (o índice é único). */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

const emailSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .trim()
  .max(MAX_EMAIL_LENGTH, `E-mail acima de ${MAX_EMAIL_LENGTH} caracteres`)
  .email("E-mail inválido");

const usuarioSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .min(3, "O usuário precisa de ao menos 3 caracteres")
  .max(32, "O usuário precisa de no máximo 32 caracteres")
  .regex(/^[a-zA-Z0-9_.-]+$/, "O usuário aceita apenas letras, números, _ . e -");

const senhaNovaSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .max(MAX_PASSWORD_LENGTH)
  .superRefine((senha, ctx) => {
    const problema = validarSenhaNova(senha);
    if (problema) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problema });
  });

/** Registro: e-mail + usuário + senha. */
export const contaRegistroSchema = z.object({
  email: emailSchema,
  username: usuarioSchema,
  password: senhaNovaSchema,
});
export type ContaRegistroInput = z.infer<typeof contaRegistroSchema>;

/** Login por **e-mail ou usuário** — um campo só, como no Discord. */
export const contaLoginSchema = z.object({
  identificador: z
    .string({ required_error: "obrigatório" })
    .trim()
    .min(3, "Informe seu e-mail ou usuário")
    .max(MAX_EMAIL_LENGTH),
  password: z.string({ required_error: "obrigatório" }).min(1, "Informe sua senha"),
});
export type ContaLoginInput = z.infer<typeof contaLoginSchema>;

/** true quando o texto digitado no login parece um e-mail (e não um usuário). */
export function pareceEmail(identificador: string): boolean {
  return identificador.includes("@");
}

/** Sessão criada: usuário + par de tokens. */
export interface AuthSession {
  user: PublicUser;
  tokens: AuthTokens;
}

/**
 * Desafio de 2FA: o login parou no primeiro fator. O `ticket` é de curta
 * duração e só serve para `POST /auth/mfa` — nunca autentica nada sozinho.
 */
export interface MfaDesafio {
  mfaRequired: true;
  ticket: string;
}

/** `POST /auth/login` devolve a sessão **ou** o desafio de 2FA. */
export type LoginResult = AuthSession | MfaDesafio;

/** Estreita `LoginResult` para o ramo do desafio. */
export function exigeMfa(r: LoginResult): r is MfaDesafio {
  return (r as MfaDesafio).mfaRequired === true;
}

/** A minha conta (`GET /me/account`) — o que só o dono enxerga. */
export interface MinhaConta {
  id: string;
  username: string;
  displayName: string | null;
  /** null em conta antiga, criada antes de o e-mail existir. */
  email: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  /** quantos códigos de recuperação ainda não foram usados. */
  recoveryCodesLeft: number;
  createdAt: string;
  /** provedores OAuth já vinculados. */
  linkedProviders: OAuthProvider[];
}

/**
 * Uma sessão ativa (refresh token vivo) — contrato de `GET /me/sessions`.
 *
 * Os três campos do dispositivo são **opcionais e nunca `null`**: a aba de
 * configurações declara a mesma sessão com `userAgent?: string`, e um `null`
 * aqui deixaria de ser atribuível lá. Ausente = desconhecido (sessão criada
 * antes de a coluna existir, ou requisição sem `User-Agent`).
 */
export interface SessaoView {
  id: string;
  /** true na sessão que fez a requisição. */
  current: boolean;
  userAgent?: string;
  ip?: string;
  createdAt: string;
  /** último uso do refresh token (ausente = nunca renovou desde o login). */
  lastUsedAt?: string;
  expiresAt: string;
}

/** Quantos códigos de recuperação são gerados ao ativar o 2FA. */
export const RECOVERY_CODE_COUNT = 10;

/** Tamanho (em caracteres, sem o hífen) de um código de recuperação. */
export const RECOVERY_CODE_LENGTH = 10;

/** Passo do TOTP em segundos e nº de dígitos — o padrão que os apps assumem. */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** Início da ativação de 2FA (`POST /me/mfa/setup`). */
export interface MfaSetup {
  /** segredo em base32, para digitar à mão no app autenticador. */
  secret: string;
  /** `otpauth://` — o conteúdo do QR. */
  otpauthUrl: string;
  /** QR pronto para `<img src>` (data URL PNG). */
  qrDataUrl: string;
}

/** Ativação confirmada: os códigos de recuperação só aparecem aqui, uma vez. */
export interface MfaAtivado {
  recoveryCodes: string[];
}

/** true se o texto tem cara de código TOTP (6 dígitos). */
export function pareceCodigoTotp(codigo: string): boolean {
  return new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(codigo.replace(/\s/g, ""));
}

/** Normaliza o que o usuário digita: sem espaços/hífens, em maiúsculas. */
export function normalizarCodigoMfa(codigo: string): string {
  return codigo.replace(/[\s-]/g, "").toUpperCase();
}

export const OAUTH_PROVIDERS = ["google", "github", "discord"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Um provedor social na tela de login: só clicável quando configurado. */
export interface OAuthProviderInfo {
  provider: OAuthProvider;
  label: string;
  /** false = faltam `OAUTH_<PROVIDER>_CLIENT_ID/SECRET` no ambiente. */
  configured: boolean;
  /** para onde mandar o navegador; null quando não configurado. */
  authorizeUrl: string | null;
}

/** Resultado de `POST /me/delete` e `POST /me/disable`. */
export interface ContaEncerrada {
  /** "deleted" = anonimizada e sem volta; "disabled" = volta ao entrar de novo. */
  outcome: "deleted" | "disabled";
}

/** Username que sobra no lugar de quem excluiu a conta. */
export const USUARIO_EXCLUIDO_PREFIXO = "usuario_excluido_";

/** Nome mostrado no lugar de quem excluiu a conta. */
export const NOME_USUARIO_EXCLUIDO = "Usuário excluído";

/** Evento na sala `user:<id>`: algo mudou na conta (e-mail verificado, 2FA…). */
export interface AccountUpdatedEvent {
  account: MinhaConta;
}

/**
 * Evento na sala `user:<id>`: sessões foram encerradas. Quem estiver com um dos
 * `sessionIds` (ou `all`) precisa cair para o login — sem isso a aba continuaria
 * viva até o access token vencer.
 */
export interface SessionsRevokedEvent {
  /** true = todas as outras sessões do usuário. */
  all: boolean;
  sessionIds: string[];
  motivo: "senha" | "logout" | "mfa" | "conta";
}

// ── i-conta · payloads das rotas de conta e segurança ────────
// A API valida estes schemas na borda (`ZodValidationPipe`) e a web usa os
// mesmos para recusar antes do round-trip. Uma regra, um lugar.

/** Falhas de login seguidas que trancam a conta, e por quanto tempo. */
export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;

/** Validade dos links enviados por e-mail. */
export const EMAIL_VERIFY_TTL_HOURS = 24;
export const PASSWORD_RESET_TTL_HOURS = 1;

const tokenDeEmailSchema = z
  .string({ required_error: "obrigatório" })
  .trim()
  .min(16, "Link inválido ou incompleto")
  .max(200);

/** Código do app autenticador **ou** código de recuperação — um campo só. */
const codigoMfaSchema = z
  .string({ required_error: "obrigatório" })
  .trim()
  .min(TOTP_DIGITS, "Informe o código de 6 dígitos")
  .max(32);

const senhaAtualSchema = z
  .string({ required_error: "obrigatório" })
  .min(1, "Informe sua senha atual")
  .max(MAX_PASSWORD_LENGTH);

/** `POST /auth/verify-email` — o token que veio no link. */
export const verificarEmailSchema = z.object({ token: tokenDeEmailSchema });
export type VerificarEmailInput = z.infer<typeof verificarEmailSchema>;

/** `POST /auth/resend-verification` e `POST /auth/forgot-password`. */
export const pedidoPorEmailSchema = z.object({ email: emailSchema });
export type PedidoPorEmailInput = z.infer<typeof pedidoPorEmailSchema>;

/** `POST /auth/reset-password` — token do link + senha nova. */
export const redefinirSenhaSchema = z.object({
  token: tokenDeEmailSchema,
  password: senhaNovaSchema,
});
export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;

/** `POST /auth/mfa` — fecha o login que parou no desafio de 2FA. */
export const mfaLoginSchema = z.object({
  ticket: z.string({ required_error: "obrigatório" }).min(16, "Desafio inválido").max(4096),
  code: codigoMfaSchema,
});
export type MfaLoginInput = z.infer<typeof mfaLoginSchema>;

/** `POST /me/mfa/enable` — confirma que o app autenticador já lê o segredo. */
export const mfaAtivarSchema = z.object({ code: codigoMfaSchema });
export type MfaAtivarInput = z.infer<typeof mfaAtivarSchema>;

/** `POST /me/mfa/disable` — desligar 2FA exige senha **e** código. */
export const mfaDesativarSchema = z.object({
  password: senhaAtualSchema,
  code: codigoMfaSchema,
});
export type MfaDesativarInput = z.infer<typeof mfaDesativarSchema>;

/** `PATCH /me/password`. */
export const alterarSenhaSchema = z
  .object({ currentPassword: senhaAtualSchema, newPassword: senhaNovaSchema })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "A nova senha precisa ser diferente da atual.",
    path: ["newPassword"],
  });
export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>;

/** `PATCH /me/email` — trocar o e-mail pede a senha (evita sequestro de aba). */
export const alterarEmailSchema = z.object({
  email: emailSchema,
  password: senhaAtualSchema,
});
export type AlterarEmailInput = z.infer<typeof alterarEmailSchema>;

/** `DELETE /me` — exclusão pede senha e, com 2FA ligado, o código. */
export const excluirContaSchema = z.object({
  password: senhaAtualSchema,
  code: codigoMfaSchema.optional(),
});
export type ExcluirContaInput = z.infer<typeof excluirContaSchema>;

/** Resposta das rotas que só confirmam que algo foi feito. */
export interface ContaOk {
  ok: true;
}

/** `POST /auth/verify-email`: o e-mail confirmado, para a tela dizer qual foi. */
export interface EmailVerificado {
  email: string;
  /** já estava verificado (o usuário clicou no link duas vezes). */
  alreadyVerified: boolean;
}

/**
 * Estado do envio de e-mail (`GET /me/account` embute; a UI usa para explicar).
 * Sem SMTP a API responde 503 nas rotas que dependem de e-mail — menos em dev,
 * onde o provedor `console` imprime o link no log e o fluxo roda inteiro.
 */
export type ProvedorDeEmail = "smtp" | "console";

/**
 * "Chrome · Windows" a partir do `User-Agent` de uma sessão.
 *
 * Fica no contrato porque é a leitura de um campo do contrato: o usuário precisa
 * reconhecer o aparelho para decidir se encerra a sessão, e a string crua não
 * serve para isso. A ordem dos testes importa — Edge e Opera se anunciam como
 * Chrome, e o Chrome se anuncia como Safari. Quem casa primeiro vence.
 */
export function resumoDoDispositivo(userAgent: string | null | undefined): string {
  if (!userAgent) return "Dispositivo desconhecido";
  if (/Streamz(Desktop)?|Tauri|Electron/i.test(userAgent)) return "App do Streamz";
  return `${navegadorDe(userAgent)} · ${sistemaDe(userAgent)}`;
}

function navegadorDe(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Navegador";
}

function sistemaDe(ua: string): string {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Sistema desconhecido";
}

/** true quando o `User-Agent` é de celular/tablet (a tela troca o ícone). */
export function ehDispositivoMovel(userAgent: string | null | undefined): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent ?? "");
}
