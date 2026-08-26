import type {
  Attachment,
  AuthTokens,
  AuditAction,
  AuditLogPage,
  Channel,
  DiscoverableGuild,
  DMChannelView,
  DMLeaveResult,
  Guild,
  GuildChannelType,
  GuildMembership,
  GuildMemberView,
  GuildOnboarding,
  GuildOnboardingUpdate,
  GuildWithChannels,
  InviteDetail,
  InviteFullPreview,
  InviteInfo,
  InviteOptions,
  LinkEmbed,
  MemberRole,
  Message,
  PollVoters,
  PublicUser,
  ReportReason,
  ReportView,
  UserStatus,
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
const del = (body?: unknown): RequestInit =>
  body === undefined ? { method: "DELETE" } : { method: "DELETE", body: JSON.stringify(body) };

/** Query string a partir dos parâmetros preenchidos (ignora vazio/undefined). */
function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

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

  // ── convites ──
  createInvite: (guildId: string, opts?: InviteOptions) =>
    request<InviteInfo>(`/guilds/${guildId}/invites`, json(opts ?? {})),
  listInvites: (guildId: string) => request<InviteDetail[]>(`/guilds/${guildId}/invites`),
  revokeInvite: (guildId: string, code: string) =>
    request<{ revoked: string }>(`/guilds/${guildId}/invites/${code}`, { method: "DELETE" }),
  previewInvite: (code: string) => request<InviteFullPreview>(`/invites/${code}`),
  redeemInvite: (code: string) =>
    request<{ id: string; name: string }>(`/invites/${code}/redeem`, { method: "POST" }),

  // ── canais de servidor ──
  createChannel: (
    guildId: string,
    name: string,
    type: GuildChannelType,
    opts?: { isPrivate?: boolean; readOnly?: boolean; memberIds?: string[] },
  ) => request<Channel>(`/guilds/${guildId}/channels`, json({ name, type, ...opts })),
  updateChannel: (guildId: string, channelId: string, body: { name?: string; readOnly?: boolean }) =>
    request<Channel>(`/guilds/${guildId}/channels/${channelId}`, patch(body)),
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

  /** Envia um arquivo e devolve o anexo (a vincular numa mensagem no envio). */
  uploadFile: (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    return request<Attachment>("/uploads", { method: "POST", body: form });
  },

  // ── h-moderacao ──
  // registro de auditoria
  auditLog: (guildId: string, filters: { action?: AuditAction; userId?: string; cursor?: string } = {}) =>
    request<AuditLogPage>(
      `/guilds/${guildId}/audit-log${query({ action: filters.action, userId: filters.userId, cursor: filters.cursor })}`,
    ),

  // castigo
  timeoutMember: (guildId: string, userId: string, body: { minutes?: number; until?: string; reason?: string }) =>
    request<{ userId: string; timeoutUntil: string }>(
      `/guilds/${guildId}/members/${userId}/timeout`,
      json(body),
    ),
  removeTimeout: (guildId: string, userId: string) =>
    request<{ userId: string; timeoutUntil: null }>(
      `/guilds/${guildId}/members/${userId}/timeout`,
      del(),
    ),

  // lista de banimentos (com o motivo registrado) e o desfazer
  listBans: (guildId: string) =>
    request<{ user: PublicUser; reason: string | null; createdAt: string }[]>(
      `/guilds/${guildId}/bans`,
    ),
  unbanMember: (guildId: string, userId: string) =>
    request<{ unbanned: string }>(`/guilds/${guildId}/bans/${userId}`, del()),

  // expulsão e banimento com motivo (e limpeza de mensagens)
  kickWithReason: (guildId: string, userId: string, reason?: string) =>
    request<{ kicked: string }>(`/guilds/${guildId}/members/${userId}/kick`, json({ reason })),
  banWithReason: (guildId: string, userId: string, body: { reason?: string; deleteMessageHours?: number }) =>
    request<{ banned: string }>(`/guilds/${guildId}/members/${userId}/ban`, json(body)),

  // remoção de mensagens em lote
  bulkDeleteMessages: (channelId: string, ids: string[]) =>
    request<{ deleted: string[] }>(`/channels/${channelId}/messages`, del({ ids })),
  deleteMessagesAfter: (channelId: string, messageId: string) =>
    request<{ deleted: string[] }>(`/channels/${channelId}/messages/delete-after`, json({ messageId })),

  // denúncias
  reportMessage: (messageId: string, reason: ReportReason, details?: string) =>
    request<ReportView>(`/messages/${messageId}/report`, json({ reason, details })),
  listReports: (guildId: string, resolved = false) =>
    request<ReportView[]>(`/guilds/${guildId}/reports${query({ resolved: String(resolved) })}`),
  resolveReport: (guildId: string, reportId: string, resolved: boolean) =>
    request<ReportView>(`/guilds/${guildId}/reports/${reportId}`, patch({ resolved })),

  // enquetes (criar/votar/encerrar vão pelo gateway — aqui só leitura)
  myPollVotes: (channelId: string) =>
    request<{ messageId: string; optionIndexes: number[] }[]>(`/channels/${channelId}/polls/votes`),
  pollVoters: (messageId: string) => request<PollVoters>(`/messages/${messageId}/poll/voters`),

  // onboarding, regras e boas-vindas
  membership: (guildId: string) => request<GuildMembership>(`/guilds/${guildId}/membership`),
  onboarding: (guildId: string) => request<GuildOnboarding>(`/guilds/${guildId}/onboarding`),
  updateOnboarding: (guildId: string, body: GuildOnboardingUpdate) =>
    request<GuildOnboarding>(`/guilds/${guildId}/onboarding`, patch(body)),
  acceptRules: (guildId: string) =>
    request<{ acceptedRulesAt: string }>(`/guilds/${guildId}/rules/accept`, { method: "POST" }),
  markWelcomeSeen: (guildId: string) =>
    request<{ ok: true }>(`/guilds/${guildId}/welcome/seen`, { method: "POST" }),

  // descobrir servidores públicos
  discover: (q?: string) => request<DiscoverableGuild[]>(`/discover${query({ q })}`),
  joinDiscoverable: (guildId: string) =>
    request<{ id: string; name: string }>(`/discover/${guildId}/join`, { method: "POST" }),
};
