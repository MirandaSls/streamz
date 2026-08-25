import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { StorageService } from "../storage/storage.service";
import type { Attachment, Message as MessageDTO, ReactionGroup } from "@newdisc/shared";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@newdisc/shared";
import { toPublicUser, type PublicUserRow } from "../../common/dto";

const MESSAGE_INCLUDE = {
  author: true,
  reactions: true,
  attachments: true,
  channel: { select: { guildId: true } },
  _count: { select: { replies: true } },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly storage: StorageService,
  ) {}

  async create(
    channelId: string,
    authorId: string,
    content: string,
    parentId?: string,
    attachmentIds?: string[],
  ): Promise<MessageDTO> {
    // valida canal + associação + permissão de postar (privado/somente-leitura)
    await this.guilds.assertCanPostChannel(authorId, channelId);

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

    // vincula só anexos do próprio autor e ainda soltos (evita forjar/roubar)
    const ids = (attachmentIds ?? []).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
    if (ids.length > 0) {
      await this.prisma.attachment.updateMany({
        where: { id: { in: ids }, uploaderId: authorId, messageId: null },
        data: { messageId: msg.id },
      });
      return this.getDTO(msg.id); // recarrega com os anexos vinculados
    }
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
    await this.guilds.assertCanViewChannel(userId, channelId);
    const rows = await this.prisma.message.findMany({
      where: { channelId, parentId: null },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const dtos = await Promise.all(rows.map((m) => this.toDTO(m)));
    return dtos.reverse();
  }

  /** Uma thread: a mensagem-raiz seguida das respostas em ordem cronológica. */
  async thread(channelId: string, userId: string, parentId: string): Promise<MessageDTO[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
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
    return Promise.all([parent, ...replies].map((m) => this.toDTO(m)));
  }

  /** Busca por conteúdo dentro de um canal (mais recentes primeiro). */
  async search(
    channelId: string,
    userId: string,
    query: string,
    take = 30,
  ): Promise<MessageDTO[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const q = query.trim();
    if (!q) return [];
    // `mode: "insensitive"` é obrigatório no Postgres: lá `contains` casa
    // maiúsculas/minúsculas, e busca de chat sensível a caixa é inútil.
    const rows = await this.prisma.message.findMany({
      where: { channelId, content: { contains: q, mode: "insensitive" } },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
    });
    return Promise.all(rows.map((m) => this.toDTO(m)));
  }

  /** Edição: só o autor (e ainda membro do servidor) pode editar. */
  async edit(messageId: string, userId: string, content: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.guilds.assertCanViewChannel(userId, msg.channelId);
    if (msg.authorId !== userId) throw new ForbiddenException("Você só pode editar suas mensagens");

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    return this.toDTO(updated);
  }

  /**
   * Remoção: o autor, ou um OWNER/ADMIN do servidor, pode apagar. Em conversa
   * direta não há moderador — só o autor apaga (canModerateChannel devolve false).
   */
  async remove(
    messageId: string,
    userId: string,
  ): Promise<{ channelId: string; parentId: string | null }> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");

    if (msg.authorId !== userId) {
      const canModerate = await this.guilds.canModerateChannel(userId, msg.channelId);
      if (!canModerate) throw new ForbiddenException("Sem permissão para apagar esta mensagem");
    } else {
      // autor: ainda precisa ter acesso ao canal (não foi expulso/removido)
      await this.guilds.assertCanViewChannel(userId, msg.channelId);
    }

    // apagar uma raiz remove as respostas em cascata (onDelete: Cascade)
    await this.prisma.message.delete({ where: { id: messageId } });
    return { channelId: msg.channelId, parentId: msg.parentId };
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.guilds.assertCanViewChannel(userId, msg.channelId);
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
    await this.guilds.assertCanViewChannel(userId, msg.channelId);
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

  /**
   * DTO da mensagem. Assíncrono porque a URL de cada anexo é assinada na hora
   * (URL com expiração; ver StorageService.attachmentUrl).
   */
  private async toDTO(m: {
    id: string;
    channelId: string;
    channel: { guildId: string | null };
    content: string;
    parentId: string | null;
    createdAt: Date;
    editedAt: Date | null;
    author: PublicUserRow;
    reactions: { emoji: string; userId: string }[];
    attachments: {
      id: string;
      key: string;
      filename: string;
      contentType: string;
      size: number;
      width: number | null;
      height: number | null;
    }[];
    _count: { replies: number };
  }): Promise<MessageDTO> {
    return {
      id: m.id,
      channelId: m.channelId,
      guildId: m.channel.guildId,
      content: m.content,
      parentId: m.parentId,
      replyCount: m._count.replies,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      author: toPublicUser(m.author),
      reactions: this.groupReactions(m.reactions),
      attachments: await Promise.all(m.attachments.map((a) => this.toAttachmentDTO(a))),
    };
  }

  private async toAttachmentDTO(a: {
    id: string;
    key: string;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
  }): Promise<Attachment> {
    return {
      id: a.id,
      url: await this.storage.attachmentUrl(a.id, a.key),
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      width: a.width,
      height: a.height,
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
