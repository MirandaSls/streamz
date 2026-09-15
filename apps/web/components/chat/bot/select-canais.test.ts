import { describe, expect, it, vi } from "vitest";
import type { Category, Channel } from "@streamz/shared";

// `select-canais.ts` usa `filtrarPorTexto` de `select-opcoes.ts`, que também
// monta as opções vivas (usuário/cargo/canal) e por isso importa o `Avatar` e
// a store de presença — que puxam API, socket e metade do app. Nada disso é
// exercitado aqui; as falsas cortam o grafo no ambiente node do vitest.
vi.mock("@/components/ui/Avatar", () => ({ default: () => null }));
vi.mock("@/stores/presence", () => ({ useLiveUser: (u: unknown) => u }));

import {
  canaisFiltrados,
  canalCombinaComTipos,
  selectAceitaCategoria,
  TIPO_DE_CANAL_NO_DISCORD,
  TIPO_DE_CATEGORIA_NO_DISCORD,
} from "./select-canais";

function canal(
  id: string,
  type: Channel["type"],
  position: number,
  name = id,
  categoryId: string | null = null,
): Channel {
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
    categoryId,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
    syncedWithCategory: false,
  };
}

function categoria(id: string, position: number, name = id): Category {
  return { id, guildId: "g1", name, position };
}

describe("TIPO_DE_CANAL_NO_DISCORD", () => {
  it("é a tabela do Discord (0 texto, 2 voz, 5 anúncio; 4 categoria à parte)", () => {
    expect(TIPO_DE_CANAL_NO_DISCORD).toEqual({ TEXT: 0, VOICE: 2, ANNOUNCEMENT: 5 });
    expect(TIPO_DE_CATEGORIA_NO_DISCORD).toBe(4);
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

  it("um canal de verdade nunca combina com um select só de categorias", () => {
    expect(canalCombinaComTipos(canal("1", "TEXT", 0), [4])).toBe(false);
  });
});

describe("selectAceitaCategoria", () => {
  it("só com 4 explícito em channel_types", () => {
    expect(selectAceitaCategoria(undefined)).toBe(false);
    expect(selectAceitaCategoria([])).toBe(false);
    expect(selectAceitaCategoria([0, 2])).toBe(false);
    expect(selectAceitaCategoria([4])).toBe(true);
    expect(selectAceitaCategoria([0, 4])).toBe(true);
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

  it("todo item de canal leva tipo 'canal', o nome e o próprio Channel", () => {
    const [primeiro] = canaisFiltrados(canais, [0], "");
    expect(primeiro).toEqual({ tipo: "canal", id: "b", nome: "dev-chat", canal: canais[1] });
  });

  it("não reordena o array de entrada", () => {
    const antes = canais.map((c) => c.id);
    canaisFiltrados(canais, undefined, "");
    expect(canais.map((c) => c.id)).toEqual(antes);
  });

  describe("com as categorias do mesmo servidor", () => {
    const categorias = [categoria("cat2", 1, "Voz"), categoria("cat1", 0, "Texto")];
    const agrupados = [
      canal("solto", "TEXT", 5, "regras"),
      canal("t1", "TEXT", 1, "geral", "cat1"),
      canal("t0", "TEXT", 0, "boas-vindas", "cat1"),
      canal("v0", "VOICE", 0, "sala", "cat2"),
      canal("orfao", "TEXT", 9, "perdido", "categoria-que-nao-carregou"),
    ];

    it("channel_types [4]: só as categorias, por position, como itens tipo 'categoria'", () => {
      const itens = canaisFiltrados(agrupados, [4], "", categorias);
      expect(itens.map((i) => [i.tipo, i.id])).toEqual([
        ["categoria", "cat1"],
        ["categoria", "cat2"],
      ]);
      expect(itens[0]).toEqual({ tipo: "categoria", id: "cat1", nome: "Texto", categoria: categorias[1] });
    });

    it("channel_types [4] sem a store de categorias carregada: lista vazia", () => {
      expect(canaisFiltrados(agrupados, [4], "")).toEqual([]);
    });

    it("channel_types [0, 4]: ordem da barra lateral — soltos, depois cada categoria e seus canais", () => {
      expect(canaisFiltrados(agrupados, [0, 4], "", categorias).map((i) => i.id)).toEqual([
        "solto",
        "orfao",
        "cat1",
        "t0",
        "t1",
        "cat2",
      ]);
    });

    it("sem channel_types a categoria fica de fora (a API só resolve Channel), mas a ordem agrupada vale", () => {
      expect(canaisFiltrados(agrupados, undefined, "", categorias).map((i) => i.id)).toEqual([
        "solto",
        "orfao",
        "t0",
        "t1",
        "v0",
      ]);
    });

    it("channel_types sem 4: nenhuma categoria, mesmo com a store carregada", () => {
      const itens = canaisFiltrados(agrupados, [2], "", categorias);
      expect(itens.every((i) => i.tipo === "canal")).toBe(true);
      expect(itens.map((i) => i.id)).toEqual(["v0"]);
    });

    it("busca casa categoria e canal pelo próprio nome, sem puxar o grupo junto", () => {
      expect(canaisFiltrados(agrupados, [0, 2, 4], "vo", categorias).map((i) => i.id)).toEqual(["cat2"]);
      expect(canaisFiltrados(agrupados, [0, 4], "geral", categorias).map((i) => i.id)).toEqual(["t1"]);
    });
  });
});
