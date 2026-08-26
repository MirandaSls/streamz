import type {
  Category as CategoryDTO,
  Channel,
  ChannelOverride,
  ChannelType,
  Guild,
  PublicUser,
  Role,
  UserStatus,
} from "@streamz/shared";

/**
 * Conversores de linha do Prisma para os DTOs de `@streamz/shared`.
 *
 * Ficam aqui, e não dentro de um service, porque guilds, channels, dms, users e
 * messages devolvem os mesmos objetos.
 */

/** Linha de User com o que o DTO público precisa. */
export interface PublicUserRow {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  // ── d-social ── status personalizado (opcional na linha: nem toda query o traz)
  customStatusText?: string | null;
  customStatusEmoji?: string | null;
  customStatusExpiresAt?: Date | null;
}

export function toPublicUser(u: PublicUserRow, agora = new Date()): PublicUser {
  // status personalizado vencido é o mesmo que ausente: a faxina diária limpa a
  // coluna, mas a leitura não pode depender da hora em que o job rodou.
  const vencido = !!u.customStatusExpiresAt && u.customStatusExpiresAt.getTime() <= agora.getTime();
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    status: u.status,
    customStatusText: vencido ? null : (u.customStatusText ?? null),
    customStatusEmoji: vencido ? null : (u.customStatusEmoji ?? null),
  };
}

/** Resumo de leitura de um canal, na visão de um usuário. */
export interface ChannelReadSummary {
  lastMessageAt: Date | null;
  lastReadAt: Date | null;
  mentionCount: number;
}

export const EMPTY_SUMMARY: ChannelReadSummary = {
  lastMessageAt: null,
  lastReadAt: null,
  mentionCount: 0,
};

export function toGuildDTO(
  g: {
    id: string;
    name: string;
    iconUrl: string | null;
    ownerId: string;
    description: string | null;
  },
  view: { unread: boolean; mentionCount: number } = { unread: false, mentionCount: 0 },
): Guild {
  return {
    id: g.id,
    name: g.name,
    iconUrl: g.iconUrl,
    ownerId: g.ownerId,
    description: g.description,
    unread: view.unread,
    mentionCount: view.mentionCount,
  };
}

export function toChannelDTO(
  c: {
    id: string;
    guildId: string | null;
    name: string | null;
    type: ChannelType;
    position: number;
    private: boolean;
    readOnly: boolean;
    // ── b-canais ──
    categoryId: string | null;
    topic: string | null;
    slowmodeSeconds: number;
    nsfw: boolean;
  },
  summary: ChannelReadSummary = EMPTY_SUMMARY,
): Channel {
  return {
    id: c.id,
    guildId: c.guildId,
    name: c.name,
    type: c.type,
    position: c.position,
    private: c.private,
    readOnly: c.readOnly,
    lastMessageAt: summary.lastMessageAt ? summary.lastMessageAt.toISOString() : null,
    lastReadAt: summary.lastReadAt ? summary.lastReadAt.toISOString() : null,
    mentionCount: summary.mentionCount,
    categoryId: c.categoryId,
    topic: c.topic,
    slowmodeSeconds: c.slowmodeSeconds,
    nsfw: c.nsfw,
  };
}

// ── c-cargos ──────────────────────────────────────────────────

/** Linha de Role do Prisma → DTO. Os enums e o bitfield são atribuição direta. */
export function toRoleDTO(r: {
  id: string;
  guildId: string;
  name: string;
  color: string | null;
  position: number;
  permissions: number;
  hoist: boolean;
  mentionable: boolean;
  isDefault: boolean;
}): Role {
  return {
    id: r.id,
    guildId: r.guildId,
    name: r.name,
    color: r.color,
    position: r.position,
    permissions: r.permissions,
    hoist: r.hoist,
    mentionable: r.mentionable,
    isDefault: r.isDefault,
  };
}

/** Linha de ChannelOverride do Prisma → DTO (o `id` não interessa ao cliente). */
export function toOverrideDTO(o: {
  channelId: string;
  roleId: string | null;
  userId: string | null;
  allow: number;
  deny: number;
}): ChannelOverride {
  return {
    channelId: o.channelId,
    roleId: o.roleId,
    userId: o.userId,
    allow: o.allow,
    deny: o.deny,
  };
}

// ── b-canais ──
/** Linha de Category como o contrato compartilhado a expõe. */
export function toCategoryDTO(c: {
  id: string;
  guildId: string;
  name: string;
  position: number;
}): CategoryDTO {
  return { id: c.id, guildId: c.guildId, name: c.name, position: c.position };
}
