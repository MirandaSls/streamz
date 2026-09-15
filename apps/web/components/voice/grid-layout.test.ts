import { describe, expect, it } from "vitest";
import { GAP, distribuir, melhorArranjo } from "./grid-layout";

describe("vão da grade", () => {
  it("é o --space-8 do Discord", () => {
    expect(GAP).toBe(8);
  });
});

describe("arranjo medido nas prints do Discord", () => {
  it("dois tiles lado a lado no palco da print 101857 (760 de largura, 8 de vão)", () => {
    // tiles em x=383–1142 e 1151–1910: 760 + 8 + 760 = 1528 de área útil
    const a = melhorArranjo(2, 1528, 560);
    expect(a.colunas).toBe(2);
    expect(a.linhas).toBe(1);
    expect(a.largura).toBe(760);
    // 760 / (16/9) = 427,5 — a print mostra 428 (y=254–681); a conta arredonda para baixo
    expect(a.altura).toBe(427);
  });

  it("três tiles numa fileira na faixa da print 123917 (291×163)", () => {
    // x=382–672, 681–971, 980–1270: 3×291 + 2×8 = 889
    const a = melhorArranjo(3, 889, 200);
    expect(a.colunas).toBe(3);
    expect(a.largura).toBe(291);
    expect(a.altura).toBe(163);
  });
});

describe("arranjo", () => {
  it("área zerada não quebra", () => {
    expect(melhorArranjo(3, 0, 500)).toEqual({ colunas: 1, linhas: 1, largura: 0, altura: 0 });
    expect(melhorArranjo(0, 800, 500)).toEqual({ colunas: 1, linhas: 1, largura: 0, altura: 0 });
  });

  it("nunca passa da área disponível", () => {
    for (let n = 1; n <= 12; n++) {
      const a = melhorArranjo(n, 1200, 700);
      expect(a.largura * a.colunas + GAP * (a.colunas - 1)).toBeLessThanOrEqual(1200);
      expect(a.altura * a.linhas + GAP * (a.linhas - 1)).toBeLessThanOrEqual(700);
    }
  });

  it("palco estreito empilha em vez de espremer", () => {
    expect(melhorArranjo(2, 400, 900).colunas).toBe(1);
  });
});

describe("distribuir", () => {
  it("equilibra a última linha", () => {
    expect(distribuir(5, 3)).toEqual([3, 2]);
    expect(distribuir(7, 3)).toEqual([3, 2, 2]);
    expect(distribuir(4, 2)).toEqual([2, 2]);
  });

  it("nada para distribuir dá lista vazia", () => {
    expect(distribuir(0, 3)).toEqual([]);
  });
});
