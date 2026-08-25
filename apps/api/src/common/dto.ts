import type {
  Category as CategoryDTO,
  Channel,
  ChannelType,
  Guild,
  PublicUser,
  UserStatus,
} from "@newdisc/shared";

/**
 * Conversores de linha do Prisma para os DTOs de `@newdisc/shared`.
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
}

export function toPublicUser(u: PublicUserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    status: u.status,
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
  g: { id: string; name: string; iconUrl: string | null; ownerId: string },
  view: { unread: boolean; mentionCount: number } = { unread: false, mentionCount: 0 },
): Guild {
  return {
    id: g.id,
    name: g.name,
    iconUrl: g.iconUrl,
    ownerId: g.ownerId,
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
