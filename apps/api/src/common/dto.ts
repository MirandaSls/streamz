import type { Channel, ChannelType, Guild } from "@newdisc/shared";

/**
 * Conversores de linha do Prisma para os DTOs de `@newdisc/shared`.
 *
 * Ficam aqui, e não dentro de um service, porque guilds, channels e dms devolvem
 * os mesmos objetos.
 */

export function toGuildDTO(g: {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
}): Guild {
  return { id: g.id, name: g.name, iconUrl: g.iconUrl, ownerId: g.ownerId };
}

export function toChannelDTO(c: {
  id: string;
  guildId: string | null;
  name: string | null;
  type: ChannelType;
  position: number;
  private: boolean;
  readOnly: boolean;
}): Channel {
  return {
    id: c.id,
    guildId: c.guildId,
    name: c.name,
    type: c.type,
    position: c.position,
    private: c.private,
    readOnly: c.readOnly,
  };
}
