import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, Permission, paraBitfieldDoDiscord } from "@streamz/shared";
import { paraRoleInput } from "./cargos.controller";

/**
 * A tradução do corpo de `POST /guilds/:id/roles`.
 *
 * O que importa aqui é a **ida e volta do bitfield**: o Discord manda 64 bits
 * como string decimal e o Streamz guarda 21 bits num `Int`. Ler a string como
 * `number` perderia em silêncio tudo acima de 2^53 — e `MODERATE_MEMBERS`, que
 * é o bit 40 do Discord, mora justamente lá em cima.
 */
describe("paraRoleInput", () => {
  it("traz de volta as permissões que têm par, pelo caminho que o discord.js usa", () => {
    const pedido = paraBitfieldDoDiscord(Permission.MODERATE_MEMBERS | Permission.KICK_MEMBERS);

    expect(paraRoleInput({ permissions: String(pedido) })).toEqual({
      permissions: Permission.MODERATE_MEMBERS | Permission.KICK_MEMBERS,
    });
  });

  it("descarta em silêncio os bits do Discord que não existem aqui", () => {
    // 1<<34 é `MANAGE_THREADS`: sem par, e o §6 manda ignorar em vez de recusar
    const soSemPar = String(1n << 34n);

    expect(paraRoleInput({ permissions: soSemPar })).toEqual({ permissions: 0 });
  });

  it("nunca deixa passar um bit que não seja do nosso conjunto", () => {
    const tudo = paraRoleInput({ permissions: String((1n << 50n) - 1n) }).permissions ?? 0;

    expect(tudo & ~ALL_PERMISSIONS).toBe(0);
  });

  it("`color` inteiro vira `#rrggbb`, e 0 é sem cor", () => {
    expect(paraRoleInput({ color: 0x5865f2 })).toEqual({ color: "#5865f2" });
    expect(paraRoleInput({ color: 0 })).toEqual({ color: null });
  });

  it("campo ausente continua ausente: o service só toca no que veio", () => {
    expect(paraRoleInput({ name: "Moderação" })).toEqual({ name: "Moderação" });
  });

  it("`hoist`/`mentionable` passam quando vêm, e `null` é o mesmo que não vir", () => {
    expect(paraRoleInput({ hoist: true, mentionable: null })).toEqual({ hoist: true });
  });
});
