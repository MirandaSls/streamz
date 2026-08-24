import { BadRequestException, Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { DMChannelView, DirectMessage, PublicUser } from "@newdisc/shared";

@Injectable()
export class DMsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Abre (ou reaproveita) o canal de DM entre dois usuários. */
  async openWith(meId: string, otherUserId: string): Promise<DMChannelView> {
    if (meId === otherUserId) {
      throw new BadRequestException("Não é possível abrir DM consigo mesmo");
    }
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException("Usuário não encontrado");

    const [userAId, userBId] = this.pair(meId, otherUserId);
    const channel = await this.prisma.dMChannel.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId },
      update: {},
    });
    return { id: channel.id, other: this.toPublic(other) };
  }

  /** Lista as conversas de DM do usuário (com o "outro" participante). */
  async list(meId: string): Promise<DMChannelView[]> {
    const channels = await this.prisma.dMChannel.findMany({
      where: { OR: [{ userAId: meId }, { userBId: meId }] },
      include: { userA: true, userB: true },
      orderBy: { createdAt: "desc" },
    });
    return channels.map((c) => {
      const other = c.userAId === meId ? c.userB : c.userA;
      return { id: c.id, other: this.toPublic(other) };
    });
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
    const channel = await this.assertParticipant(meId, dmChannelId);
    const msg = await this.prisma.dMMessage.create({
      data: { dmChannelId, authorId: meId, content },
      include: { author: true },
    });
    return {
      message: this.toDTO(msg),
      participants: [channel.userAId, channel.userBId] as [string, string],
    };
  }

  private async assertParticipant(meId: string, dmChannelId: string) {
    const channel = await this.prisma.dMChannel.findUnique({ where: { id: dmChannelId } });
    if (!channel) throw new NotFoundException("Conversa não encontrada");
    if (channel.userAId !== meId && channel.userBId !== meId) {
      throw new ForbiddenException("Você não participa desta conversa");
    }
    return channel;
  }

  /** Canonicaliza o par (ordem estável) para garantir 1 canal por dupla. */
  private pair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private toPublic(u: { id: string; username: string; avatarUrl: string | null; status: string }): PublicUser {
    return { id: u.id, username: u.username, avatarUrl: u.avatarUrl, status: u.status as PublicUser["status"] };
  }

  private toDTO(m: {
    id: string;
    dmChannelId: string;
    content: string;
    createdAt: Date;
    editedAt: Date | null;
    author: { id: string; username: string; avatarUrl: string | null; status: string };
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
