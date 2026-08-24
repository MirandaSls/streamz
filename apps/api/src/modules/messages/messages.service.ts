import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { Message as MessageDTO } from "@newdisc/shared";

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(channelId: string, authorId: string, content: string): Promise<MessageDTO> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException("Canal não encontrado");

    const msg = await this.prisma.message.create({
      data: { channelId, authorId, content },
      include: { author: true },
    });
    return this.toDTO(msg);
  }

  /** Histórico paginado por cursor (mais recentes primeiro). */
  async history(channelId: string, cursor?: string, take = 50): Promise<MessageDTO[]> {
    const rows = await this.prisma.message.findMany({
      where: { channelId },
      include: { author: true },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return rows.map((m) => this.toDTO(m)).reverse();
  }

  private toDTO(m: {
    id: string;
    channelId: string;
    content: string;
    createdAt: Date;
    editedAt: Date | null;
    author: { id: string; username: string; avatarUrl: string | null; status: string };
  }): MessageDTO {
    return {
      id: m.id,
      channelId: m.channelId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      author: {
        id: m.author.id,
        username: m.author.username,
        avatarUrl: m.author.avatarUrl,
        status: m.author.status as MessageDTO["author"]["status"],
      },
    };
  }
}
