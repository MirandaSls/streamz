import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { WS_EVENTS } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Cria o servidor, registra o dono como membro OWNER e um canal #geral. */
  async create(ownerId: string, name: string) {
    return this.prisma.guild.create({
      data: {
        name,
        ownerId,
        members: { create: { userId: ownerId, role: "OWNER" } },
        channels: { create: { name: "geral", type: "TEXT", position: 0 } },
      },
      include: { channels: true },
    });
  }

  /** Servidores em que o usuário é membro. */
  async listForUser(userId: string) {
    return this.prisma.guild.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async getWithChannels(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: { channels: { orderBy: { position: "asc" } } },
    });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    const member = await this.assertMember(userId, guildId);

    // OWNER/ADMIN veem tudo; MEMBER não vê canais privados fora da sua allowlist
    if (!this.isPrivileged(member.role)) {
      const allowed = await this.prisma.channelMember.findMany({
        where: { userId, channel: { guildId } },
        select: { channelId: true },
      });
      const allowedSet = new Set(allowed.map((a) => a.channelId));
      guild.channels = guild.channels.filter((c) => !c.private || allowedSet.has(c.id));
    }
    return guild;
  }

  async listMembers(userId: string, guildId: string) {
    await this.assertMember(userId, guildId);
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    return members.map((m) => ({
      role: m.role,
      user: {
        id: m.user.id,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        status: m.user.status,
      },
    }));
  }

  async assertMember(userId: string, guildId: string) {
    const member = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
    });
    if (!member) throw new ForbiddenException("Você não é membro deste servidor");
    return member;
  }

  /**
   * Autorização por canal: garante que o usuário é membro do servidor dono do
   * canal. Ponto único usado por mensagens (HTTP e WebSocket) e voz para não
   * repetir a checagem endpoint a endpoint.
   */
  async assertChannelMember(userId: string, channelId: string) {
    // Caminho feliz: uma única consulta (membership via o servidor dono do canal).
    const member = await this.prisma.guildMember.findFirst({
      where: { userId, guild: { channels: { some: { id: channelId } } } },
    });
    if (member) return member;

    // Caminho de erro: distingue canal inexistente de não-membro.
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    throw new ForbiddenException("Você não é membro deste servidor");
  }

  // ── autorização por canal (privado / somente-leitura) ──────────

  /**
   * Pode ver/entrar no canal: membro do servidor e, se o canal for privado,
   * OWNER/ADMIN ou constar na allowlist. Devolve canal + papel do membro.
   */
  async assertCanViewChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, guildId: true, private: true, readOnly: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    const member = await this.assertMember(userId, channel.guildId);

    if (channel.private && !this.isPrivileged(member.role)) {
      const allowed = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!allowed) throw new ForbiddenException("Canal privado");
    }
    return { channel, member };
  }

  /** Pode postar: view + se o canal for somente-leitura, precisa ser OWNER/ADMIN. */
  async assertCanPostChannel(userId: string, channelId: string) {
    const { channel, member } = await this.assertCanViewChannel(userId, channelId);
    if (channel.readOnly && !this.isPrivileged(member.role)) {
      throw new ForbiddenException("Canal somente-leitura");
    }
    return { channel, member };
  }

  private isPrivileged(role: string): boolean {
    return role === "OWNER" || role === "ADMIN";
  }

  /** Público: exige papel de moderação (OWNER/ADMIN) no servidor. */
  async assertModerator(userId: string, guildId: string) {
    return this.assertCanModerate(userId, guildId);
  }

  // ── moderação ──────────────────────────────────────────────
  async isBanned(guildId: string, userId: string): Promise<boolean> {
    const ban = await this.prisma.ban.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    return !!ban;
  }

  /** Expulsa um membro (pode voltar por convite). */
  async kick(actorId: string, guildId: string, targetUserId: string) {
    await this.assertCanActOn(actorId, guildId, targetUserId);
    await this.prisma.guildMember.delete({
      where: { userId_guildId: { userId: targetUserId, guildId } },
    });
    this.realtime.emitToUser(targetUserId, WS_EVENTS.GUILD_REMOVED, {
      guildId,
      reason: "kicked",
    });
    return { kicked: targetUserId };
  }

  /** Bane um membro: remove e bloqueia reentrada. */
  async ban(actorId: string, guildId: string, targetUserId: string, reason?: string) {
    await this.assertCanActOn(actorId, guildId, targetUserId);
    await this.prisma.$transaction([
      this.prisma.guildMember.deleteMany({
        where: { userId: targetUserId, guildId },
      }),
      this.prisma.ban.upsert({
        where: { guildId_userId: { guildId, userId: targetUserId } },
        create: { guildId, userId: targetUserId, bannedById: actorId, reason },
        update: { reason, bannedById: actorId },
      }),
    ]);
    this.realtime.emitToUser(targetUserId, WS_EVENTS.GUILD_REMOVED, {
      guildId,
      reason: "banned",
    });
    return { banned: targetUserId };
  }

  async unban(actorId: string, guildId: string, targetUserId: string) {
    await this.assertCanModerate(actorId, guildId);
    await this.prisma.ban
      .delete({ where: { guildId_userId: { guildId, userId: targetUserId } } })
      .catch(() => undefined);
    return { unbanned: targetUserId };
  }

  async listBans(actorId: string, guildId: string) {
    await this.assertCanModerate(actorId, guildId);
    const bans = await this.prisma.ban.findMany({
      where: { guildId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
    return bans.map((b) => ({
      reason: b.reason,
      createdAt: b.createdAt.toISOString(),
      user: {
        id: b.user.id,
        username: b.user.username,
        avatarUrl: b.user.avatarUrl,
        status: b.user.status,
      },
    }));
  }

  /** O ator precisa ser OWNER ou ADMIN do servidor. */
  private async assertCanModerate(actorId: string, guildId: string) {
    const actor = await this.assertMember(actorId, guildId);
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ForbiddenException("Sem permissão de moderação");
    }
    return actor;
  }

  /** Valida hierarquia: ator só age sobre alguém de cargo estritamente inferior. */
  private async assertCanActOn(actorId: string, guildId: string, targetUserId: string) {
    if (actorId === targetUserId) {
      throw new ForbiddenException("Você não pode moderar a si mesmo");
    }
    const actor = await this.assertCanModerate(actorId, guildId);
    const target = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: targetUserId, guildId } },
    });
    if (!target) throw new NotFoundException("Membro não encontrado");
    if (this.rank(actor.role) <= this.rank(target.role)) {
      throw new ForbiddenException("Você não pode moderar alguém de cargo igual ou superior");
    }
    return { actor, target };
  }

  private rank(role: string): number {
    return role === "OWNER" ? 3 : role === "ADMIN" ? 2 : 1;
  }
}
