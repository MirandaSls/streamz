import type { AuthTokens, PublicUser } from "@newdisc/shared";

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

  listGuilds: () => request<any[]>("/guilds"),
  createGuild: (name: string) =>
    request<any>("/guilds", { method: "POST", body: JSON.stringify({ name }) }),
  getGuild: (id: string) => request<any>(`/guilds/${id}`),
  members: (guildId: string) => request<any[]>(`/guilds/${guildId}/members`),

  createChannel: (guildId: string, name: string, type: "TEXT" | "VOICE") =>
    request<any>(`/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name, type }),
    }),

  history: (channelId: string) =>
    request<any[]>(`/channels/${channelId}/messages`),

  voiceToken: (channelId: string) =>
    request<{ token: string; url: string; room: string }>(
      `/voice/channels/${channelId}/token`,
      { method: "POST" },
    ),
};
