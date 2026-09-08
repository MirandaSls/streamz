import { DEFAULT_PERMISSIONS, Permission, paraBitfieldDoDiscord } from "@streamz/shared";
import { describe, expect, it } from "vitest";

import type { LinhaDeCargo } from "../tipos";
import { cargoParaDiscord, corParaInteiro } from "./cargo";

/**
 * O cargo, e o detalhe que derruba o bot inteiro: **o `@everyone` do Discord
 * tem `id == guild.id`**. Sem isso, `guild.roles.everyone` do discord.js vem
 * `undefined` e todo cálculo de permissão do bot desanda.
 */
describe("cargoParaDiscord", () => {
  const guildSnowflake = 111222333444555666n;

  function cargo(campos: Partial<LinhaDeCargo> = {}): LinhaDeCargo {
    return {
      id: "clx_role",
      snowflake: 777888999000111222n,
      guildId: "clx_guild",
      guildSnowflake,
      name: "Moderação",
      color: "#5865f2",
      position: 5,
      permissions: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES,
      hoist: true,
      mentionable: false,
      isDefault: false,
      ...campos,
    };
  }

  it("monta o cargo comum com o snowflake dele", () => {
    expect(cargoParaDiscord(cargo())).toEqual({
      id: "777888999000111222",
      name: "Moderação",
      color: 5793266,
      hoist: true,
      position: 5,
      permissions: String(
        paraBitfieldDoDiscord(Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES),
      ),
      managed: false,
      mentionable: false,
      flags: 0,
    });
  });

  it("o @everyone sai com id == guild.id", () => {
    const everyone = cargoParaDiscord(
      cargo({
        name: "@everyone",
        isDefault: true,
        position: 0,
        color: null,
        permissions: DEFAULT_PERMISSIONS,
      }),
    );
    expect(everyone.id).toBe(String(guildSnowflake));
    // e não o snowflake da linha do cargo, que é o erro fácil de cometer
    expect(everyone.id).not.toBe("777888999000111222");
  });

  it("permissions é string decimal de 64 bits, não o nosso número cru", () => {
    const r = cargoParaDiscord(cargo({ permissions: Permission.MODERATE_MEMBERS }));
    expect(typeof r.permissions).toBe("string");
    expect(r.permissions).toMatch(/^\d+$/);
    // 1<<40 do Discord: o número de 21 bits nosso jamais chegaria lá
    expect(BigInt(r.permissions) & (1n << 40n)).toBe(1n << 40n);
    expect(r.permissions).not.toBe(String(Permission.MODERATE_MEMBERS));
  });

  it("managed é false na F1 (o cargo do bot é F4)", () => {
    expect(cargoParaDiscord(cargo()).managed).toBe(false);
  });

  it("sobrevive ao JSON.stringify", () => {
    expect(() => JSON.stringify(cargoParaDiscord(cargo()))).not.toThrow();
  });
});

describe("corParaInteiro", () => {
  it("converte #rrggbb no inteiro do Discord", () => {
    expect(corParaInteiro("#5865f2")).toBe(5793266);
    expect(corParaInteiro("#ffffff")).toBe(16777215);
    expect(corParaInteiro("#000000")).toBe(0);
    expect(corParaInteiro("#1abc9c")).toBe(1752220);
  });

  it("aceita maiúsculas e sem cerquilha", () => {
    expect(corParaInteiro("#5865F2")).toBe(5793266);
    expect(corParaInteiro("5865f2")).toBe(5793266);
  });

  it("null e lixo viram 0 (sem cor), nunca NaN", () => {
    expect(corParaInteiro(null)).toBe(0);
    expect(corParaInteiro("")).toBe(0);
    expect(corParaInteiro("azul")).toBe(0);
    expect(corParaInteiro("#12345")).toBe(0);
    expect(Number.isNaN(corParaInteiro("#zzzzzz"))).toBe(false);
  });
});
