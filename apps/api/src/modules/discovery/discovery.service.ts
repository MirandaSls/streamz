import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { WS_EVENTS } from "@streamz/shared";
import type { DiscoverableGuild } from "@streamz/shared";
import { toGuildDTO, toPublicUser } from "../../common/dto";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { OnboardingService } from "../onboarding/onboarding.service";
import { RealtimeService } from "../realtime/realtime.service";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
    private readonly onboarding: OnboardingService,
  ) {}

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

  /**
   * Entra num servidor público sem convite.
   *
   * É o mesmo efeito do resgate de convite (associação, salas ao vivo, aviso no
   * canal de sistema) menos o convite: aqui a "permissão" é o próprio dono ter
   * marcado o servidor como descobrível. Banimento continua valendo.
   */
  async join(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        id: true,
        name: true,
        discoverable: true,
        iconUrl: true,
        ownerId: true,
        description: true,
        // o `Guild` do contrato carrega os dois desde o "perfil do servidor"
        bannerColor: true,
        createdAt: true,
      },
    });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    if (!guild.discoverable) throw new ForbiddenException("Este servidor não é público");
    if (await this.guilds.isBanned(guildId, userId)) {
      throw new ForbiddenException("Você foi banido deste servidor");
    }

    const jaEra = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { id: true },
    });
    if (jaEra) return { id: guild.id, name: guild.name };

    try {
      await this.prisma.guildMember.create({ data: { userId, guildId, role: "MEMBER" } });
    } catch (e) {
      // corrida com outro clique: já virou membro, e isso basta
      if (!isUniqueViolation(e)) throw e;
      return { id: guild.id, name: guild.name };
    }

    const [user, novoMembro] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      // `joinedAt` do banco: é por ele que a tabela de membros ordena
      this.prisma.guildMember.findUnique({
        where: { userId_guildId: { userId, guildId } },
        select: { joinedAt: true },
      }),
    ]);
    if (user && novoMembro) {
      this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_JOINED, {
        guildId,
        member: {
          role: "MEMBER",
          user: toPublicUser(user),
          roleIds: [],
          joinedAt: novoMembro.joinedAt.toISOString(),
          // membro recém-chegado nunca tem apelido ainda
          nickname: null,
        },
      });
    }
    this.realtime.joinGuildRoom(userId, guildId);
    const publicos = await this.prisma.channel.findMany({
      where: { guildId, private: false },
      select: { id: true },
    });
    for (const c of publicos) this.realtime.joinChannelRooms([userId], c.id);
    // as minhas outras conexões põem o servidor no rail na hora — a mesma regra
    // do resgate de convite (§9, PR #104): entrar pela Descobrir no site não
    // pode deixar o desktop com o rail velho até reiniciar
    this.realtime.emitToUser(userId, WS_EVENTS.GUILD_JOINED, {
      guild: toGuildDTO(guild),
      reason: "joined",
    });
    await this.onboarding.announceJoin(guildId, userId);
    return { id: guild.id, name: guild.name };
  }
}
