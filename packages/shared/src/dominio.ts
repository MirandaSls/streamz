// Tipos de domínio: usuário, servidor, canal, mensagem e os enums do banco.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

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
