import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WS_EVENTS } from "@newdisc/shared";
import type {
  ChannelType,
  Guild,
  GuildMemberView,
  GuildWithChannels,
  MemberRole,
} from "@newdisc/shared";
import { toChannelDTO, toGuildDTO, toPublicUser } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { ReadStateService } from "../read-state/read-state.service";

/** O que `assertCanViewChannel` seleciona do canal — o suficiente para decidir. */
export interface ChannelAccessRow {
  id: string;
  guildId: string | null;
  type: ChannelType;
  private: boolean;
  readOnly: boolean;
}

/**
 * Resultado da autorização por canal. União discriminada de propósito: quem
 * chama é obrigado pelo compilador a decidir o que fazer numa conversa direta
 * (`tipo: "dm"`), onde não existe papel, allowlist nem somente-leitura.
 */
export type ChannelAccess =
  | { tipo: "guild"; channel: ChannelAccessRow; member: { role: MemberRole } }
  | { tipo: "dm"; channel: ChannelAccessRow };

/** O mínimo de um canal para decidir quem o enxerga. */
type ChannelRow = { id: string; guildId: string | null; private: boolean };

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly readState: ReadStateService,
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
    this.realtime.joinGuildRoom(ownerId, guild.id);
    for (const c of guild.channels) this.realtime.joinChannelRooms([ownerId], c.id);
    return { ...toGuildDTO(guild), channels: guild.channels.map((c) => toChannelDTO(c)) };
  }

  /** Servidores em que o usuário é membro, com "há novidade?" e menções. */
  async listForUser(userId: string, username: string): Promise<Guild[]> {
    const guilds = await this.prisma.guild.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
    });
    const visible = await this.visibleChannelsForUser(userId);
    const summaries = await this.readState.summaries(
      userId,
      username,
      visible.map((c) => c.id),
    );
    return guilds.map((g) => {
      const mine = visible
        .filter((c) => c.guildId === g.id)
        .map((c) => summaries.get(c.id))
        .filter((s): s is NonNullable<typeof s> => !!s);
      return toGuildDTO(g, ReadStateService.aggregate(mine));
    });
  }

  async getWithChannels(
    userId: string,
    guildId: string,
    username: string,
  ): Promise<GuildWithChannels> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: { channels: { orderBy: { position: "asc" } } },
    });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    const member = await this.assertMember(userId, guildId);
    const channels = await this.filterVisible(userId, member.role, guild.channels);
    const summaries = await this.readState.summaries(
      userId,
      username,
      channels.map((c) => c.id),
    );
    const dtos = channels.map((c) => toChannelDTO(c, summaries.get(c.id)));
    return {
      ...toGuildDTO(guild, ReadStateService.aggregate(summaries.values())),
      channels: dtos,
    };
  }

  async listMembers(userId: string, guildId: string): Promise<GuildMemberView[]> {
    await this.assertMember(userId, guildId);
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    return members.map((m) => ({ role: m.role, user: toPublicUser(m.user) }));
  }

  async assertMember(userId: string, guildId: string) {
    const member = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
    });
    if (!member) throw new ForbiddenException("Você não é membro deste servidor");
    return member;
  }

  // ── visibilidade de canais ─────────────────────────────────

  /** Dos canais de um servidor, os que este membro enxerga. */
  private async filterVisible<T extends ChannelRow>(
    userId: string,
    role: MemberRole,
    channels: T[],
  ): Promise<T[]> {
    if (this.isPrivileged(role)) return channels;
    const privados = channels.filter((c) => c.private);
    if (privados.length === 0) return channels;
    const allowed = await this.prisma.channelMember.findMany({
      where: { userId, channelId: { in: privados.map((c) => c.id) } },
      select: { channelId: true },
    });
    const allowedSet = new Set(allowed.map((a) => a.channelId));
    return channels.filter((c) => !c.private || allowedSet.has(c.id));
  }

  /**
   * Todos os canais que o usuário pode ver, em todos os servidores dele, mais
   * as conversas diretas. É o que o gateway usa para pôr o socket nas salas no
   * connect — e o que alimenta o "não lido" do rail.
   */
  async visibleChannelsForUser(userId: string): Promise<ChannelRow[]> {
    const memberships = await this.prisma.guildMember.findMany({
      where: { userId },
      select: {
        role: true,
        guild: { select: { channels: { select: { id: true, guildId: true, private: true } } } },
      },
    });
    const out: ChannelRow[] = [];
    for (const m of memberships) {
      out.push(...(await this.filterVisible(userId, m.role, m.guild.channels)));
    }
    const dms = await this.prisma.channel.findMany({
      where: { guildId: null, members: { some: { userId } } },
      select: { id: true, guildId: true, private: true },
    });
    return [...out, ...dms];
  }

  /** Ids dos usuários que enxergam um canal (para emitir eventos de estrutura). */
  async viewersOfChannel(channel: ChannelRow): Promise<string[]> {
    if (!channel.guildId) {
      const members = await this.prisma.channelMember.findMany({
        where: { channelId: channel.id },
        select: { userId: true },
      });
      return members.map((m) => m.userId);
    }
    if (!channel.private) {
      const members = await this.prisma.guildMember.findMany({
        where: { guildId: channel.guildId },
        select: { userId: true },
      });
      return members.map((m) => m.userId);
    }
    const [mods, allowed] = await Promise.all([
      this.prisma.guildMember.findMany({
        where: { guildId: channel.guildId, role: { in: ["OWNER", "ADMIN"] } },
        select: { userId: true },
      }),
      this.prisma.channelMember.findMany({
        where: { channelId: channel.id },
        select: { userId: true },
      }),
    ]);
    return Array.from(new Set([...mods, ...allowed].map((m) => m.userId)));
  }

  // ── autorização por canal ──────────────────────────────────

  /**
   * Pode ver/entrar no canal. Ponto único de autorização por canal, para
   * servidor e para conversa direta:
   * - canal de servidor: membro do servidor e, se privado, OWNER/ADMIN ou na
   *   allowlist (`ChannelMember`);
   * - DM/grupo (`guildId` null): ser participante (`ChannelMember`), e ponto —
   *   não há papel nem allowlist.
   */
  async assertCanViewChannel(userId: string, channelId: string): Promise<ChannelAccess> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, guildId: true, type: true, private: true, readOnly: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");

    if (channel.guildId === null) {
      const participante = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { id: true },
      });
      if (!participante) throw new ForbiddenException("Você não participa desta conversa");
      return { tipo: "dm", channel };
    }

    const member = await this.assertMember(userId, channel.guildId);
    if (channel.private && !this.isPrivileged(member.role)) {
      const allowed = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { id: true },
      });
      if (!allowed) throw new ForbiddenException("Canal privado");
    }
    return { tipo: "guild", channel, member: { role: member.role } };
  }

  /**
   * Pode postar: view + se o canal for somente-leitura, precisa ser OWNER/ADMIN.
   * Em conversa direta basta participar (somente-leitura não existe lá).
   */
  async assertCanPostChannel(userId: string, channelId: string): Promise<ChannelAccess> {
    const access = await this.assertCanViewChannel(userId, channelId);
    if (access.tipo === "dm") return access;
    if (access.channel.readOnly && !this.isPrivileged(access.member.role)) {
      throw new ForbiddenException("Canal somente-leitura");
    }
    return access;
  }

  /** Pode moderar mensagens do canal (apagar as dos outros)? Em DM, ninguém. */
  async canModerateChannel(userId: string, channelId: string): Promise<boolean> {
    const access = await this.assertCanViewChannel(userId, channelId);
    return access.tipo === "guild" && this.isPrivileged(access.member.role);
  }

  private isPrivileged(role: MemberRole): boolean {
    return role === "OWNER" || role === "ADMIN";
  }

  // ── ciclo de vida do servidor ──────────────────────────────

  /** Sai do servidor. O dono não sai — apaga (transferência de posse não existe no MVP). */
  async leave(userId: string, guildId: string) {
    const member = await this.assertMember(userId, guildId);
    if (member.role === "OWNER") {
      throw new BadRequestException("O dono não pode sair do servidor — apague-o");
    }
    await this.prisma.guildMember.delete({ where: { userId_guildId: { userId, guildId } } });
    await this.detachFromGuildRooms(guildId, userId);
    // outras abas do próprio usuário também precisam ver o servidor sumir
    this.realtime.emitToUser(userId, WS_EVENTS.GUILD_REMOVED, { guildId, reason: "left" });
    return { left: guildId };
  }

  /** Apaga o servidor (só o dono). Canais, mensagens e convites vão em cascata. */
  async remove(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    if (guild.ownerId !== userId) throw new ForbiddenException("Só o dono apaga o servidor");
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    await this.prisma.guild.delete({ where: { id: guildId } });
    const ids = members.map((m) => m.userId);
    this.realtime.emitToUsers(ids, WS_EVENTS.GUILD_REMOVED, { guildId, reason: "deleted" });
    for (const id of ids) this.realtime.leaveGuildRoom(id, guildId);
    return { deleted: guildId };
  }

  /** Promove a ADMIN ou rebaixa a MEMBER. Só o dono; o dono não muda de papel. */
  async setRole(actorId: string, guildId: string, targetUserId: string, role: MemberRole) {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    if (guild.ownerId !== actorId) throw new ForbiddenException("Só o dono altera papéis");
    if (role === "OWNER" || targetUserId === actorId) {
      throw new BadRequestException("O papel de dono não é transferível por aqui");
    }
    const target = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: targetUserId, guildId } },
    });
    if (!target) throw new NotFoundException("Membro não encontrado");
    await this.prisma.guildMember.update({
      where: { userId_guildId: { userId: targetUserId, guildId } },
      data: { role },
    });
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_UPDATED, {
      guildId,
      userId: targetUserId,
      role,
    });
    // virou/deixou de ser moderação: entra/sai das salas dos canais privados
    const privados = await this.prisma.channel.findMany({
      where: { guildId, private: true },
      select: { id: true },
    });
    if (role === "ADMIN") {
      for (const c of privados) this.realtime.joinChannelRooms([targetUserId], c.id);
    } else {
      const allowed = await this.prisma.channelMember.findMany({
        where: { userId: targetUserId, channelId: { in: privados.map((c) => c.id) } },
        select: { channelId: true },
      });
      const keep = new Set(allowed.map((a) => a.channelId));
      this.realtime.leaveChannelRooms(
        targetUserId,
        privados.map((c) => c.id).filter((id) => !keep.has(id)),
      );
    }
    return { userId: targetUserId, role };
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
      user: toPublicUser(b.user),
    }));
  }

  /** Tira os sockets do ex-membro das salas do servidor e de todos os canais dele. */
  private async detachFromGuildRooms(guildId: string, userId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { guildId },
      select: { id: true },
    });
    this.realtime.leaveChannelRooms(userId, channels.map((c) => c.id));
    this.realtime.leaveGuildRoom(userId, guildId);
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
