import { BadRequestException, Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { DMChannelView, DirectMessage, PublicUser, UserStatus } from "@newdisc/shared";

type ParticipantWithUser = {
  userId: string;
  user: { id: string; username: string; avatarUrl: string | null; status: UserStatus };
};
type ChannelWithParticipants = {
  id: string;
  isGroup: boolean;
  name: string | null;
  participants: ParticipantWithUser[];
};

const WITH_PARTICIPANTS = {
  participants: { include: { user: true } },
} as const;

@Injectable()
export class DMsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Abre (ou reaproveita) o canal de DM 1-a-1 entre dois usuários. */
  async openWith(meId: string, otherUserId: string): Promise<DMChannelView> {
    if (meId === otherUserId) {
      throw new BadRequestException("Não é possível abrir DM consigo mesmo");
    }
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException("Usuário não encontrado");

    // upsert por pairKey → idempotente e à prova de corrida (1 canal por dupla)
    const [a, b] = this.pair(meId, otherUserId);
    const channel = await this.prisma.dMChannel.upsert({
      where: { pairKey: `${a}:${b}` },
      create: {
        pairKey: `${a}:${b}`,
        isGroup: false,
        participants: { create: [{ userId: a }, { userId: b }] },
      },
      update: {},
      include: WITH_PARTICIPANTS,
    });
    return this.toView(channel, meId);
  }

  /** Cria um grupo de DM (3+ participantes, contando o criador). */
  async createGroup(meId: string, userIds: string[], name?: string): Promise<DMChannelView> {
    const ids = Array.from(new Set([meId, ...userIds]));
    if (ids.length < 3) {
      throw new BadRequestException("Um grupo precisa de ao menos 3 participantes");
    }
    const found = await this.prisma.user.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new NotFoundException("Algum participante não existe");

    const channel = await this.prisma.dMChannel.create({
      data: {
        isGroup: true,
        name: name?.trim() || null,
        ownerId: meId,
        participants: { create: ids.map((userId) => ({ userId })) },
      },
      include: WITH_PARTICIPANTS,
    });
    return this.toView(channel, meId);
  }

  /** Lista as conversas (1-a-1 e grupos) das quais o usuário participa. */
  async list(meId: string): Promise<DMChannelView[]> {
    const channels = await this.prisma.dMChannel.findMany({
      where: { participants: { some: { userId: meId } } },
      include: WITH_PARTICIPANTS,
      orderBy: { createdAt: "desc" },
    });
    return channels.map((c) => this.toView(c, meId));
  }

  async history(meId: string, dmChannelId: string, cursor?: string, take = 50): Promise<DirectMessage[]> {
    await this.assertParticipant(meId, dmChannelId);
    const rows = await this.prisma.dMMessage.findMany({
      where: { dmChannelId },
      include: { author: true },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return rows.map((m) => this.toDTO(m)).reverse();
  }

  /** Cria mensagem de DM e devolve o DTO + os ids dos participantes (para broadcast). */
  async createMessage(meId: string, dmChannelId: string, content: string) {
    const participantIds = await this.assertParticipant(meId, dmChannelId);
    const msg = await this.prisma.dMMessage.create({
      data: { dmChannelId, authorId: meId, content },
      include: { author: true },
    });
    return { message: this.toDTO(msg), participants: participantIds };
  }

  /** Garante que o usuário participa da conversa; devolve os ids de todos os participantes. */
  private async assertParticipant(meId: string, dmChannelId: string): Promise<string[]> {
    const channel = await this.prisma.dMChannel.findUnique({
      where: { id: dmChannelId },
      include: { participants: { select: { userId: true } } },
    });
    if (!channel) throw new NotFoundException("Conversa não encontrada");
    const ids = channel.participants.map((p) => p.userId);
    if (!ids.includes(meId)) {
      throw new ForbiddenException("Você não participa desta conversa");
    }
    return ids;
  }

  /** Canonicaliza o par (ordem estável) para garantir 1 canal por dupla. */
  private pair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private toView(channel: ChannelWithParticipants, meId: string): DMChannelView {
    const others = channel.participants
      .filter((p) => p.userId !== meId)
      .map((p) => this.toPublic(p.user));
    return { id: channel.id, isGroup: channel.isGroup, name: channel.name, others };
  }

  private toPublic(u: { id: string; username: string; avatarUrl: string | null; status: UserStatus }): PublicUser {
    return { id: u.id, username: u.username, avatarUrl: u.avatarUrl, status: u.status };
  }

  private toDTO(m: {
    id: string;
    dmChannelId: string;
    content: string;
    createdAt: Date;
    editedAt: Date | null;
    author: { id: string; username: string; avatarUrl: string | null; status: UserStatus };
  }): DirectMessage {
    return {
      id: m.id,
      dmChannelId: m.dmChannelId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      author: this.toPublic(m.author),
    };
  }
}
