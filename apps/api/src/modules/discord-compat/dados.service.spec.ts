import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { DadosDeCompatService } from "./dados.service";
import { lerQueryDoHistorico } from "./rest/corpos";

/**
 * O cursor do histórico.
 *
 * O ponto do teste é a **ordenação por snowflake**, e não por `createdAt`: duas
 * mensagens no mesmo milissegundo (o `DEFAULT` do banco resolve isso com os 12
 * bits de incremento) embaralhariam a página e o bot leria a mesma mensagem duas
 * vezes, ou pularia uma. O snowflake é estritamente crescente por construção.
 */

/** Linha crua mínima, do jeito que o `select` do service a devolve. */
function linha(snowflake: bigint, reactions: { emoji: string; userId: string }[] = []) {
  return {
    id: `m_${snowflake}`,
    snowflake,
    content: "oi",
    createdAt: new Date("2026-09-08T12:00:00.000Z"),
    editedAt: null,
    type: "DEFAULT" as const,
    author: { id: "u_1", snowflake: 9n, username: "ze", displayName: null, isBot: false },
    channel: { snowflake: 5n, guildId: "g_1", guild: { snowflake: 3n } },
    attachments: [],
    reactions,
    replyTo: null,
    pin: null,
  };
}

function serviceComMensagens(linhas: ReturnType<typeof linha>[]) {
  const findMany = vi.fn(async (_argumentos: unknown): Promise<unknown[]> => linhas);
  const prisma = { message: { findMany } } as unknown as PrismaService;
  return { service: new DadosDeCompatService(prisma), findMany };
}

/** O `where`/`orderBy`/`take` da n-ésima chamada ao `findMany`. */
function chamada(
  findMany: ReturnType<typeof serviceComMensagens>["findMany"],
  n = 0,
): { where: Record<string, unknown>; orderBy: unknown; take: number } {
  return findMany.mock.calls[n]?.[0] as {
    where: Record<string, unknown>;
    orderBy: unknown;
    take: number;
  };
}

describe("DadosDeCompatService.mensagensDoCanal", () => {
  it("`before` é `snowflake <` e a ordem é decrescente por snowflake", async () => {
    const { service, findMany } = serviceComMensagens([linha(30n), linha(20n)]);

    const saida = await service.mensagensDoCanal("c_1", {
      limit: 50,
      before: 40n,
      paraBotUserId: null,
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = chamada(findMany);
    expect(args.where).toMatchObject({
      channelId: "c_1",
      // resposta de thread não vive na timeline (é o filtro do MessagesService)
      parentId: null,
      snowflake: { lt: 40n },
    });
    expect(args.orderBy).toEqual({ snowflake: "desc" });
    expect(args.take).toBe(50);
    expect(saida.map((m) => m.snowflake)).toEqual([30n, 20n]);
  });

  it("`after` pega as mais antigas depois do cursor e devolve na ordem do Discord", async () => {
    // o banco devolve crescente; a resposta do Discord é sempre decrescente
    const { service, findMany } = serviceComMensagens([linha(11n), linha(12n), linha(13n)]);

    const saida = await service.mensagensDoCanal("c_1", {
      limit: 3,
      after: 10n,
      paraBotUserId: null,
    });

    const args = chamada(findMany);
    expect(args.where).toMatchObject({ snowflake: { gt: 10n } });
    expect(args.orderBy).toEqual({ snowflake: "asc" });
    expect(saida.map((m) => m.snowflake)).toEqual([13n, 12n, 11n]);
  });

  it("`around` é uma consulta para cada lado da mensagem", async () => {
    const { service, findMany } = serviceComMensagens([linha(20n)]);

    await service.mensagensDoCanal("c_1", { limit: 11, around: 20n, paraBotUserId: null });

    expect(findMany).toHaveBeenCalledTimes(2);
    const antes = chamada(findMany, 0);
    const depois = chamada(findMany, 1);
    expect(antes.where).toMatchObject({ snowflake: { lt: 20n } });
    expect(antes.take).toBe(5);
    // `gte`, não `gt`: a própria mensagem do `around` entra na janela
    expect(depois.where).toMatchObject({ snowflake: { gte: 20n } });
    expect(depois.take).toBe(6);
  });

  it("o `limit` é preso em 1..100", async () => {
    const { service, findMany } = serviceComMensagens([]);

    await service.mensagensDoCanal("c_1", { limit: 999, paraBotUserId: null });
    await service.mensagensDoCanal("c_1", { limit: 0, paraBotUserId: null });

    expect(chamada(findMany, 0).take).toBe(100);
    expect(chamada(findMany, 1).take).toBe(1);
  });

  it("agrupa as reações e marca `euReagi` só para o bot da sessão", async () => {
    const { service } = serviceComMensagens([
      linha(20n, [
        { emoji: "👍", userId: "u_1" },
        { emoji: "👍", userId: "bot_1" },
        { emoji: "🎵", userId: "u_1" },
      ]),
    ]);

    const [mensagem] = await service.mensagensDoCanal("c_1", {
      limit: 50,
      paraBotUserId: "bot_1",
    });

    expect(mensagem.reactions).toEqual([
      // `personalizado` é null em emoji unicode (F5): só o `<:nome:cuid>` vai
      // ao banco procurar a linha de `CustomEmoji`
      { emoji: "👍", count: 2, euReagi: true, personalizado: null },
      { emoji: "🎵", count: 1, euReagi: false, personalizado: null },
    ]);
  });
});

describe("lerQueryDoHistorico", () => {
  it("traduz os cursores para bigint e cai no padrão de 50", () => {
    expect(lerQueryDoHistorico({})).toEqual({ limit: 50 });
    expect(lerQueryDoHistorico({ limit: "7", before: "1234567890123456789" })).toEqual({
      limit: 7,
      before: 1234567890123456789n,
    });
  });

  it("ignora cursor que não é snowflake em vez de explodir", () => {
    // `BigInt("lixo")` lança `SyntaxError`; o Discord simplesmente ignora
    expect(lerQueryDoHistorico({ after: "lixo", limit: "abc" })).toEqual({ limit: 50 });
    expect(lerQueryDoHistorico({ limit: "999" })).toEqual({ limit: 100 });
  });
});
