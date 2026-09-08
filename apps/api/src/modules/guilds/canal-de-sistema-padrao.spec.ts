import { describe, expect, it } from "vitest";
import { GuildsService } from "./guilds.service";
import { CANAL_TEXTO_INICIAL, CANAL_VOZ_INICIAL } from "./categorias-padrao";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * Servidor novo nasce com canal de sistema, como no Discord.
 *
 * O defeito: `OnboardingService.announceJoin` volta cedo quando
 * `Guild.systemChannelId` é null, e a criação de servidor nunca preenchia o
 * campo — ou seja, "X entrou no servidor" não aparecia em servidor nenhum até
 * o dono escolher o canal à mão em Configurações → Visão geral. O typecheck não
 * pega isto (a coluna é nullable de propósito: campo vazio = anúncio
 * desligado), só um teste da costura entre criar o servidor e gravar o campo.
 */

interface LinhaCanal {
  id: string;
  guildId: string;
  name: string | null;
  type: string;
  position: number;
  categoryId: string | null;
  createdAt: Date;
}

function servicoCom() {
  const canais: LinhaCanal[] = [];
  const categorias: { id: string; guildId: string; name: string; position: number }[] = [];
  const gravado: { systemChannelId?: string | null } = {};
  let seq = 0;

  const channel = {
    findMany: async ({ where }: { where: { guildId: string; categoryId?: null } }) =>
      canais
        .filter(
          (c) =>
            c.guildId === where.guildId &&
            (where.categoryId === undefined || c.categoryId === where.categoryId),
        )
        .sort((a, b) => a.position - b.position || +a.createdAt - +b.createdAt)
        .map((c) => ({ ...c })),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { categoryId: string; position: number };
    }) => {
      const linha = canais.find((c) => c.id === where.id)!;
      Object.assign(linha, data);
      return linha;
    },
  };
  const category = {
    count: async ({ where }: { where: { guildId: string } }) =>
      categorias.filter((c) => c.guildId === where.guildId).length,
    create: async ({ data }: { data: { guildId: string; name: string; position: number } }) => {
      const linha = { id: `cat${++seq}`, ...data };
      categorias.push(linha);
      return linha;
    },
  };
  const guild = {
    create: async ({
      data,
    }: {
      data: {
        name: string;
        ownerId: string;
        channels: { create: { name: string; type: string; position: number }[] };
      };
    }) => {
      // o `create` aninhado do Prisma: os canais nascem junto, soltos
      for (const c of data.channels.create) {
        canais.push({
          id: `canal${++seq}`,
          guildId: "g1",
          name: c.name,
          type: c.type,
          position: c.position,
          categoryId: null,
          // ordem de criação: o mesmo desempate que o banco daria
          createdAt: new Date(2026, 0, 1, 0, 0, seq),
        });
      }
      return {
        id: "g1",
        name: data.name,
        ownerId: data.ownerId,
        iconUrl: null,
        description: null,
        bannerColor: null,
        systemChannelId: null,
        createdAt: new Date(2026, 0, 1),
      };
    },
    update: async ({ data }: { data: { systemChannelId?: string | null } }) => {
      Object.assign(gravado, data);
      return { id: "g1", ...data };
    },
  };
  const prisma = {
    guild,
    category,
    channel,
    $transaction: async <T>(fn: (t: { category: unknown; channel: unknown }) => Promise<T>) =>
      fn({ category, channel }),
  };
  const realtime = {
    joinGuildRoom: () => {},
    joinChannelRooms: () => {},
    emitToUser: () => {},
  };
  const naoUsado = null as never;
  const s = new GuildsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
    naoUsado,
    naoUsado,
    naoUsado,
  );
  return { s, canais, gravado };
}

describe("GuildsService.create — canal de sistema", () => {
  it("aponta o canal de sistema para o primeiro canal de texto (#geral)", async () => {
    const { s, canais, gravado } = servicoCom();

    const criado = await s.create("dono", "Meu servidor");

    const geral = canais.find((c) => c.name === CANAL_TEXTO_INICIAL)!;
    expect(geral.type).toBe("TEXT");
    expect(gravado.systemChannelId).toBe(geral.id);
    // o canal de voz tem o mesmo nome-conceito e nasce logo depois: não é ele
    expect(canais.find((c) => c.name === CANAL_VOZ_INICIAL)!.id).not.toBe(
      gravado.systemChannelId,
    );
    expect(criado.channels).toHaveLength(2);
  });
});
