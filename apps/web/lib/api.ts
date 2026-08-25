import type { Attachment, AuthTokens, PublicUser } from "@newdisc/shared";
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

export const api = {
  register: (username: string, password: string) =>
    request<{ user: PublicUser; tokens: AuthTokens }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ user: PublicUser; tokens: AuthTokens }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  logout: (refreshToken: string) =>
    request<{ ok: true }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  listGuilds: () => request<any[]>("/guilds"),
  createGuild: (name: string) =>
    request<any>("/guilds", { method: "POST", body: JSON.stringify({ name }) }),
  getGuild: (id: string) => request<any>(`/guilds/${id}`),
  members: (guildId: string) => request<any[]>(`/guilds/${guildId}/members`),

  createInvite: (guildId: string, opts?: { maxUses?: number; expiresInHours?: number }) =>
    request<{ code: string; guildId: string }>(`/guilds/${guildId}/invites`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),
  previewInvite: (code: string) => request<any>(`/invites/${code}`),
  redeemInvite: (code: string) =>
    request<{ id: string; name: string }>(`/invites/${code}/redeem`, { method: "POST" }),

  openDM: (userId: string) =>
    request<any>(`/dms`, { method: "POST", body: JSON.stringify({ userId }) }),
  createGroupDM: (userIds: string[], name?: string) =>
    request<any>(`/dms/group`, {
      method: "POST",
      body: JSON.stringify({ userIds, name }),
    }),
  listDMs: () => request<any[]>(`/dms`),
  dmHistory: (dmChannelId: string, cursor?: string) =>
    request<any[]>(`/dms/${dmChannelId}/messages${cursor ? `?cursor=${cursor}` : ""}`),

  kickMember: (guildId: string, userId: string) =>
    request<any>(`/guilds/${guildId}/kick`, { method: "POST", body: JSON.stringify({ userId }) }),
  banMember: (guildId: string, userId: string, reason?: string) =>
    request<any>(`/guilds/${guildId}/ban`, {
      method: "POST",
      body: JSON.stringify({ userId, reason }),
    }),

  createChannel: (
    guildId: string,
    name: string,
    type: "TEXT" | "VOICE",
    opts?: { isPrivate?: boolean; readOnly?: boolean; memberIds?: string[] },
  ) =>
    request<any>(`/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name, type, ...opts }),
    }),
  channelMembers: (guildId: string, channelId: string) =>
    request<any[]>(`/guilds/${guildId}/channels/${channelId}/members`),
  addChannelMember: (guildId: string, channelId: string, userId: string) =>
    request<any>(`/guilds/${guildId}/channels/${channelId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  removeChannelMember: (guildId: string, channelId: string, userId: string) =>
    request<any>(`/guilds/${guildId}/channels/${channelId}/members/${userId}`, {
      method: "DELETE",
    }),

  history: (channelId: string, cursor?: string) =>
    request<any[]>(
      `/channels/${channelId}/messages${cursor ? `?cursor=${cursor}` : ""}`,
    ),
  searchMessages: (channelId: string, q: string) =>
    request<any[]>(`/channels/${channelId}/messages/search?q=${encodeURIComponent(q)}`),
  thread: (channelId: string, messageId: string) =>
    request<any[]>(`/channels/${channelId}/messages/${messageId}/thread`),

  voiceToken: (channelId: string) =>
    request<{ token: string; url: string; room: string }>(
      `/voice/channels/${channelId}/token`,
      { method: "POST" },
    ),

  /** Envia um arquivo e devolve o anexo (a vincular numa mensagem no envio). */
  uploadFile: (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    return request<Attachment>("/uploads", { method: "POST", body: form });
  },
};
