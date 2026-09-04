import { describe, expect, it } from "vitest";
import type { Guild } from "@streamz/shared";
import { comServidorNovo } from "./guilds-entrada";

function guild(id: string, extra: Partial<Guild> = {}): Guild {
  return {
    id,
    name: id,
    iconUrl: null,
    ownerId: "bia",
    description: null,
    unread: false,
    mentionCount: 0,
    ...extra,
  };
}

/**
 * O defeito: entrei num servidor pelo site e o desktop, aberto ao lado, só
 * mostrou depois de reiniciar. Com o evento `guild.joined` indo para todas as
 * conexões da conta, é esta função que põe o servidor no rail.
 */
describe("entrei num servidor", () => {
  it("põe o servidor na lista da outra sessão", () => {
    const depois = comServidorNovo([guild("a")], guild("b"));
    expect(depois.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("não duplica na sessão que fez o pedido (ela recebe o próprio evento)", () => {
    const antes = [guild("a"), guild("b")];
    const depois = comServidorNovo(antes, guild("b"));
    expect(depois.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("não apaga o não-lido de um servidor que a lista já conhecia", () => {
    const antes = [guild("b", { unread: true, mentionCount: 3 })];
    const depois = comServidorNovo(antes, guild("b", { name: "nome novo" }));
    expect(depois).toEqual([
      guild("b", { name: "nome novo", unread: true, mentionCount: 3 }),
    ]);
  });

  it("a lista de origem não é modificada", () => {
    const antes = [guild("a")];
    comServidorNovo(antes, guild("b"));
    expect(antes.map((g) => g.id)).toEqual(["a"]);
  });
});
