import { Injectable } from "@nestjs/common";
import { mentionsUser } from "@newdisc/shared";
import type { InboxMention, InboxUnreadChannel, InboxUnreadGroup } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { ReadStateService } from "../read-state/read-state.service";
import { MessagesService } from "./messages.service";

/** Quantas candidatas a menção varremos antes de filtrar pelo "não lido". */
const CANDIDATAS = 200;

/**
 * Caixa de entrada: as menções não lidas do usuário em todos os servidores e
 * conversas, e os canais com novidade.
 *
 * A autorização vem inteira de `visibleChannelsForUser` — a consulta parte da
 * lista de canais que este usuário enxerga, e não há caminho para um canal
 * privado (ou de servidor do qual ele saiu) entrar no resultado.
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly readState: ReadStateService,
    private readonly messages: MessagesService,
  ) {}

  /** Menções não lidas, mais recentes primeiro ("Para você"). */
  async mentions(userId: string, username: string, limit = 25): Promise<InboxMention[]> {
    const canais = await this.guilds.visibleChannelsForUser(userId);
    const ids = canais.map((c) => c.id);
    if (ids.length === 0) return [];
    const resumos = await this.readState.summaries(userId, username, ids);

    const candidatas = await this.prisma.message.findMany({
      where: {
        channelId: { in: ids },
        authorId: { not: userId },
        OR: [
          { content: { contains: `@${username}`, mode: "insensitive" } },
          { replyMention: true, replyTo: { authorId: userId } },
        ],
      },
      select: {
        id: true,
        channelId: true,
        createdAt: true,
        content: true,
        replyMention: true,
        replyTo: { select: { authorId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: CANDIDATAS,
    });

    const naoLidas = candidatas.filter((m) => {
      const resumo = resumos.get(m.channelId);
      if (resumo?.lastReadAt && m.createdAt <= resumo.lastReadAt) return false;
      // o `contains` do banco não sabe onde a palavra termina (`@ana` casaria
      // `@anabela`); a resposta-menção, essa, já veio exata do banco
      return (
        mentionsUser(m.content, username) ||
        (m.replyMention && m.replyTo?.authorId === userId)
      );
    });

    const escolhidas = naoLidas.slice(0, limit);
    const contexto = await this.contextoDosCanais(escolhidas.map((m) => m.channelId));
    return Promise.all(
      escolhidas.map(async (m) => {
        const canal = contexto.get(m.channelId);
        return {
          message: await this.messages.getDTO(m.id),
          channelName: canal?.name ?? null,
          channelType: canal?.type ?? "TEXT",
          guildId: canal?.guildId ?? null,
          guildName: canal?.guildName ?? null,
        } satisfies InboxMention;
      }),
    );
  }

  /** Canais com não-lido, agrupados por servidor ("Não lidos"). */
  async unread(userId: string, username: string): Promise<InboxUnreadGroup[]> {
    const canais = await this.guilds.visibleChannelsForUser(userId);
    const ids = canais.map((c) => c.id);
    if (ids.length === 0) return [];
    const resumos = await this.readState.summaries(userId, username, ids);
    const contexto = await this.contextoDosCanais(ids);

    const grupos = new Map<string, InboxUnreadGroup>();
    for (const id of ids) {
      const resumo = resumos.get(id);
      if (!resumo?.lastMessageAt) continue;
      if (resumo.lastReadAt && resumo.lastMessageAt <= resumo.lastReadAt) continue;
      const canal = contexto.get(id);
      if (!canal) continue;
      const chave = canal.guildId ?? "@me";
      const grupo =
        grupos.get(chave) ??
        ({
          guildId: canal.guildId,
          guildName: canal.guildName ?? "Mensagens diretas",
          channels: [],
        } satisfies InboxUnreadGroup);
      const item: InboxUnreadChannel = {
        channelId: id,
        channelName: canal.name,
        channelType: canal.type,
        mentionCount: resumo.mentionCount,
        lastMessageAt: resumo.lastMessageAt.toISOString(),
      };
      grupo.channels.push(item);
      grupos.set(chave, grupo);
    }

    for (const grupo of grupos.values()) {
      grupo.channels.sort((a, b) => (a.lastMessageAt ?? "").localeCompare(b.lastMessageAt ?? ""));
      grupo.channels.reverse();
    }
    // conversas diretas primeiro, como no Discord
    return Array.from(grupos.values()).sort((a, b) => (a.guildId ? 1 : 0) - (b.guildId ? 1 : 0));
  }

  /** "Marcar tudo como lido": zera o não-lido de todos os canais visíveis. */
  async markAllRead(userId: string): Promise<{ channels: number }> {
    const canais = await this.guilds.visibleChannelsForUser(userId);
    const agora = new Date();
    await this.prisma.$transaction(
      canais.map((c) =>
        this.prisma.readState.upsert({
          where: { userId_channelId: { userId, channelId: c.id } },
          create: { userId, channelId: c.id, lastReadAt: agora },
          update: { lastReadAt: agora },
        }),
      ),
    );
    return { channels: canais.length };
  }

  /** Nome/tipo do canal e nome do servidor, para rotular cada item da caixa. */
  private async contextoDosCanais(channelIds: string[]) {
    const unicos = Array.from(new Set(channelIds));
    const rows = await this.prisma.channel.findMany({
      where: { id: { in: unicos } },
      select: {
        id: true,
        name: true,
        type: true,
        guildId: true,
        guild: { select: { name: true } },
      },
    });
    return new Map(
      rows.map((c) => [
        c.id,
        {
          name: c.name,
          type: c.type,
          guildId: c.guildId,
          guildName: c.guild?.name ?? null,
        },
      ]),
    );
  }
}
