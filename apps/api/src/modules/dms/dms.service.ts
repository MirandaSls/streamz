import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DMChannelView, DMLeaveResult } from "@newdisc/shared";
import {
  toChannelDTO,
  toPublicUser,
  type ChannelReadSummary,
  type PublicUserRow,
} from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { ReadStateService } from "../read-state/read-state.service";

/**
 * Conversas diretas (DM 1-a-1 e grupos).
 *
 * Desde a ADR-0001 uma conversa é um `Channel` sem servidor (`guildId` null,
 * `type` DM|GROUP) e os participantes são `ChannelMember`. Este service só cuida
 * do que é específico de conversa — abrir, criar grupo, listar, sair. Mensagens,
 * histórico, busca, reação, anexo e thread são os de qualquer canal
 * (`MessagesService`), e a autorização é `GuildsService.assertCanViewChannel`.
 */

type MemberWithUser = { userId: string; user: PublicUserRow };

const WITH_MEMBERS = {
  members: { include: { user: true } },
} as const;

@Injectable()
export class DMsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly readState: ReadStateService,
  ) {}

  /** Abre (ou reaproveita) a conversa 1-a-1 entre dois usuários. */
  async openWith(meId: string, otherUserId: string): Promise<DMChannelView> {
    if (meId === otherUserId) {
      throw new BadRequestException("Não é possível abrir DM consigo mesmo");
    }
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException("Usuário não encontrado");

    // upsert por pairKey → idempotente e à prova de corrida (1 canal por dupla)
    const [a, b] = this.pair(meId, otherUserId);
    const pairKey = `${a}:${b}`;
    const channel = await this.prisma.channel.upsert({
      where: { pairKey },
      create: {
        type: "DM",
        pairKey,
        members: { create: [{ userId: a }, { userId: b }] },
      },
      update: {},
      include: WITH_MEMBERS,
    });
    // quem já está conectado passa a receber a conversa ao vivo na hora
    this.realtime.joinChannelRooms([a, b], channel.id);
    return this.toView(channel, meId);
  }

  /** Cria um grupo (3+ participantes, contando o criador). */
  async createGroup(meId: string, userIds: string[], name?: string): Promise<DMChannelView> {
    const ids = Array.from(new Set([meId, ...userIds]));
    if (ids.length < 3) {
      throw new BadRequestException("Um grupo precisa de ao menos 3 participantes");
    }
    const found = await this.prisma.user.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new NotFoundException("Algum participante não existe");

    const channel = await this.prisma.channel.create({
      data: {
        type: "GROUP",
        name: name?.trim() || null,
        ownerId: meId,
        members: { create: ids.map((userId) => ({ userId })) },
      },
      include: WITH_MEMBERS,
    });
    this.realtime.joinChannelRooms(ids, channel.id);
    return this.toView(channel, meId);
  }

  /**
   * Sai de um grupo. O último a sair leva o grupo junto (as mensagens vão em
   * cascata) — não faz sentido manter conversa sem ninguém dentro. Se quem sai
   * era o dono, a posse passa a outro participante para o grupo não ficar com
   * `ownerId` apontando para fora.
   */
  async leaveGroup(meId: string, channelId: string): Promise<DMLeaveResult> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { members: { select: { userId: true } } },
    });
    if (!channel || channel.guildId !== null) {
      throw new NotFoundException("Conversa não encontrada");
    }
    if (!channel.members.some((p) => p.userId === meId)) {
      throw new ForbiddenException("Você não participa desta conversa");
    }
    if (channel.type !== "GROUP") {
      throw new BadRequestException("Não é possível sair de uma conversa 1-a-1");
    }

    const restantes = channel.members.filter((p) => p.userId !== meId);
    if (restantes.length === 0) {
      await this.prisma.channel.delete({ where: { id: channelId } });
      return { channelId, deleted: true };
    }

    await this.prisma.$transaction([
      this.prisma.channelMember.delete({
        where: { channelId_userId: { channelId, userId: meId } },
      }),
      ...(channel.ownerId === meId
        ? [
            this.prisma.channel.update({
              where: { id: channelId },
              data: { ownerId: restantes[0].userId },
            }),
          ]
        : []),
    ]);
    // corta a sala ao vivo: sem isso ele seguiria recebendo o grupo
    this.realtime.leaveChannelRooms(meId, [channelId]);
    return { channelId, deleted: false };
  }

  /**
   * Lista as conversas (1-a-1 e grupos) das quais o usuário participa, com o
   * resumo de leitura, ordenadas pela última mensagem (como a coluna do Discord).
   */
  async list(meId: string, username: string): Promise<DMChannelView[]> {
    const channels = await this.prisma.channel.findMany({
      where: { guildId: null, members: { some: { userId: meId } } },
      include: WITH_MEMBERS,
      orderBy: { createdAt: "desc" },
    });
    const summaries = await this.readState.summaries(
      meId,
      username,
      channels.map((c) => c.id),
    );
    return channels
      .map((c) => this.toView(c, meId, summaries.get(c.id)))
      .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  }

  /** Uma conversa específica, na visão de quem pede (404 se não participa). */
  async get(meId: string, channelId: string): Promise<DMChannelView> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, guildId: null, members: { some: { userId: meId } } },
      include: WITH_MEMBERS,
    });
    if (!channel) throw new NotFoundException("Conversa não encontrada");
    return this.toView(channel, meId);
  }

  /** Canonicaliza o par (ordem estável) para garantir 1 canal por dupla. */
  private pair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private toView(
    channel: Parameters<typeof toChannelDTO>[0] & { members: MemberWithUser[] },
    meId: string,
    summary?: ChannelReadSummary,
  ): DMChannelView {
    const others = channel.members
      .filter((p) => p.userId !== meId)
      .map((p) => toPublicUser(p.user));
    return { ...toChannelDTO(channel, summary), others };
  }
}
