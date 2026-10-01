import { describe, expect, it } from "vitest";
import { lotesDeMiniaturas } from "./lotes-de-miniaturas";

describe("lotesDeMiniaturas", () => {
  it("põe ids sem miniatura primeiro e preserva a ordem em cada grupo", () => {
    const tem = new Set(["a", "c"]);
    const lotes = lotesDeMiniaturas(["a", "b", "c", "d", "e"], (id) => tem.has(id), 2);
    expect(lotes).toEqual([["b", "d"], ["e", "a"], ["c"]]);
  });

  it("divide em lotes do tamanho pedido", () => {
    expect(lotesDeMiniaturas(["1", "2", "3", "4", "5", "6", "7", "8", "9"], () => false, 4)).toEqual([
      ["1", "2", "3", "4"],
      ["5", "6", "7", "8"],
      ["9"],
    ]);
  });

  it("lista vazia não gera lote e tamanho inválido vira 1", () => {
    expect(lotesDeMiniaturas([], () => false, 4)).toEqual([]);
    expect(lotesDeMiniaturas(["a", "b"], () => false, 0)).toEqual([["a"], ["b"]]);
  });
});
