import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { ReacoesDeCompatService } from "./reacoes.service";
import { lerEmojiDaRota } from "./traducao/emoji";

/**
 * ── F5 ── O que a reação precisa do banco.
 *
 * Duas coisas, e as duas são armadilha:
 *
 * 1. o `:emoji` da rota vem com o **snowflake** do emoji, e a reação é gravada
 *    com o **cuid** dentro de `<:nome:cuid>`. Trocar um pelo outro grava uma
 *    reação que ninguém mais acha;
 * 2. `GET .../reactions/:emoji` pagina por snowflake **do usuário**, porque
 *    `Reaction` não tem número próprio nem `createdAt` — é o cursor `after` do
 *    Discord.
 */

const FESTA = {
  id: "cm1xemoji000000000000000",
  snowflake: 141414141414141414n,
  name: "festa",
  animated: true,
};

function montar() {
  const prisma = {
    customEmoji: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { snowflake?: bigint; id?: string } }) =>
        Promise.resolve(
          where.snowflake === FESTA.snowflake || where.id === FESTA.id ? FESTA : null,
        ),
      ),
    },
    reaction: {
      findMany: vi.fn().mockResolvedValue([
        { user: { id: "u_ana", snowflake: 1n, username: "ana", displayName: null, isBot: false } },
      ]),
    },
  } as unknown as PrismaService;
  return { service: new ReacoesDeCompatService(prisma), prisma };
}

describe("tokenDaRota", () => {
  it("unicode passa direto", async () => {
    const { service } = montar();
    expect(await service.tokenDaRota(lerEmojiDaRota("%F0%9F%91%8D"))).toBe("👍");
  });

  it("personalizado vira `<:nome:cuid>` — com o nome da linha, não o da rota", async () => {
    const { service } = montar();
    // o bot mandou um nome errado de propósito: o Discord ignora o nome
    expect(await service.tokenDaRota(lerEmojiDaRota("qualquer:141414141414141414"))).toBe(
      "<:festa:cm1xemoji000000000000000>",
    );
  });

  it("emoji personalizado que não existe aqui devolve null (o chamador manda 10014)", async () => {
    const { service } = montar();
    expect(await service.tokenDaRota(lerEmojiDaRota("festa:999999999999999999"))).toBeNull();
  });
});

describe("traduzirToken", () => {
  it("resolve o personalizado pelo cuid e devolve o snowflake", async () => {
    const { service } = montar();
    expect(await service.traduzirToken("<:festa:cm1xemoji000000000000000>")).toEqual({
      id: "141414141414141414",
      name: "festa",
      animated: true,
    });
  });

  it("unicode não vai ao banco", async () => {
    const { service, prisma } = montar();
    expect(await service.traduzirToken("👍")).toEqual({ id: null, name: "👍", animated: false });
    expect(prisma.customEmoji.findUnique).not.toHaveBeenCalled();
  });
});

describe("quemReagiu", () => {
  it("ordena e pagina pelo snowflake do usuário, com o teto de 100", async () => {
    const { service, prisma } = montar();
    await service.quemReagiu("m1", "👍", { limit: 500, after: "1234567890123456789" });

    expect(prisma.reaction.findMany).toHaveBeenCalledWith({
      where: { messageId: "m1", emoji: "👍", user: { snowflake: { gt: 1234567890123456789n } } },
      select: { user: { select: expect.anything() } },
      orderBy: { user: { snowflake: "asc" } },
      take: 100,
    });
  });

  it("sem `limit` são 25, e sem `after` não há filtro de cursor", async () => {
    const { service, prisma } = montar();
    await service.quemReagiu("m1", "👍");

    expect(prisma.reaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { messageId: "m1", emoji: "👍" }, take: 25 }),
    );
  });
});
