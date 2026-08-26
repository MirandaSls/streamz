import type {
  Attachment,
  AuthSession,
  AuthTokens,
  ContaEncerrada,
  ContaOk,
  ContaRegistroInput,
  EmailVerificado,
  Channel,
  DMChannelView,
  DMLeaveResult,
  Guild,
  GuildChannelType,
  GuildMemberView,
  GuildWithChannels,
  InviteInfo,
  InvitePreview,
  LinkEmbed,
  LoginResult,
  MemberRole,
  Message,
  MfaAtivado,
  MfaSetup,
  MinhaConta,
  PublicUser,
  SessaoView,
  UserStatus,
} from "@newdisc/shared";
import { API_URL } from "./config";
import { ApiError } from "./api-error";
import { getAccessToken, renovarTokens } from "./session";

export { ApiError, isApiError } from "./api-error";

/** Rotas que não devem disparar refresh: um 401 nelas é credencial errada. */
const ROTAS_SEM_REFRESH = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/mfa",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/forgot-password",
  "/auth/reset-password",
];

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

const del = (): RequestInit => ({ method: "DELETE" });

export const api = {
  // ── auth ──
  register: (input: ContaRegistroInput) => request<AuthSession>("/auth/register", json(input)),
  /** `identificador` é e-mail **ou** usuário; pode devolver o desafio de 2FA. */
  login: (identificador: string, password: string) =>
    request<LoginResult>("/auth/login", json({ identificador, password })),
  /** Segundo fator: fecha o login que parou no desafio. */
  loginMfa: (ticket: string, code: string) =>
    request<AuthSession>("/auth/mfa", json({ ticket, code })),
  logout: (refreshToken: string) => request<ContaOk>("/auth/logout", json({ refreshToken })),

  // ── e-mail e senha (rotas públicas) ──
  verifyEmail: (token: string) => request<EmailVerificado>("/auth/verify-email", json({ token })),
  resendVerification: (email: string) =>
    request<ContaOk>("/auth/resend-verification", json({ email })),
  forgotPassword: (email: string) => request<ContaOk>("/auth/forgot-password", json({ email })),
  resetPassword: (token: string, password: string) =>
    request<ContaOk>("/auth/reset-password", json({ token, password })),

  // ── minha conta (/me) ──
  account: () => request<MinhaConta>("/me/account"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<ContaOk>("/me/password", patch({ currentPassword, newPassword })),
  changeEmail: (email: string, password: string) =>
    request<MinhaConta>("/me/email", patch({ email, password })),
  resendMyVerification: () => request<ContaOk>("/me/email/resend", { method: "POST" }),
  disableAccount: (password: string) =>
    request<ContaEncerrada>("/me/disable", json({ password })),
  deleteAccount: (password: string, code?: string) =>
    request<ContaEncerrada>("/me", { method: "DELETE", body: JSON.stringify({ password, code }) }),

  // ── verificação em duas etapas ──
  mfaSetup: () => request<MfaSetup>("/me/mfa/setup", { method: "POST" }),
  mfaEnable: (code: string) => request<MfaAtivado>("/me/mfa/enable", json({ code })),
  mfaDisable: (password: string, code: string) =>
    request<ContaOk>("/me/mfa/disable", json({ password, code })),
  mfaRecoveryCodes: (password: string) =>
    request<MfaAtivado>("/me/mfa/recovery-codes", json({ password })),

  // ── sessões (dispositivos) ──
  sessions: () => request<SessaoView[]>("/me/sessions"),
  revokeSession: (id: string) => request<ContaOk>(`/me/sessions/${id}`, del()),
  revokeOtherSessions: () => request<ContaOk>("/me/sessions", del()),

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
};
