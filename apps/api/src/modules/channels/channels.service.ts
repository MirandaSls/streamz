import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import type { ChannelType } from "@newdisc/shared";

interface CreateChannelOpts {
  isPrivate?: boolean;
  readOnly?: boolean;
  /** membros (papel MEMBER) liberados de início num canal privado. */
  memberIds?: string[];
}

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
  ) {}

  async create(
    userId: string,
    guildId: string,
    name: string,
    type: ChannelType,
    opts: CreateChannelOpts = {},
  ) {
    const isPrivate = !!opts.isPrivate;
    const readOnly = !!opts.readOnly;

    // criar canal privado/somente-leitura exige moderação; canal comum, só ser membro
    if (isPrivate || readOnly) {
      await this.guilds.assertModerator(userId, guildId);
    } else {
      await this.guilds.assertMember(userId, guildId);
    }

    const count = await this.prisma.channel.count({ where: { guildId } });
    const channel = await this.prisma.channel.create({
      data: { guildId, name, type, position: count, private: isPrivate, readOnly },
    });

    if (isPrivate && opts.memberIds?.length) {
      await this.grantAccess(guildId, channel.id, opts.memberIds);
    }
    return channel;
  }

  async listForGuild(userId: string, guildId: string) {
    const member = await this.guilds.assertMember(userId, guildId);
    const channels = await this.prisma.channel.findMany({
      where: { guildId },
      orderBy: { position: "asc" },
    });
    if (member.role === "OWNER" || member.role === "ADMIN") return channels;

    const allowed = await this.prisma.channelMember.findMany({
      where: { userId, channel: { guildId } },
      select: { channelId: true },
    });
    const allowedSet = new Set(allowed.map((a) => a.channelId));
    return channels.filter((c) => !c.private || allowedSet.has(c.id));
  }

  // ── allowlist de canal privado (só moderação) ──────────────────

  async listMembers(actorId: string, guildId: string, channelId: string) {
    await this.guilds.assertModerator(actorId, guildId);
    await this.assertChannelInGuild(channelId, guildId);
    const rows = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: { user: true },
    });
    return rows.map((r) => ({
      user: {
        id: r.user.id,
        username: r.user.username,
        avatarUrl: r.user.avatarUrl,
        status: r.user.status,
      },
    }));
  }

  async addMember(actorId: string, guildId: string, channelId: string, targetUserId: string) {
    await this.guilds.assertModerator(actorId, guildId);
    await this.assertChannelInGuild(channelId, guildId);
    await this.grantAccess(guildId, channelId, [targetUserId]);
    return { added: targetUserId };
  }

  async removeMember(actorId: string, guildId: string, channelId: string, targetUserId: string) {
    await this.guilds.assertModerator(actorId, guildId);
    await this.assertChannelInGuild(channelId, guildId);
    await this.prisma.channelMember
      .delete({ where: { channelId_userId: { channelId, userId: targetUserId } } })
      .catch(() => undefined); // idempotente
    return { removed: targetUserId };
  }

  /** Libera acesso apenas a quem é membro do servidor (ignora ids inválidos). */
  private async grantAccess(guildId: string, channelId: string, userIds: string[]) {
    const ids = Array.from(new Set(userIds));
    const members = await this.prisma.guildMember.findMany({
      where: { guildId, userId: { in: ids } },
      select: { userId: true },
    });
    await this.prisma.$transaction(
      members.map((m) =>
        this.prisma.channelMember.upsert({
          where: { channelId_userId: { channelId, userId: m.userId } },
          create: { channelId, userId: m.userId },
          update: {},
        }),
      ),
    );
  }

  private async assertChannelInGuild(channelId: string, guildId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    if (channel.guildId !== guildId) {
      throw new ForbiddenException("Canal não pertence a este servidor");
    }
  }
}
