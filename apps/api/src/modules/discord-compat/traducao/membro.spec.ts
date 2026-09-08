import { describe, expect, it } from "vitest";

import type { LinhaDeMembro } from "../tipos";
import { membroParaDiscord } from "./membro";

describe("membroParaDiscord", () => {
  function membro(campos: Partial<LinhaDeMembro> = {}): LinhaDeMembro {
    return {
      user: {
        id: "clx_user",
        snowflake: 555444333222111000n,
        username: "mdz",
        displayName: "MDZ",
        isBot: false,
      },
      cargoSnowflakes: [777888999000111222n, 123456789012345678n],
      joinedAt: new Date("2026-01-15T10:20:30.000Z"),
      timeoutUntil: null,
      ...campos,
    };
  }

  it("monta o membro com o usuário dentro", () => {
    expect(membroParaDiscord(membro())).toEqual({
      user: {
        id: "555444333222111000",
        username: "mdz",
        discriminator: "0",
        global_name: "MDZ",
        avatar: null,
        bot: false,
        system: false,
        public_flags: 0,
      },
      nick: null,
      avatar: null,
      roles: ["777888999000111222", "123456789012345678"],
      joined_at: "2026-01-15T10:20:30.000Z",
      premium_since: null,
      deaf: false,
      mute: false,
      flags: 0,
      pending: false,
      communication_disabled_until: null,
    });
  });

  it("comUsuario: false não deixa a chave user no objeto", () => {
    const m = membroParaDiscord(membro(), false);
    // é a forma que entra dentro de uma `message` — lá o autor já está em `author`
    expect("user" in m).toBe(false);
    expect(JSON.stringify(m)).not.toContain('"user"');
  });

  it("castigo no futuro vira communication_disabled_until", () => {
    const fim = new Date(Date.now() + 60 * 60 * 1000);
    expect(membroParaDiscord(membro({ timeoutUntil: fim })).communication_disabled_until).toBe(
      fim.toISOString(),
    );
  });

  it("castigo vencido é o mesmo que castigo nenhum", () => {
    const passado = new Date("2020-01-01T00:00:00.000Z");
    expect(
      membroParaDiscord(membro({ timeoutUntil: passado })).communication_disabled_until,
    ).toBeNull();
  });

  it("roles não inclui o @everyone e é tudo string", () => {
    const m = membroParaDiscord(membro());
    expect(m.roles.every((r) => typeof r === "string")).toBe(true);
    // o @everyone é implícito no Discord; a linha já chega sem ele
    expect(m.roles).not.toContain("111222333444555666");
  });

  it("sobrevive ao JSON.stringify", () => {
    expect(() => JSON.stringify(membroParaDiscord(membro()))).not.toThrow();
  });
});
