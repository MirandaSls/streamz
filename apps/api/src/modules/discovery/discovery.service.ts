import { Injectable } from "@nestjs/common";
import type { DiscoverableGuild } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";

/** Quantos servidores a página "Descobrir" mostra de uma vez. */
const LIMITE = 50;

/**
 * Servidores públicos.
 *
 * Um servidor só aparece aqui se o dono marcou `discoverable` — descoberta é
 * opt-in, e a listagem não expõe nada além do que o card mostra (nome, ícone,
 * descrição e contagens).
 */
@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewerId: string, query?: string): Promise<DiscoverableGuild[]> {
    const q = query?.trim();
    const guilds = await this.prisma.guild.findMany({
      where: {
        discoverable: true,
        // `mode: "insensitive"` é obrigatório no Postgres — sem ele a busca
        // casaria caixa exata e não acharia nada útil
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        iconUrl: true,
        description: true,
        _count: { select: { members: true } },
        members: { where: { userId: viewerId }, select: { id: true } },
      },
      take: LIMITE,
    });

    // uma consulta só para todos os "online" em vez de uma por servidor
    const online = await this.prisma.guildMember.groupBy({
      by: ["guildId"],
      where: {
        guildId: { in: guilds.map((g) => g.id) },
        user: { status: { not: "OFFLINE" } },
      },
      _count: { _all: true },
    });
    const onlinePorGuild = new Map(online.map((o) => [o.guildId, o._count._all]));

    return guilds
      .map((g) => ({
        id: g.id,
        name: g.name,
        iconUrl: g.iconUrl,
        description: g.description,
        memberCount: g._count.members,
        onlineCount: onlinePorGuild.get(g.id) ?? 0,
        joined: g.members.length > 0,
      }))
      // mais gente online primeiro; empate desempata pelo total de membros
      .sort((a, b) => b.onlineCount - a.onlineCount || b.memberCount - a.memberCount);
  }
}
