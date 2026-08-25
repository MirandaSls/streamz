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

// ── f-voz ────────────────────────────────────────────────────
/**
 * Estado de voz de um usuário num canal, do jeito que o gateway transmite.
 *
 * Vale tanto para canal de voz de servidor (`guildId` preenchido) quanto para
 * chamada em conversa direta (`guildId` null) — a "sala" é sempre um canal, na
 * mesma linha da ADR-0001. `connected: false` é a saída: o cliente remove o
 * participante em vez de manter um estado zumbi.
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
