import type {
  AdminCall,
  AdminChannelsPage,
  AdminGuildView,
  AdminMe,
  AdminMensagemEnviada,
  AdminMessagesPage,
  AdminOverview,
  AdminUsersPage,
  Attachment,
  AuthSession,
  AuthTokens,
  Category,
  ContaEncerrada,
  ContaOk,
  ContaRegistroInput,
  EmailVerificado,
  Channel,
  ChannelOverride,
  ChannelOverrideInput,
  GuildReadResult,
  CustomStatusUpdate,
  CustomEmoji,
  GifCategoriesResponse,
  GifSearchResponse,
  GuildEmojis,
  GuildStickers,
  AuditAction,
  AuditLogPage,
  DiscoverableGuild,
  DMChannelView,
  DownloadAutorizado,
  DownloadCatalogo,
  DownloadPlataforma,
  DMLeaveResult,
  FriendLists,
  FriendRequest,
  Guild,
  GuildChannelType,
  GuildMembership,
  GuildMemberView,
  GuildOnboarding,
  GuildOnboardingUpdate,
  GuildWithChannels,
  InboxMention,
  InboxUnreadGroup,
  InviteInfo,
  InvitePreview,
  CallStartResponse,
  InviteDetail,
  InviteFullPreview,
  InviteOptions,
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
  NotificationSetting,
  NotificationSettingUpdate,
  SessionInfo,
  ProfileUpdate,
  UserProfile,
  Sticker,
  PollVoters,
  ReportReason,
  ReportView,
  LoginResult,
  MfaAtivado,
  MfaSetup,
  MinhaConta,
  SessaoView,
  UserStatus,
  VoiceStateEvent,
} from "@streamz/shared";
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
  "/downloads/token",
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
  updateProfile: (body: ProfileUpdate) => request<PublicUser>("/users/me", patch(body)),
  updateStatus: (manualStatus: UserStatus | null) =>
    request<PublicUser>("/users/me/status", patch({ manualStatus })),
  updateAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<PublicUser>("/users/me/avatar", { method: "POST", body: form });
  },
  removeAvatar: () => request<PublicUser>("/users/me/avatar", { method: "DELETE" }),
  searchUsers: (q: string) => request<PublicUser[]>(`/users/search?q=${encodeURIComponent(q)}`),

  // ── d-social: status personalizado, perfil rico ──
  updateCustomStatus: (body: CustomStatusUpdate) =>
    request<PublicUser>("/users/me/custom-status", patch(body)),
  updateBanner: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<PublicUser>("/users/me/banner", { method: "POST", body: form });
  },
  removeBanner: () => request<PublicUser>("/users/me/banner", { method: "DELETE" }),
  profile: (userId: string, guildId?: string) =>
    request<UserProfile>(`/users/${userId}/profile${guildId ? `?guildId=${guildId}` : ""}`),

  // ── d-social: amigos e bloqueio ──
  friends: () => request<FriendLists>("/friends"),
  requestFriend: (username: string) => request<FriendRequest>("/friends/requests", json({ username })),
  acceptFriend: (requestId: string) =>
    request<FriendRequest>(`/friends/requests/${requestId}/accept`, { method: "POST" }),
  removeFriendRequest: (requestId: string) =>
    request<{ removed: string }>(`/friends/requests/${requestId}`, { method: "DELETE" }),
  removeFriend: (userId: string) =>
    request<{ removed: string }>(`/friends/${userId}`, { method: "DELETE" }),
  blockUser: (userId: string) => request<PublicUser>("/friends/blocks", json({ userId })),
  unblockUser: (userId: string) =>
    request<{ unblocked: string }>(`/friends/blocks/${userId}`, { method: "DELETE" }),

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

  // ── configurações do servidor (c-cargos) ──
  updateGuild: (guildId: string, body: { name?: string; description?: string | null }) =>
    request<Guild>(`/guilds/${guildId}`, patch(body)),
  updateGuildIcon: (guildId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Guild>(`/guilds/${guildId}/icon`, { method: "POST", body: form });
  },
  removeGuildIcon: (guildId: string) =>
    request<Guild>(`/guilds/${guildId}/icon`, { method: "DELETE" }),
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

  // ── d-social: fechar conversa e gerir o grupo ──
  dmMembers: (channelId: string) => request<PublicUser[]>(`/dms/${channelId}/members`),
  hideDM: (channelId: string) =>
    request<{ channelId: string }>(`/dms/${channelId}/hide`, { method: "POST" }),
  addGroupMember: (channelId: string, userId: string) =>
    request<DMChannelView>(`/dms/${channelId}/members`, json({ userId })),
  removeGroupMember: (channelId: string, userId: string) =>
    request<DMChannelView>(`/dms/${channelId}/members/${userId}`, { method: "DELETE" }),
  renameGroupDM: (channelId: string, name: string | null) =>
    request<DMChannelView>(`/dms/${channelId}`, patch({ name })),
  updateGroupIcon: (channelId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DMChannelView>(`/dms/${channelId}/icon`, { method: "POST", body: form });
  },

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
  /**
   * Token do participante de tela (`<userId>#tela`) para a captura nativa do
   * desktop — canal de voz ou conversa direta, a mesma sala da chamada.
   */
  telaToken: (channelId: string) =>
    request<{ token: string; url: string; room: string }>(
      `/voice/channels/${channelId}/tela-token`,
      { method: "POST" },
    ),
  /** Estado inicial de voz do servidor; depois disso os `voice.state` mantêm em dia. */
  guildVoiceStates: (guildId: string) => request<VoiceStateEvent[]>(`/guilds/${guildId}/voice-states`),
  /** Quem está na chamada de uma conversa agora — o par do de servidor, para DM e grupo. */
  dmVoiceStates: (channelId: string) => request<VoiceStateEvent[]>(`/dms/${channelId}/voice-states`),
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

  // ── e-configuracoes ──
  /** Preferências de notificação (canal, servidor e o padrão global). */
  notificationSettings: () => request<NotificationSetting[]>("/me/notifications"),
  updateNotificationSetting: (body: NotificationSettingUpdate) =>
    request<NotificationSetting>("/me/notifications", patch(body)),

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

  // ── GIFs (Giphy; sem chave a resposta vem `configured: false`) ──
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

  // download do app de desktop (senha única, conferida no servidor)
  downloadCatalogo: () => request<DownloadCatalogo>("/downloads"),
  /** 401 aqui é senha errada — a rota está em ROTAS_SEM_REFRESH por isso. */
  downloadAutorizar: (senha: string, plataforma: DownloadPlataforma) =>
    request<DownloadAutorizado>("/downloads/token", json({ senha, plataforma })),

  // ── j-painel-admin ── painel do administrador da instância (só leitura)
  /** Toda conta pode perguntar; só quem está em `PLATFORM_ADMIN_EMAILS` ouve true. */
  adminMe: () => request<AdminMe>("/admin/me"),
  adminOverview: () => request<AdminOverview>("/admin/overview"),
  adminCalls: () => request<AdminCall[]>("/admin/calls"),
  adminUsers: (q?: string, cursor?: string) =>
    request<AdminUsersPage>(`/admin/users${query({ q, cursor })}`),
  adminGuilds: () => request<AdminGuildView[]>("/admin/guilds"),
  adminChannels: (q?: string, escopo?: string, cursor?: string) =>
    request<AdminChannelsPage>(`/admin/channels${query({ q, escopo, cursor })}`),
  adminMessages: (channelId: string, cursor?: string) =>
    request<AdminMessagesPage>(`/admin/channels/${channelId}/messages${query({ cursor })}`),
  /** A única escrita do painel: abre a conversa 1-a-1 se não existir e manda. */
  adminEnviarMensagem: (userId: string, content: string) =>
    request<AdminMensagemEnviada>(`/admin/users/${userId}/message`, json({ content })),
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
