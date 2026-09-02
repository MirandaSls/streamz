import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { mentionsUser } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { ChannelReadSummary } from "../../common/dto";

/**
 * Estado de leitura: até onde cada usuário leu cada canal.
 *
 * É o que alimenta "não lido" (mensagem depois de `lastReadAt`), o badge de
 * menções (`@username`, `<@&cargo meu>` ou `@everyone` em mensagem de outro,
 * depois de `lastReadAt`) e a contagem de não lidas (toda mensagem de outro
 * depois de `lastReadAt` — o número que a conversa mostra). Não autoriza nada
 * — quem chama já passou por `assertCanViewChannel`.
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
   * cinco consultas no total, independentemente do número de canais.
   */
  async summaries(
    userId: string,
    username: string,
    channelIds: string[],
  ): Promise<Map<string, ChannelReadSummary>> {
    const out = new Map<string, ChannelReadSummary>();
    if (channelIds.length === 0) return out;

    // menção a cargo (`<@&id>`) conta para quem tem o cargo (c-cargos). Os ids
    // são cuids únicos, então basta saber quais cargos são meus — em qualquer
    // servidor — para reconhecer a marcação no texto.
    const meusCargos = await this.prisma.guildMemberRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    const roleIds = meusCargos.map((r) => r.roleId);

    const [ultimas, lidos, mencoes, respostas, naoLidas] = await Promise.all([
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
          OR: [
            { content: { contains: `@${username}`, mode: "insensitive" } },
            ...roleIds.map((id) => ({ content: { contains: `<@&${id}>` } })),
          ],
        },
        select: { id: true, channelId: true, createdAt: true, content: true },
      }),
      // resposta a uma mensagem minha com "@ ligado" também é menção (Discord)
      this.prisma.message.findMany({
        where: {
          channelId: { in: channelIds },
          authorId: { not: userId },
          replyMention: true,
          replyTo: { authorId: userId },
        },
        select: { id: true, channelId: true, createdAt: true },
      }),
      this.contarNaoLidas(userId, channelIds),
    ]);

    const lastRead = new Map(lidos.map((r) => [r.channelId, r.lastReadAt]));
    for (const id of channelIds) {
      out.set(id, {
        lastMessageAt: null,
        lastReadAt: lastRead.get(id) ?? null,
        mentionCount: 0,
        unreadCount: naoLidas.get(id) ?? 0,
      });
    }
    for (const u of ultimas) {
      const s = out.get(u.channelId);
      if (s) s.lastMessageAt = u._max.createdAt;
    }
    // uma mensagem que menciona *e* responde a mim conta uma vez só
    const contadas = new Set<string>();
    for (const m of mencoes) {
      const s = out.get(m.channelId);
      if (!s) continue;
      if (s.lastReadAt && m.createdAt <= s.lastReadAt) continue;
      if (!mentionsUser(m.content, username, roleIds)) continue;
      contadas.add(m.id);
      s.mentionCount += 1;
    }
    for (const m of respostas) {
      const s = out.get(m.channelId);
      if (!s || contadas.has(m.id)) continue;
      if (s.lastReadAt && m.createdAt <= s.lastReadAt) continue;
      contadas.add(m.id);
      s.mentionCount += 1;
    }
    return out;
  }

  /**
   * Quantas mensagens de outros chegaram depois do que eu li, por canal.
   *
   * Uma consulta só para todos os canais: o `lastReadAt` é por canal, então o
   * filtro precisa do join com `ReadState` — o `groupBy` do Prisma não compara
   * duas colunas. Canal que nunca abri conta tudo, como o `isUnread` do
   * contrato. Só canais com alguma não lida voltam no mapa.
   */
  private async contarNaoLidas(userId: string, channelIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ channelId: string; n: number }[]>`
      SELECT m."channelId", COUNT(*)::int AS n
      FROM "Message" m
      LEFT JOIN "ReadState" r
        ON r."channelId" = m."channelId" AND r."userId" = ${userId}
      WHERE m."channelId" IN (${Prisma.join(channelIds)})
        AND m."authorId" <> ${userId}
        AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
      GROUP BY m."channelId"
    `;
    return new Map(rows.map((r) => [r.channelId, r.n]));
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
