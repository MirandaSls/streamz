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
  /** ids dos cargos atribuídos (sem o @everyone, que vale para todos). */
  roleIds: string[];
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
  /** cargos do membro depois da mudança (ausente = só o papel mudou). */
  roleIds?: string[];
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
