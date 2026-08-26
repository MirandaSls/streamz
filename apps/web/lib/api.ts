import type {
  Attachment,
  AuthTokens,
  Category,
  Channel,
  ChannelOverride,
  ChannelOverrideInput,
  GuildReadResult,
  DMChannelView,
  DMLeaveResult,
  Guild,
  GuildChannelType,
  GuildMemberView,
  GuildWithChannels,
  InboxMention,
  InboxUnreadGroup,
  InviteInfo,
  InvitePreview,
  CallStartResponse,
  LinkEmbed,
  MemberPermissions,
  ReorderPayload,
  MemberRole,
  Message,
  PinnedMessage,
  PublicUser,
  Role,
  RoleInput,
  ThreadView,
  UserStatus,
  VoiceStateEvent,
} from "@newdisc/shared";
import { API_URL } from "./config";
import { ApiError } from "./api-error";
import { getAccessToken, renovarTokens } from "./session";

export { ApiError, isApiError } from "./api-error";

/** Rotas que não devem disparar refresh: um 401 nelas é credencial errada. */
const ROTAS_SEM_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

function cabecalhoAuth(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function enviar(path: string, init: RequestInit | undefined, token: string | null) {
  return fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      // FormData define o próprio Content-Type (com boundary) — não sobrescreve
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...cabecalhoAuth(token),
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Faz a requisição autenticada e, em 401, renova o token uma única vez antes de
 * repetir. O refresh é single-flight (`session.ts`): várias requisições que
 * caem em 401 ao mesmo tempo esperam a mesma renovação em vez de rotacionar o
 * refresh token em paralelo e derrubar a sessão.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await enviar(path, init, await getAccessToken());

  if (res.status === 401 && !ROTAS_SEM_REFRESH.some((r) => path.startsWith(r))) {
    const tokens = await renovarTokens().catch(() => null);
    // refresh recusado já encerrou a sessão e redirecionou (session.ts)
    if (tokens) res = await enviar(path, init, tokens.accessToken);
  }

  if (!res.ok) throw await comoApiError(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Mensagem da API quando houver; senão, algo legível com o status. */
async function comoApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as { message?: unknown };
  const message =
    typeof body.message === "string"
      ? body.message
      : Array.isArray(body.message) && typeof body.message[0] === "string"
        ? body.message[0]
        : `Erro ${res.status}`;
  return new ApiError(res.status, message);
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const patch = (body: unknown): RequestInit => ({ method: "PATCH", body: JSON.stringify(body) });

export const api = {
  // ── auth ──
  register: (username: string, password: string) =>
    request<{ user: PublicUser; tokens: AuthTokens }>("/auth/register", json({ username, password })),
  login: (username: string, password: string) =>
    request<{ user: PublicUser; tokens: AuthTokens }>("/auth/login", json({ username, password })),
  logout: (refreshToken: string) => request<{ ok: true }>("/auth/logout", json({ refreshToken })),

  // ── eu / usuários ──
  me: () => request<PublicUser>("/users/me"),
  updateProfile: (displayName: string | null) =>
    request<PublicUser>("/users/me", patch({ displayName })),
  updateStatus: (manualStatus: UserStatus | null) =>
    request<PublicUser>("/users/me/status", patch({ manualStatus })),
  updateAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<PublicUser>("/users/me/avatar", { method: "POST", body: form });
  },
  searchUsers: (q: string) => request<PublicUser[]>(`/users/search?q=${encodeURIComponent(q)}`),

  // ── servidores ──
  listGuilds: () => request<Guild[]>("/guilds"),
  createGuild: (name: string) => request<GuildWithChannels>("/guilds", json({ name })),
  getGuild: (id: string) => request<GuildWithChannels>(`/guilds/${id}`),
  leaveGuild: (id: string) => request<{ left: string }>(`/guilds/${id}/leave`, { method: "POST" }),
  deleteGuild: (id: string) => request<{ deleted: string }>(`/guilds/${id}`, { method: "DELETE" }),
  members: (guildId: string) => request<GuildMemberView[]>(`/guilds/${guildId}/members`),
  setRole: (guildId: string, userId: string, role: Extract<MemberRole, "ADMIN" | "MEMBER">) =>
    request<{ userId: string; role: MemberRole }>(`/guilds/${guildId}/members/${userId}/role`, patch({ role })),
  kickMember: (guildId: string, userId: string) =>
    request<{ kicked: string }>(`/guilds/${guildId}/kick`, json({ userId })),
  banMember: (guildId: string, userId: string, reason?: string) =>
    request<{ banned: string }>(`/guilds/${guildId}/ban`, json({ userId, reason })),
  listBans: (guildId: string) =>
    request<{ user: PublicUser; reason: string | null; createdAt: string }[]>(
      `/guilds/${guildId}/bans`,
    ),
  unbanMember: (guildId: string, userId: string) =>
    request<{ unbanned: string }>(`/guilds/${guildId}/bans/${userId}`, { method: "DELETE" }),

  // ── configurações do servidor (c-cargos) ──
  updateGuild: (guildId: string, body: { name?: string; description?: string | null }) =>
    request<Guild>(`/guilds/${guildId}`, patch(body)),
  updateGuildIcon: (guildId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Guild>(`/guilds/${guildId}/icon`, { method: "POST", body: form });
  },
  transferGuild: (guildId: string, userId: string) =>
    request<{ guildId: string; ownerId: string }>(`/guilds/${guildId}/transfer`, json({ userId })),

  // ── cargos e permissões (c-cargos) ──
  listRoles: (guildId: string) => request<Role[]>(`/guilds/${guildId}/roles`),
  createRole: (guildId: string, body: RoleInput) =>
    request<Role>(`/guilds/${guildId}/roles`, json(body)),
  updateRole: (guildId: string, roleId: string, body: RoleInput) =>
    request<Role>(`/guilds/${guildId}/roles/${roleId}`, patch(body)),
  deleteRole: (guildId: string, roleId: string) =>
    request<{ deleted: string }>(`/guilds/${guildId}/roles/${roleId}`, { method: "DELETE" }),
  reorderRoles: (guildId: string, roleIds: string[]) =>
    request<Role[]>(`/guilds/${guildId}/roles/order`, patch({ roleIds })),
  assignRole: (guildId: string, userId: string, roleId: string) =>
    request<{ userId: string; roleIds: string[] }>(
      `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      { method: "PUT" },
    ),
  unassignRole: (guildId: string, userId: string, roleId: string) =>
    request<{ userId: string; roleIds: string[] }>(
      `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      { method: "DELETE" },
    ),
  memberPermissions: (guildId: string, userId: string) =>
    request<MemberPermissions>(`/guilds/${guildId}/members/${userId}/permissions`),
  guildOverrides: (guildId: string) =>
    request<ChannelOverride[]>(`/guilds/${guildId}/overrides`),
  channelOverrides: (guildId: string, channelId: string) =>
    request<ChannelOverride[]>(`/guilds/${guildId}/channels/${channelId}/overrides`),
  setChannelOverride: (guildId: string, channelId: string, body: ChannelOverrideInput) =>
    request<ChannelOverride[]>(`/guilds/${guildId}/channels/${channelId}/overrides`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  removeChannelOverride: (guildId: string, channelId: string, targetId: string) =>
    request<ChannelOverride[]>(
      `/guilds/${guildId}/channels/${channelId}/overrides/${targetId}`,
      { method: "DELETE" },
    ),

  // ── convites ──
  createInvite: (guildId: string, opts?: { maxUses?: number; expiresInHours?: number }) =>
    request<InviteInfo>(`/guilds/${guildId}/invites`, json(opts ?? {})),
  listInvites: (guildId: string) =>
    request<(InviteInfo & { creatorId: string })[]>(`/guilds/${guildId}/invites`),
  revokeInvite: (guildId: string, code: string) =>
    request<{ revoked: string }>(`/guilds/${guildId}/invites/${code}`, { method: "DELETE" }),
  previewInvite: (code: string) => request<InvitePreview>(`/invites/${code}`),
  redeemInvite: (code: string) =>
    request<{ id: string; name: string }>(`/invites/${code}/redeem`, { method: "POST" }),

  // ── canais de servidor ──
  createChannel: (
    guildId: string,
    name: string,
    type: GuildChannelType,
    opts?: {
      isPrivate?: boolean;
      readOnly?: boolean;
      memberIds?: string[];
      categoryId?: string | null;
    },
  ) => request<Channel>(`/guilds/${guildId}/channels`, json({ name, type, ...opts })),
  updateChannel: (
    guildId: string,
    channelId: string,
    body: {
      name?: string;
      readOnly?: boolean;
      topic?: string | null;
      slowmodeSeconds?: number;
      nsfw?: boolean;
      isPrivate?: boolean;
      categoryId?: string | null;
    },
  ) => request<Channel>(`/guilds/${guildId}/channels/${channelId}`, patch(body)),
  /** Reordenação em lote de canais e categorias (arrastar-e-soltar). */
  reorderChannels: (guildId: string, body: ReorderPayload) =>
    request<{ channels: Channel[]; categories: Category[] }>(
      `/guilds/${guildId}/channels/positions`,
      patch(body),
    ),
  deleteChannel: (guildId: string, channelId: string) =>
    request<{ deleted: string }>(`/guilds/${guildId}/channels/${channelId}`, { method: "DELETE" }),
  channelMembers: (guildId: string, channelId: string) =>
    request<{ user: PublicUser }[]>(`/guilds/${guildId}/channels/${channelId}/members`),
  addChannelMember: (guildId: string, channelId: string, userId: string) =>
    request<{ added: string }>(`/guilds/${guildId}/channels/${channelId}/members`, json({ userId })),
  removeChannelMember: (guildId: string, channelId: string, userId: string) =>
    request<{ removed: string }>(`/guilds/${guildId}/channels/${channelId}/members/${userId}`, {
      method: "DELETE",
    }),

  // ── categorias de canais (b-canais) ──
  listCategories: (guildId: string) => request<Category[]>(`/guilds/${guildId}/categories`),
  createCategory: (guildId: string, name: string) =>
    request<Category>(`/guilds/${guildId}/categories`, json({ name })),
  renameCategory: (guildId: string, categoryId: string, name: string) =>
    request<Category>(`/guilds/${guildId}/categories/${categoryId}`, patch({ name })),
  deleteCategory: (guildId: string, categoryId: string) =>
    request<{ deleted: string; released: number }>(`/guilds/${guildId}/categories/${categoryId}`, {
      method: "DELETE",
    }),
  /** Marca todos os canais visíveis do servidor como lidos. */
  markGuildRead: (guildId: string) =>
    request<GuildReadResult>(`/guilds/${guildId}/read`, { method: "POST" }),

  // ── conversas diretas (canais sem servidor — ADR-0001) ──
  openDM: (userId: string) => request<DMChannelView>(`/dms`, json({ userId })),
  createGroupDM: (userIds: string[], name?: string) =>
    request<DMChannelView>(`/dms/group`, json({ userIds, name })),
  listDMs: () => request<DMChannelView[]>(`/dms`),
  getDM: (channelId: string) => request<DMChannelView>(`/dms/${channelId}`),
  leaveGroupDM: (channelId: string) =>
    request<DMLeaveResult>(`/dms/${channelId}/leave`, { method: "POST" }),

  // ── mensagens (qualquer canal) ──
  history: (channelId: string, cursor?: string) =>
    request<Message[]>(`/channels/${channelId}/messages${cursor ? `?cursor=${cursor}` : ""}`),
  searchMessages: (channelId: string, q: string) =>
    request<Message[]>(`/channels/${channelId}/messages/search?q=${encodeURIComponent(q)}`),
  thread: (channelId: string, messageId: string) =>
    request<Message[]>(`/channels/${channelId}/messages/${messageId}/thread`),
  markRead: (channelId: string) =>
    request<{ channelId: string; lastReadAt: string }>(`/channels/${channelId}/read`, { method: "POST" }),

  // ── embeds ──
  embed: (url: string) => request<LinkEmbed | null>(`/embeds?url=${encodeURIComponent(url)}`),

  // ── voz ──
  voiceToken: (channelId: string) =>
    request<{ token: string; url: string; room: string }>(`/voice/channels/${channelId}/token`, {
      method: "POST",
    }),
  /** Estado inicial de voz do servidor; depois disso os `voice.state` mantêm em dia. */
  guildVoiceStates: (guildId: string) => request<VoiceStateEvent[]>(`/guilds/${guildId}/voice-states`),
  /** Começa (ou entra n)uma chamada de conversa direta; devolve o token de mídia, se houver. */
  startCall: (channelId: string) =>
    request<CallStartResponse>(`/dms/${channelId}/call`, { method: "POST" }),

  // ── a-mensagens ──
  /** Janela de mensagens em volta de uma (o "ir para a mensagem"). */
  around: (channelId: string, messageId: string) =>
    request<Message[]>(`/channels/${channelId}/messages/around/${messageId}`),
  /** Busca no servidor inteiro, com os mesmos filtros da busca do canal. */
  searchGuild: (guildId: string, q: string) =>
    request<Message[]>(`/guilds/${guildId}/messages/search?q=${encodeURIComponent(q)}`),

  pins: (channelId: string) => request<PinnedMessage[]>(`/channels/${channelId}/pins`),
  pinMessage: (channelId: string, messageId: string) =>
    request<PinnedMessage>(`/channels/${channelId}/pins/${messageId}`, { method: "POST" }),
  unpinMessage: (channelId: string, messageId: string) =>
    request<{ messageId: string }>(`/channels/${channelId}/pins/${messageId}`, { method: "DELETE" }),

  threads: (channelId: string, archived?: boolean) =>
    request<ThreadView[]>(
      `/channels/${channelId}/threads${archived === undefined ? "" : `?archived=${archived}`}`,
    ),
  createThread: (channelId: string, messageId: string, name: string) =>
    request<ThreadView>(`/channels/${channelId}/threads`, json({ messageId, name })),
  updateThread: (channelId: string, threadId: string, body: { name?: string; archived?: boolean }) =>
    request<ThreadView>(`/channels/${channelId}/threads/${threadId}`, patch(body)),

  inboxMentions: (limit?: number) =>
    request<InboxMention[]>(`/me/mentions${limit ? `?limit=${limit}` : ""}`),
  inboxUnread: () => request<InboxUnreadGroup[]>("/me/unread"),
  markAllRead: () => request<{ channels: number }>("/me/read-all", { method: "POST" }),

  /** Envia um arquivo e devolve o anexo (a vincular numa mensagem no envio). */
  uploadFile: (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    return request<Attachment>("/uploads", { method: "POST", body: form });
  },
};
