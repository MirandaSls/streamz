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

/**
 * true se o texto menciona `@username` (limite de palavra dos dois lados) ou
 * atinge todo mundo com `@everyone`/`@here` — que também é menção a mim, senão
 * o aviso do Discord que mais importa seria o único a não contar. Quem não tem
 * permissão para mencionar todos não chega a enviar a menção: o cliente manda
 * texto puro (ver `mentionsEveryone`, na seção g-emojis-midia).
 */
export function mentionsUser(content: string, username: string): boolean {
  const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|[^\\w.])@${esc}(?![\\w.-])`, "i").test(content)) return true;
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
  // ── g-emojis-midia ──
  /** cliente → servidor: liga/desliga a prévia de link de uma mensagem. */
  MESSAGE_SUPPRESS_EMBEDS: "message.suppressEmbeds",
  /** servidor → cliente: a lista de emojis personalizados do servidor mudou. */
  EMOJI_UPDATED: "emoji.updated",
  /** servidor → cliente: a lista de figurinhas do servidor mudou. */
  STICKER_UPDATED: "sticker.updated",
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

/** true se o texto contém `@everyone` ou `@here` (limite de palavra). */
export function mentionsEveryone(content: string): boolean {
  return /(^|[^\w.])@(everyone|here)(?![\w.-])/i.test(content);
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
