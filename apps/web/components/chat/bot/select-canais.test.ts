import { describe, expect, it } from "vitest";
import type { Channel } from "@streamz/shared";
import { canaisFiltrados, canalCombinaComTipos, TIPO_DE_CANAL_NO_DISCORD } from "./select-canais";

function canal(id: string, type: Channel["type"], position: number, name = id): Channel {
  return {
    id,
    guildId: "g1",
    name,
    type,
    position,
    private: false,
    readOnly: false,
    lastMessageAt: null,
    lastReadAt: null,
    mentionCount: 0,
    categoryId: null,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
    syncedWithCategory: false,
  };
}

describe("TIPO_DE_CANAL_NO_DISCORD", () => {
  it("é a tabela do Discord (0 texto, 2 voz, 5 anúncio)", () => {
    expect(TIPO_DE_CANAL_NO_DISCORD).toEqual({ TEXT: 0, VOICE: 2, ANNOUNCEMENT: 5 });
  });
});

describe("canalCombinaComTipos", () => {
  it("sem channel_types (undefined ou []), qualquer canal combina", () => {
    const c = canal("1", "VOICE", 0);
    expect(canalCombinaComTipos(c, undefined)).toBe(true);
    expect(canalCombinaComTipos(c, [])).toBe(true);
  });

  it("com channel_types, só o(s) tipo(s) pedido(s) combinam", () => {
    expect(canalCombinaComTipos(canal("1", "TEXT", 0), [0])).toBe(true);
    expect(canalCombinaComTipos(canal("1", "VOICE", 0), [0])).toBe(false);
    expect(canalCombinaComTipos(canal("1", "ANNOUNCEMENT", 0), [0, 5])).toBe(true);
  });

  it("DM/GROUP nunca combinam (não têm número nesta tabela)", () => {
    expect(canalCombinaComTipos(canal("1", "DM", 0), [0, 1, 2, 3, 5])).toBe(false);
  });
});

describe("canaisFiltrados", () => {
  const canais = [
    canal("a", "VOICE", 2, "voz-geral"),
    canal("b", "TEXT", 0, "dev-chat"),
    canal("c", "TEXT", 1, "geral"),
    canal("d", "ANNOUNCEMENT", 3, "anuncios"),
  ];

  it("filtra por channel_types e ordena por position", () => {
    expect(canaisFiltrados(canais, [0], "").map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("busca por nome, sem diferenciar caixa", () => {
    expect(canaisFiltrados(canais, undefined, "DEV").map((c) => c.id)).toEqual(["b"]);
  });

  it("channel_types + busca combinados", () => {
    expect(canaisFiltrados(canais, [0, 5], "an").map((c) => c.id)).toEqual(["d"]);
  });
});
