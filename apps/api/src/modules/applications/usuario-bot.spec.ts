import { describe, expect, it } from "vitest";
import { baseDoUsernameDoBot } from "./applications.service";
import { toPublicUser } from "../../common/dto";

/**
 * O usuário-bot: o username derivado do nome do aplicativo, e o campo `bot` do
 * `PublicUser` — que é a única mudança em contrato existente desta fase.
 */
describe("baseDoUsernameDoBot", () => {
  it("tira acento, espaço e maiúscula", () => {
    expect(baseDoUsernameDoBot("Música do Zé")).toBe("musica-do-ze");
    expect(baseDoUsernameDoBot("Ping Pong")).toBe("ping-pong");
  });

  it("cabe no que o contrato aceita como username", () => {
    // `[a-zA-Z0-9_.-]`, 3 a 32 (packages/shared/src/auth.ts). O corte é em 23
    // para o maior sufixo de desempate (`-a1b2c3d4`) ainda caber.
    const base = baseDoUsernameDoBot("Um nome absurdamente comprido de aplicativo");
    expect(base).toMatch(/^[a-z0-9_.-]+$/);
    expect(base.length).toBeLessThanOrEqual(23);
    expect(`${base}-a1b2c3d4`.length).toBeLessThanOrEqual(32);
  });

  it("não termina nem começa em separador", () => {
    expect(baseDoUsernameDoBot("  -- bot -- ")).toBe("bot");
    expect(baseDoUsernameDoBot("Nome com pontuação!!!")).toBe("nome-com-pontuacao");
  });

  it("nome sem nada aproveitável cai em `bot`", () => {
    expect(baseDoUsernameDoBot("🎵🎵")).toBe("bot");
    expect(baseDoUsernameDoBot("音楽")).toBe("bot");
    expect(baseDoUsernameDoBot("ab")).toBe("bot");
  });
});

describe("PublicUser.bot", () => {
  const linha = {
    id: "u_1",
    username: "musica",
    displayName: "Música",
    avatarUrl: null,
    status: "OFFLINE" as const,
  };

  it("é false por padrão — inclusive quando a query não trouxe a coluna", () => {
    expect(toPublicUser(linha).bot).toBe(false);
    expect(toPublicUser({ ...linha, isBot: false }).bot).toBe(false);
  });

  it("é true para a conta de bot", () => {
    expect(toPublicUser({ ...linha, isBot: true }).bot).toBe(true);
  });
});
