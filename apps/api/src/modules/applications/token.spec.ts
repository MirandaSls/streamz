import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { ApplicationsService } from "./applications.service";
import type { PrismaService } from "../../prisma/prisma.service";
import {
  gerarToken,
  hashDoToken,
  snowflakeDoToken,
  tokenDoCabecalho,
  TAMANHO_DO_PREFIXO,
} from "./token";

/**
 * O token de bot: o formato de três partes e a verificação.
 *
 * `GET /api/v10/users/@me` — a prova "de verdade" de que um token vale — só
 * existe na F1. O que dá para provar agora, e é o que está aqui, é o outro
 * lado da mesma moeda: que o token gerado tem a forma que as ferramentas
 * esperam, que o banco guarda só o sha256, e que `verificarToken` acha a
 * aplicação pelo hash e recusa o revogado.
 */

const SNOWFLAKE_DO_BOT = 1382915770057249472n;

describe("formato do token (D3)", () => {
  it("são três partes separadas por ponto", () => {
    const { token } = gerarToken(SNOWFLAKE_DO_BOT);
    const partes = token.split(".");
    expect(partes).toHaveLength(3);
    expect(partes.every((p) => p.length > 0)).toBe(true);
  });

  it("a parte 1 é o id decimal do usuário-bot em base64url", () => {
    const { token } = gerarToken(SNOWFLAKE_DO_BOT);
    const parte1 = token.split(".")[0];
    expect(Buffer.from(parte1, "base64url").toString("ascii")).toBe("1382915770057249472");
    // 19 dígitos → 26 caracteres. É a mesma aritmética que dá os 24 do exemplo
    // do documento, que é de um id de 18 dígitos.
    expect(parte1).toHaveLength(26);
    expect(snowflakeDoToken(token)).toBe(SNOWFLAKE_DO_BOT);
  });

  it("a parte 2 são 4 bytes BE do unix time da emissão (6 caracteres)", () => {
    const agora = new Date("2026-09-08T12:00:00.000Z");
    const { token } = gerarToken(SNOWFLAKE_DO_BOT, agora);
    const parte2 = token.split(".")[1];
    expect(parte2).toHaveLength(6);
    const buf = Buffer.from(parte2, "base64url");
    expect(buf).toHaveLength(4);
    expect(buf.readUInt32BE(0)).toBe(Math.floor(agora.getTime() / 1000));
  });

  it("a parte 3 são 32 bytes aleatórios (43 caracteres) e nunca se repete", () => {
    const a = gerarToken(SNOWFLAKE_DO_BOT).token.split(".")[2];
    const b = gerarToken(SNOWFLAKE_DO_BOT).token.split(".")[2];
    expect(a).toHaveLength(43);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("casa com o padrão que os scanners de segredo procuram", () => {
    const { token } = gerarToken(SNOWFLAKE_DO_BOT);
    // o do TruffleHog para token do Discord
    expect(/[\w-]{24}\.[\w-]{6}\.[\w-]{27}/.test(token)).toBe(true);
  });

  it("o que vai para o banco é o sha256 em hex, e o prefixo tem 8 caracteres", () => {
    const { token, hash, prefixo } = gerarToken(SNOWFLAKE_DO_BOT);
    expect(hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(prefixo).toBe(token.slice(0, TAMANHO_DO_PREFIXO));
    expect(prefixo).toHaveLength(8);
  });

  it("snowflakeDoToken recusa o que não é token", () => {
    expect(snowflakeDoToken("abc")).toBeNull();
    expect(snowflakeDoToken("a.b")).toBeNull();
    expect(snowflakeDoToken("..")).toBeNull();
    // parte 1 legível em base64url, mas não um número
    expect(snowflakeDoToken(`${Buffer.from("oi", "ascii").toString("base64url")}.aa.bb`)).toBeNull();
  });

  it("tokenDoCabecalho exige o prefixo `Bot ` — `Bearer` continua sendo do JwtGuard", () => {
    const { token } = gerarToken(SNOWFLAKE_DO_BOT);
    expect(tokenDoCabecalho(`Bot ${token}`)).toBe(token);
    expect(tokenDoCabecalho(`Bearer ${token}`)).toBeNull();
    expect(tokenDoCabecalho(token)).toBeNull();
    expect(tokenDoCabecalho("Bot ")).toBeNull();
    expect(tokenDoCabecalho(undefined)).toBeNull();
  });
});

describe("verificarToken", () => {
  /** Um Prisma de mentira com uma linha só de `BotToken`. */
  function prismaCom(linha: Record<string, unknown> | null) {
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
      linha && linha.tokenHash === where.tokenHash ? linha : null,
    );
    return {
      prisma: { botToken: { findUnique, update } } as unknown as PrismaService,
      findUnique,
      update,
    };
  }

  const application = {
    id: "app_1",
    snowflake: 1382915770057249473n,
    name: "Teste",
    botUserId: "u_bot",
  };

  it("acha a aplicação pelo hash do token, nunca pelo token em claro", async () => {
    const { token, hash } = gerarToken(SNOWFLAKE_DO_BOT);
    const { prisma, findUnique } = prismaCom({
      id: "bt_1",
      tokenHash: hash,
      revokedAt: null,
      application,
    });

    const achado = await new ApplicationsService(prisma).verificarToken(token);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashDoToken(token) } }),
    );
    // o valor em claro não aparece em consulta nenhuma
    expect(JSON.stringify(findUnique.mock.calls)).not.toContain(token);
    expect(achado).toEqual({
      application: { id: "app_1", snowflake: application.snowflake, name: "Teste" },
      botUserId: "u_bot",
    });
  });

  it("marca o `lastUsedAt` do token usado", async () => {
    const { token, hash } = gerarToken(SNOWFLAKE_DO_BOT);
    const { prisma, update } = prismaCom({
      id: "bt_1",
      tokenHash: hash,
      revokedAt: null,
      application,
    });

    await new ApplicationsService(prisma).verificarToken(token);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "bt_1" }, data: { lastUsedAt: expect.any(Date) } }),
    );
  });

  it("token desconhecido não vira aplicação nenhuma", async () => {
    const { hash } = gerarToken(SNOWFLAKE_DO_BOT);
    const { prisma } = prismaCom({ id: "bt_1", tokenHash: hash, revokedAt: null, application });

    // outro token, com a mesma parte 1: o que decide é o hash do token inteiro
    const outro = gerarToken(SNOWFLAKE_DO_BOT).token;
    expect(await new ApplicationsService(prisma).verificarToken(outro)).toBeNull();
  });

  it("token revogado é o mesmo que token inexistente", async () => {
    const { token, hash } = gerarToken(SNOWFLAKE_DO_BOT);
    const { prisma, update } = prismaCom({
      id: "bt_1",
      tokenHash: hash,
      revokedAt: new Date("2026-09-08T00:00:00Z"),
      application,
    });

    expect(await new ApplicationsService(prisma).verificarToken(token)).toBeNull();
    // e não gasta um UPDATE por requisição de um bot já revogado
    expect(update).not.toHaveBeenCalled();
  });
});
