import type { Attachment, AuthTokens, PublicUser } from "@newdisc/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

function authHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Erro ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
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
  uploadFile: async (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    // sem Content-Type manual: o browser define o boundary do multipart
    const res = await fetch(`${API_URL}/api/uploads`, {
      method: "POST",
      headers: { ...authHeader() },
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `Erro ${res.status}`);
    }
    return (await res.json()) as Attachment;
  },
};
