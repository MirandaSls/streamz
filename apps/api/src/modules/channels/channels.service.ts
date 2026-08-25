import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Permission, WS_EVENTS } from "@newdisc/shared";
import type { Channel, GuildChannelType } from "@newdisc/shared";
import { toChannelDTO, toPublicUser } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";

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
    private readonly realtime: RealtimeService,
  ) {}

  async create(
    userId: string,
    guildId: string,
    name: string,
    type: GuildChannelType,
    opts: CreateChannelOpts = {},
  ): Promise<Channel> {
    const isPrivate = !!opts.isPrivate;
    const readOnly = !!opts.readOnly;

    // criar canal privado/somente-leitura exige moderação; canal comum, só ser membro
    if (isPrivate || readOnly) {
      await this.guilds.assertCanModerate(userId, guildId, Permission.MANAGE_CHANNELS);
    } else {
      await this.guilds.assertMember(userId, guildId);
    }

    const count = await this.prisma.channel.count({ where: { guildId } });
    const channel = await this.prisma.channel.create({
      data: { guildId, name, type, position: count, private: isPrivate, readOnly },
    });

    // `private`/`readOnly` são espelho: quem autoriza é o override do @everyone
    if (isPrivate || readOnly) {
      await this.guilds.applyChannelFlags(guildId, channel.id, { private: isPrivate, readOnly });
    }
    if (isPrivate && opts.memberIds?.length) {
      await this.grantAccess(guildId, channel.id, opts.memberIds);
    }
    const dto = toChannelDTO(channel);
    // quem enxerga o canal entra na sala agora e vê o canal aparecer na lista
    const viewers = await this.guilds.viewersOfChannel(channel);
    this.realtime.joinChannelRooms(viewers, channel.id);
    this.realtime.emitToUsers(viewers, WS_EVENTS.CHANNEL_CREATED, dto);
    return dto;
  }

  async listForGuild(userId: string, guildId: string): Promise<Channel[]> {
    await this.guilds.assertMember(userId, guildId);
    const channels = await this.prisma.channel.findMany({
      where: { guildId },
      orderBy: { position: "asc" },
    });
    // quem enxerga o quê é `VIEW_CHANNEL` na permissão do canal (ADR-0002)
    const visiveis = await this.guilds.visibleChannelsForUser(userId);
    const podeVer = new Set(visiveis.map((c) => c.id));
    return channels.filter((c) => podeVer.has(c.id)).map((c) => toChannelDTO(c));
  }

  /** Renomeia (e/ou muda somente-leitura). Só moderação. */
  async update(
    actorId: string,
    guildId: string,
    channelId: string,
    patch: { name?: string; readOnly?: boolean },
  ): Promise<Channel> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) throw new BadRequestException("Nome vazio");
    const channel = await this.prisma.channel.update({
      where: { id: channelId },
      data: { ...(name ? { name } : {}), ...(patch.readOnly !== undefined ? { readOnly: patch.readOnly } : {}) },
    });
    // somente-leitura é deny SEND_MESSAGES no @everyone; o booleano é espelho
    if (patch.readOnly !== undefined) {
      await this.guilds.applyChannelFlags(guildId, channelId, { readOnly: patch.readOnly });
    }
    const dto = toChannelDTO(channel);
    this.realtime.emitToUsers(await this.guilds.viewersOfChannel(channel), WS_EVENTS.CHANNEL_UPDATED, dto);
    return dto;
  }

  /** Apaga o canal e suas mensagens. Só moderação; o último canal de texto fica. */
  async remove(actorId: string, guildId: string, channelId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    if (channel.type === "TEXT") {
      const restantes = await this.prisma.channel.count({ where: { guildId, type: "TEXT" } });
      if (restantes <= 1) throw new BadRequestException("O servidor precisa de ao menos um canal de texto");
    }
    const viewers = await this.guilds.viewersOfChannel(channel);
    await this.prisma.channel.delete({ where: { id: channelId } });
    this.realtime.emitToUsers(viewers, WS_EVENTS.CHANNEL_DELETED, { channelId, guildId });
    this.realtime.closeChannelRoom(channelId);
    return { deleted: channelId };
  }

  // ── allowlist de canal privado (só moderação) ──────────────────

  async listMembers(actorId: string, guildId: string, channelId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    const rows = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: { user: true },
    });
    return rows.map((r) => ({ user: toPublicUser(r.user) }));
  }

  async addMember(actorId: string, guildId: string, channelId: string, targetUserId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    await this.grantAccess(guildId, channelId, [targetUserId]);
    return { added: targetUserId };
  }

  async removeMember(actorId: string, guildId: string, channelId: string, targetUserId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    await this.prisma.channelMember
      .delete({ where: { channelId_userId: { channelId, userId: targetUserId } } })
      .catch(() => undefined); // idempotente
    // a allowlist é espelhada em override de usuário — as duas saem juntas
    await this.guilds.revokeChannelView(channelId, targetUserId);
    // corta a sala ao vivo: sem isso ele seguiria recebendo o canal privado
    this.realtime.leaveChannelRooms(targetUserId, [channelId]);
    this.realtime.emitToUser(targetUserId, WS_EVENTS.CHANNEL_DELETED, { channelId, guildId });
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
    // a allowlist é espelhada em override de usuário (allow VIEW_CHANNEL)
    for (const m of members) await this.guilds.grantChannelView(channelId, m.userId);
    // quem acabou de ganhar acesso passa a ver o canal e a receber ao vivo
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (channel) {
      const ids2 = members.map((m) => m.userId);
      this.realtime.joinChannelRooms(ids2, channelId);
      this.realtime.emitToUsers(ids2, WS_EVENTS.CHANNEL_CREATED, toChannelDTO(channel));
    }
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
