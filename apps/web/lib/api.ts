import type {
  Attachment,
  AuthTokens,
  Channel,
  CustomEmoji,
  GifCategoriesResponse,
  GifSearchResponse,
  GuildEmojis,
  GuildStickers,
  DMChannelView,
  DMLeaveResult,
  Guild,
  GuildChannelType,
  GuildMemberView,
  GuildWithChannels,
  InviteInfo,
  InvitePreview,
  LinkEmbed,
  MemberRole,
  Message,
  PublicUser,
  Sticker,
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

  // ── emojis personalizados e figurinhas (g-emojis-midia) ──
  /** Emojis de todos os meus servidores, agrupados — o que o seletor mostra. */
  myEmojis: () => request<GuildEmojis[]>("/emojis"),
  guildEmojis: (guildId: string) => request<CustomEmoji[]>(`/guilds/${guildId}/emojis`),
  createEmoji: (guildId: string, name: string, file: File) => {
    const form = new FormData();
    form.append("name", name);
    form.append("file", file);
    return request<CustomEmoji>(`/guilds/${guildId}/emojis`, { method: "POST", body: form });
  },
  renameEmoji: (guildId: string, id: string, name: string) =>
    request<CustomEmoji>(`/guilds/${guildId}/emojis/${id}`, patch({ name })),
  deleteEmoji: (guildId: string, id: string) =>
    request<{ deleted: string }>(`/guilds/${guildId}/emojis/${id}`, { method: "DELETE" }),

  myStickers: () => request<GuildStickers[]>("/stickers"),
  guildStickers: (guildId: string) => request<Sticker[]>(`/guilds/${guildId}/stickers`),
  createSticker: (guildId: string, name: string, tags: string, file: File) => {
    const form = new FormData();
    form.append("name", name);
    form.append("tags", tags);
    form.append("file", file);
    return request<Sticker>(`/guilds/${guildId}/stickers`, { method: "POST", body: form });
  },
  updateSticker: (guildId: string, id: string, body: { name?: string; tags?: string }) =>
    request<Sticker>(`/guilds/${guildId}/stickers/${id}`, patch(body)),
  deleteSticker: (guildId: string, id: string) =>
    request<{ deleted: string }>(`/guilds/${guildId}/stickers/${id}`, { method: "DELETE" }),

  // ── GIFs (Tenor; sem chave a resposta vem `configured: false`) ──
  searchGifs: (q: string) =>
    request<GifSearchResponse>(`/gifs/search${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  gifCategories: () => request<GifCategoriesResponse>("/gifs/categories"),

  // ── mídia do canal ──
  channelAttachments: (channelId: string, type: "image" | "all" = "image") =>
    request<Attachment[]>(`/channels/${channelId}/attachments?type=${type}`),

  /** Anexo por URL (GIF do seletor): não passa pelo nosso storage. */
  createExternalAttachment: (body: {
    url: string;
    filename: string;
    width?: number;
    height?: number;
  }) => request<Attachment>("/uploads/external", json(body)),

  /** Envia um arquivo e devolve o anexo (a vincular numa mensagem no envio). */
  uploadFile: (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    return request<Attachment>("/uploads", { method: "POST", body: form });
  },

  /**
   * Igual ao `uploadFile`, mas relatando o quanto já subiu.
   *
   * Usa `XMLHttpRequest` porque `fetch` não expõe progresso de envio no
   * browser (`ReadableStream` como corpo de request ainda não é universal), e
   * uma barra parada em 0% até o arquivo terminar é pior que barra nenhuma.
   * O 401 é tratado à mão aqui: renova uma vez e repete, como o `request`.
   */
  uploadFileComProgresso: (
    file: File,
    onProgresso: (porcentagem: number) => void,
  ): Promise<Attachment> => enviarComProgresso(file, onProgresso, true),
};

async function enviarComProgresso(
  file: File,
  onProgresso: (porcentagem: number) => void,
  podeRenovar: boolean,
): Promise<Attachment> {
  const token = await getAccessToken();
  return new Promise<Attachment>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/uploads`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgresso(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgresso(100);
        resolve(JSON.parse(xhr.responseText) as Attachment);
        return;
      }
      if (xhr.status === 401 && podeRenovar) {
        renovarTokens()
          .then(() => enviarComProgresso(file, onProgresso, false))
          .then(resolve, reject);
        return;
      }
      reject(erroDoXhr(xhr));
    };
    xhr.onerror = () => reject(new ApiError(0, "Falha de rede ao enviar o arquivo"));
    xhr.send(form);
  });
}

/** Mensagem da API quando o corpo do erro é JSON; senão, algo com o status. */
function erroDoXhr(xhr: XMLHttpRequest): ApiError {
  try {
    const body = JSON.parse(xhr.responseText) as { message?: unknown };
    if (typeof body.message === "string") return new ApiError(xhr.status, body.message);
    if (Array.isArray(body.message) && typeof body.message[0] === "string") {
      return new ApiError(xhr.status, body.message[0]);
    }
  } catch {
    /* resposta não-JSON (proxy, HTML de erro) */
  }
  return new ApiError(xhr.status, `Erro ${xhr.status}`);
}
