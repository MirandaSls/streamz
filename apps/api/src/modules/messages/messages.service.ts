import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import type { Message as MessageDTO, ReactionGroup } from "@newdisc/shared";

const MESSAGE_INCLUDE = {
  author: true,
  reactions: true,
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
  ) {}

  async create(channelId: string, authorId: string, content: string): Promise<MessageDTO> {
    // valida existência do canal + associação do autor ao servidor
    await this.guilds.assertChannelMember(authorId, channelId);

    const msg = await this.prisma.message.create({
      data: { channelId, authorId, content },
      include: MESSAGE_INCLUDE,
    });
    return this.toDTO(msg);
  }

  /** Histórico paginado por cursor (mais recentes primeiro), devolvido em ordem cronológica. */
  async history(
    channelId: string,
    userId: string,
    cursor?: string,
    take = 50,
  ): Promise<MessageDTO[]> {
    await this.guilds.assertChannelMember(userId, channelId);
    const rows = await this.prisma.message.findMany({
      where: { channelId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return rows.map((m) => this.toDTO(m)).reverse();
  }

  /** Busca por conteúdo dentro de um canal (mais recentes primeiro). */
  async search(
    channelId: string,
    userId: string,
    query: string,
    take = 30,
  ): Promise<MessageDTO[]> {
    await this.guilds.assertChannelMember(userId, channelId);
    const q = query.trim();
    if (!q) return [];
    const rows = await this.prisma.message.findMany({
      where: { channelId, content: { contains: q } },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map((m) => this.toDTO(m));
  }

  /** Edição: só o autor (e ainda membro do servidor) pode editar. */
  async edit(messageId: string, userId: string, content: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.guilds.assertChannelMember(userId, msg.channelId);
    if (msg.authorId !== userId) throw new ForbiddenException("Você só pode editar suas mensagens");

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    return this.toDTO(updated);
  }

  /** Remoção: o autor, ou um OWNER/ADMIN do servidor, pode apagar. */
  async remove(messageId: string, userId: string): Promise<{ channelId: string }> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { channel: true },
    });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");

    if (msg.authorId !== userId) {
      const member = await this.prisma.guildMember.findUnique({
        where: { userId_guildId: { userId, guildId: msg.channel.guildId } },
      });
      const canModerate = member?.role === "OWNER" || member?.role === "ADMIN";
      if (!canModerate) throw new ForbiddenException("Sem permissão para apagar esta mensagem");
    }

    await this.prisma.message.delete({ where: { id: messageId } });
    return { channelId: msg.channelId };
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.guilds.assertChannelMember(userId, msg.channelId);
    await this.prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji },
      update: {},
    });
    return this.getDTO(messageId);
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.guilds.assertChannelMember(userId, msg.channelId);
    await this.prisma.reaction
      .delete({ where: { messageId_userId_emoji: { messageId, userId, emoji } } })
      .catch(() => undefined); // idempotente: já não existia
    return this.getDTO(messageId);
  }

  /** Busca uma mensagem completa (autor + reações) e devolve o DTO. */
  async getDTO(messageId: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    return this.toDTO(msg);
  }

  private toDTO(m: {
    id: string;
    channelId: string;
    content: string;
    createdAt: Date;
    editedAt: Date | null;
    author: { id: string; username: string; avatarUrl: string | null; status: string };
    reactions: { emoji: string; userId: string }[];
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
      reactions: this.groupReactions(m.reactions),
    };
  }

  private groupReactions(rows: { emoji: string; userId: string }[]): ReactionGroup[] {
    const map = new Map<string, ReactionGroup>();
    for (const r of rows) {
      const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [] };
      g.count += 1;
      g.userIds.push(r.userId);
      map.set(r.emoji, g);
    }
    return Array.from(map.values());
  }
}
