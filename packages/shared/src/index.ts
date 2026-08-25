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
export type ChannelType = "TEXT" | "VOICE";
export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export interface PublicUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: UserStatus;
}

export interface Guild {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
}

export interface Channel {
  id: string;
  guildId: string;
  name: string;
  type: ChannelType;
  position: number;
  private: boolean;
  readOnly: boolean;
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

export interface DMChannelView {
  id: string;
  isGroup: boolean;
  /** nome do grupo (null em DMs 1-a-1). */
  name: string | null;
  /** participantes exceto o próprio usuário. */
  others: PublicUser[];
}

export interface DirectMessage {
  id: string;
  dmChannelId: string;
  author: PublicUser;
  content: string;
  createdAt: string;
  editedAt: string | null;
}

export interface DMCreatePayload {
  dmChannelId: string;
  content: string;
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
  DM_CREATE: "dm.create",
  // servidor → cliente
  MESSAGE_NEW: "message.new",
  MESSAGE_UPDATED: "message.updated",
  MESSAGE_DELETED: "message.deleted",
  PRESENCE_UPDATE: "presence.update",
  DM_NEW: "dm.new",
  GUILD_REMOVED: "guild.removed",
} as const;

export interface MessageCreatePayload {
  channelId: string;
  content: string;
  /** quando presente, cria a mensagem como resposta na thread desse id. */
  parentId?: string;
  /** ids de anexos já enviados (POST /uploads) a vincular nesta mensagem. */
  attachmentIds?: string[];
  /**
   * Identificador efêmero gerado pelo cliente. O servidor devolve o mesmo valor
   * em `message.new` para que o autor substitua a mensagem otimista pela real.
   */
  nonce?: string;
}

export interface MessageEditPayload {
  messageId: string;
  content: string;
}

export interface MessageDeletePayload {
  messageId: string;
}

export interface ReactionPayload {
  messageId: string;
  emoji: string;
}

export interface MessageDeletedEvent {
  messageId: string;
  channelId: string;
  /** id da mensagem raiz, se a apagada era uma resposta de thread. */
  parentId: string | null;
}

export interface TypingPayload {
  channelId: string;
}

export interface PresenceUpdatePayload {
  userId: string;
  status: UserStatus;
}

/** Emitido ao usuário que foi expulso/banido de um servidor. */
export interface GuildRemovedEvent {
  guildId: string;
  reason: "kicked" | "banned";
}

// ── Voz (LiveKit) ────────────────────────────────────────────
export interface VoiceTokenResponse {
  token: string;
  url: string;
  room: string;
}
