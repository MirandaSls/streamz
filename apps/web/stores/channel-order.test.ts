import { describe, expect, it } from "vitest";
import type { Category, Channel } from "@streamz/shared";
import {
  applyPositions,
  groupByCategory,
  moveCategory,
  moveChannel,
} from "@/stores/channel-order";

function canal(
  id: string,
  position: number,
  categoryId: string | null = null,
  type: Channel["type"] = "TEXT",
): Channel {
  return {
    id,
    guildId: "g1",
    name: id,
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
  };
}

function categoria(id: string, position: number): Category {
  return { id, guildId: "g1", name: id, position };
}

describe("groupByCategory", () => {
  it("põe os canais sem categoria no primeiro bloco", () => {
    const grupos = groupByCategory([canal("b", 1), canal("a", 0)], []);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].category).toBeNull();
    expect(grupos[0].channels.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("ordena as categorias pela posição e distribui os canais", () => {
    const cats = [categoria("c2", 1), categoria("c1", 0)];
    const canais = [canal("x", 0, "c2"), canal("y", 0, "c1"), canal("solto", 0)];
    const grupos = groupByCategory(canais, cats);
    expect(grupos.map((g) => g.category?.id ?? null)).toEqual([null, "c1", "c2"]);
    expect(grupos[1].channels.map((c) => c.id)).toEqual(["y"]);
    expect(grupos[2].channels.map((c) => c.id)).toEqual(["x"]);
  });

  it("não some com canal cuja categoria já não existe", () => {
    const grupos = groupByCategory([canal("orfao", 0, "sumida")], []);
    expect(grupos[0].channels.map((c) => c.id)).toEqual(["orfao"]);
  });

  /*
    O defeito relatado: criar uma categoria fazia "Canais de Texto" e "Canais
    de Voz" sumirem. A causa era desenho, não este cálculo — a barra lateral
    inventava esses dois títulos por tipo enquanto `categories` estivesse
    vazia, e desligava o modo na primeira categoria de verdade. Com as duas
    padrão virando linhas de `Category`, é este agrupamento que passa a
    responder, e ele não tem modo nenhum: bloco sem título no topo, depois uma
    categoria por linha, sempre.
  */
  it("criar uma categoria nova não mexe nas duas padrão", () => {
    const padrao = [categoria("texto", 0), categoria("voz", 1)];
    const canais = [canal("geral", 0, "texto"), canal("Geral", 0, "voz", "VOICE")];

    const antes = groupByCategory(canais, padrao);
    expect(antes.map((g) => g.category?.id ?? null)).toEqual([null, "texto", "voz"]);

    // a pessoa cria "Assuntos gerais": as duas continuam lá, com os canais
    const depois = groupByCategory(canais, [...padrao, categoria("nova", 2)]);
    expect(depois.map((g) => g.category?.id ?? null)).toEqual([null, "texto", "voz", "nova"]);
    expect(depois[1].channels.map((c) => c.id)).toEqual(["geral"]);
    expect(depois[2].channels.map((c) => c.id)).toEqual(["Geral"]);
    expect(depois[3].channels).toEqual([]);
  });

  it("canal solto continua no topo, sem título, mesmo havendo categorias", () => {
    const grupos = groupByCategory(
      [canal("solto", 0), canal("dentro", 0, "texto")],
      [categoria("texto", 0)],
    );
    expect(grupos[0].category).toBeNull();
    expect(grupos[0].channels.map((c) => c.id)).toEqual(["solto"]);
    expect(grupos[1].channels.map((c) => c.id)).toEqual(["dentro"]);
  });
});

describe("moveChannel", () => {
  const cats = [categoria("c1", 0)];

  it("reordena dentro do mesmo bloco", () => {
    const canais = [canal("a", 0), canal("b", 1), canal("c", 2)];
    expect(moveChannel(canais, cats, "c", null, 0)).toEqual([
      { id: "c", position: 0, categoryId: null },
      { id: "a", position: 1, categoryId: null },
      { id: "b", position: 2, categoryId: null },
    ]);
  });

  it("move para dentro de uma categoria e renumera os dois blocos", () => {
    const canais = [canal("a", 0), canal("b", 1), canal("x", 0, "c1")];
    expect(moveChannel(canais, cats, "b", "c1", 0)).toEqual([
      { id: "a", position: 0, categoryId: null },
      { id: "b", position: 0, categoryId: "c1" },
      { id: "x", position: 1, categoryId: "c1" },
    ]);
  });

  it("aceita índice além do fim (soltar embaixo do último)", () => {
    const canais = [canal("a", 0), canal("b", 1)];
    expect(moveChannel(canais, cats, "a", null, 99).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("devolve lista vazia para canal desconhecido", () => {
    expect(moveChannel([canal("a", 0)], cats, "fantasma", null, 0)).toEqual([]);
  });
});

describe("moveCategory", () => {
  const cats = [categoria("c1", 0), categoria("c2", 1), categoria("c3", 2)];

  it("desce uma categoria sem que ela volte ao mesmo lugar", () => {
    // alvo medido na lista original: 2 significa "antes da c3"
    expect(moveCategory(cats, "c1", 2)).toEqual([
      { id: "c2", position: 0 },
      { id: "c1", position: 1 },
      { id: "c3", position: 2 },
    ]);
  });

  it("sobe uma categoria para o topo", () => {
    expect(moveCategory(cats, "c3", 0).map((p) => p.id)).toEqual(["c3", "c1", "c2"]);
  });
});

describe("applyPositions", () => {
  it("aplica posição e categoria novas sem tocar no resto", () => {
    const canais = [canal("a", 0), canal("b", 1)];
    const out = applyPositions(canais, [{ id: "b", position: 0, categoryId: "c1" }]);
    expect(out[1]).toMatchObject({ id: "b", position: 0, categoryId: "c1" });
    expect(out[0]).toBe(canais[0]);
  });
});
