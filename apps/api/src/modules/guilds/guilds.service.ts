import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { WS_EVENTS } from "@newdisc/shared";
import type {
  ChannelType,
  Guild,
  GuildMemberView,
  GuildWithChannels,
  MemberRole,
  UserStatus,
} from "@newdisc/shared";
import { toChannelDTO, toGuildDTO } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Cria o servidor, registra o dono como membro OWNER e um canal #geral. */
  async create(ownerId: string, name: string): Promise<GuildWithChannels> {
    const guild = await this.prisma.guild.create({
      data: {
        name,
        ownerId,
        members: { create: { userId: ownerId, role: "OWNER" } },
        channels: { create: { name: "geral", type: "TEXT", position: 0 } },
      },
      include: { channels: true },
    });
    return { ...toGuildDTO(guild), channels: guild.channels.map(toChannelDTO) };
  }

  /** Servidores em que o usuário é membro. */
  async listForUser(userId: string): Promise<Guild[]> {
    const guilds = await this.prisma.guild.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
    });
    return guilds.map(toGuildDTO);
  }

  async getWithChannels(userId: string, guildId: string): Promise<GuildWithChannels> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: { channels: { orderBy: { position: "asc" } } },
    });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    const member = await this.assertMember(userId, guildId);

    // OWNER/ADMIN veem tudo; MEMBER não vê canais privados fora da sua allowlist
    let channels = guild.channels;
    if (!this.isPrivileged(member.role)) {
      const allowed = await this.prisma.channelMember.findMany({
        where: { userId, channel: { guildId } },
        select: { channelId: true },
      });
      const allowedSet = new Set(allowed.map((a) => a.channelId));
      channels = channels.filter((c) => !c.private || allowedSet.has(c.id));
    }
    return { ...toGuildDTO(guild), channels: channels.map(toChannelDTO) };
  }

  async listMembers(userId: string, guildId: string): Promise<GuildMemberView[]> {
    await this.assertMember(userId, guildId);
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    return members.map((m) => ({
      role: m.role as MemberRole,
      user: {
        id: m.user.id,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        status: m.user.status as UserStatus,
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

  // ── autorização por canal (privado / somente-leitura) ──────────

  /**
   * Pode ver/entrar no canal: membro do servidor e, se o canal for privado,
   * OWNER/ADMIN ou constar na allowlist. Devolve canal + papel do membro.
   */
  async assertCanViewChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      // `type` sai como String (enum vira String no SQLite) — ver CLAUDE.md
      select: { id: true, guildId: true, type: true, private: true, readOnly: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    const member = await this.assertMember(userId, channel.guildId);

    if (channel.private && !this.isPrivileged(member.role)) {
      const allowed = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!allowed) throw new ForbiddenException("Canal privado");
    }
    return { channel: { ...channel, type: channel.type as ChannelType }, member };
  }

  /** Pode postar: view + se o canal for somente-leitura, precisa ser OWNER/ADMIN. */
  async assertCanPostChannel(userId: string, channelId: string) {
    const { channel, member } = await this.assertCanViewChannel(userId, channelId);
    if (channel.readOnly && !this.isPrivileged(member.role)) {
      throw new ForbiddenException("Canal somente-leitura");
    }
    return { channel, member };
  }

  private isPrivileged(role: MemberRole): boolean {
    return role === "OWNER" || role === "ADMIN";
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
    await this.detachFromGuildRooms(guildId, targetUserId);
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
    await this.detachFromGuildRooms(guildId, targetUserId);
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
        status: b.user.status as UserStatus,
      },
    }));
  }

  /** Tira os sockets do ex-membro das salas de todos os canais do servidor. */
  private async detachFromGuildRooms(guildId: string, userId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { guildId },
      select: { id: true },
    });
    this.realtime.leaveChannelRooms(userId, channels.map((c) => c.id));
  }

  /** O ator precisa ser OWNER ou ADMIN do servidor. */
  async assertCanModerate(actorId: string, guildId: string) {
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

  private rank(role: MemberRole): number {
    return role === "OWNER" ? 3 : role === "ADMIN" ? 2 : 1;
  }
}
