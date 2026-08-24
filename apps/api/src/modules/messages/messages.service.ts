import {
  BadRequestException,
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
  _count: { select: { replies: true } },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
  ) {}

  async create(
    channelId: string,
    authorId: string,
    content: string,
    parentId?: string,
  ): Promise<MessageDTO> {
    // valida existência do canal + associação do autor ao servidor
    await this.guilds.assertChannelMember(authorId, channelId);

    if (parentId) {
      // resposta: o pai precisa existir, ser do mesmo canal e ser uma raiz
      const parent = await this.prisma.message.findUnique({
        where: { id: parentId },
        select: { channelId: true, parentId: true },
      });
      if (!parent || parent.channelId !== channelId) {
        throw new NotFoundException("Mensagem raiz não encontrada");
      }
      if (parent.parentId) {
        throw new BadRequestException("Não é possível responder a uma resposta");
      }
    }

    const msg = await this.prisma.message.create({
      data: { channelId, authorId, content, parentId: parentId ?? null },
      include: MESSAGE_INCLUDE,
    });
    return this.toDTO(msg);
  }

  /**
   * Histórico paginado por cursor (mais recentes primeiro), devolvido em ordem
   * cronológica. Só mensagens-raiz — respostas de thread vêm por `thread()`.
   */
  async history(
    channelId: string,
    userId: string,
    cursor?: string,
    take = 50,
  ): Promise<MessageDTO[]> {
    await this.guilds.assertChannelMember(userId, channelId);
    const rows = await this.prisma.message.findMany({
      where: { channelId, parentId: null },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return rows.map((m) => this.toDTO(m)).reverse();
  }

  /** Uma thread: a mensagem-raiz seguida das respostas em ordem cronológica. */
  async thread(channelId: string, userId: string, parentId: string): Promise<MessageDTO[]> {
    await this.guilds.assertChannelMember(userId, channelId);
    const parent = await this.prisma.message.findUnique({
      where: { id: parentId },
      include: MESSAGE_INCLUDE,
    });
    if (!parent || parent.channelId !== channelId || parent.parentId) {
      throw new NotFoundException("Thread não encontrada");
    }
    const replies = await this.prisma.message.findMany({
      where: { parentId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return [parent, ...replies].map((m) => this.toDTO(m));
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
  async remove(
    messageId: string,
    userId: string,
  ): Promise<{ channelId: string; parentId: string | null }> {
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

    // apagar uma raiz remove as respostas em cascata (onDelete: Cascade)
    await this.prisma.message.delete({ where: { id: messageId } });
    return { channelId: msg.channelId, parentId: msg.parentId };
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
    parentId: string | null;
    createdAt: Date;
    editedAt: Date | null;
    author: { id: string; username: string; avatarUrl: string | null; status: string };
    reactions: { emoji: string; userId: string }[];
    _count: { replies: number };
  }): MessageDTO {
    return {
      id: m.id,
      channelId: m.channelId,
      content: m.content,
      parentId: m.parentId,
      replyCount: m._count.replies,
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
