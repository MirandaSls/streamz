import { Injectable } from "@nestjs/common";
import { mentionsUser } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { ChannelReadSummary } from "../../common/dto";

/**
 * Estado de leitura: até onde cada usuário leu cada canal.
 *
 * É o que alimenta "não lido" (mensagem depois de `lastReadAt`) e o badge de
 * menções (`@username` em mensagem de outro, depois de `lastReadAt`). Não
 * autoriza nada — quem chama já passou por `assertCanViewChannel`.
 */
@Injectable()
export class ReadStateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Marca o canal como lido até agora. */
  async markRead(userId: string, channelId: string, at = new Date()): Promise<Date> {
    await this.prisma.readState.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, lastReadAt: at },
      update: { lastReadAt: at },
    });
    return at;
  }

  /**
   * Resumo de leitura de vários canais de uma vez, na visão de `userId`:
   * três consultas no total, independentemente do número de canais.
   */
  async summaries(
    userId: string,
    username: string,
    channelIds: string[],
  ): Promise<Map<string, ChannelReadSummary>> {
    const out = new Map<string, ChannelReadSummary>();
    if (channelIds.length === 0) return out;

    const [ultimas, lidos, mencoes] = await Promise.all([
      this.prisma.message.groupBy({
        by: ["channelId"],
        where: { channelId: { in: channelIds } },
        _max: { createdAt: true },
      }),
      this.prisma.readState.findMany({
        where: { userId, channelId: { in: channelIds } },
        select: { channelId: true, lastReadAt: true },
      }),
      // candidatas a menção pelo texto; a checagem exata (limite de palavra) é
      // feita em JS porque `contains` não sabe onde a palavra termina
      this.prisma.message.findMany({
        where: {
          channelId: { in: channelIds },
          authorId: { not: userId },
          content: { contains: `@${username}`, mode: "insensitive" },
        },
        select: { channelId: true, createdAt: true, content: true },
      }),
    ]);

    const lastRead = new Map(lidos.map((r) => [r.channelId, r.lastReadAt]));
    for (const id of channelIds) {
      out.set(id, { lastMessageAt: null, lastReadAt: lastRead.get(id) ?? null, mentionCount: 0 });
    }
    for (const u of ultimas) {
      const s = out.get(u.channelId);
      if (s) s.lastMessageAt = u._max.createdAt;
    }
    for (const m of mencoes) {
      const s = out.get(m.channelId);
      if (!s) continue;
      if (s.lastReadAt && m.createdAt <= s.lastReadAt) continue;
      if (mentionsUser(m.content, username)) s.mentionCount += 1;
    }
    return out;
  }

  /** Agrega os resumos de vários canais num "há novidade?" + total de menções. */
  static aggregate(summaries: Iterable<ChannelReadSummary>): { unread: boolean; mentionCount: number } {
    let unread = false;
    let mentionCount = 0;
    for (const s of summaries) {
      mentionCount += s.mentionCount;
      if (s.lastMessageAt && (!s.lastReadAt || s.lastMessageAt > s.lastReadAt)) unread = true;
    }
    return { unread, mentionCount };
  }
}
