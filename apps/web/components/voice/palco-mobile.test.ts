import { describe, expect, it } from "vitest";
import { dividirPalco, podeAbrirEmTelaCheia, type TileDoPalco } from "./palco-mobile";

function tile(p: Partial<TileDoPalco> & { key: string }): TileDoPalco {
  return {
    tela: false,
    assistindo: false,
    comVideo: false,
    userId: p.key,
    ...p,
  };
}

describe("dividir o palco do celular", () => {
  it("sem ninguém, não há destaque", () => {
    expect(dividirPalco([], null)).toEqual({ principal: null, faixa: [] });
  });

  it("com uma pessoa, ela é o destaque e a faixa fica vazia", () => {
    const a = tile({ key: "a" });
    expect(dividirPalco([a], null)).toEqual({ principal: a, faixa: [] });
  });

  it("o destaque nunca fica vazio — é a diferença para a grade do desktop", () => {
    const tiles = [tile({ key: "a" }), tile({ key: "b" })];
    expect(dividirPalco(tiles, null).principal).toBe(tiles[0]);
  });

  it("a escolha à mão ganha de tudo", () => {
    const tiles = [tile({ key: "a", tela: true, assistindo: true, comVideo: true }), tile({ key: "b" })];
    expect(dividirPalco(tiles, "b").principal?.key).toBe("b");
  });

  it("`focado` guardado como pessoa ainda casa", () => {
    const tiles = [tile({ key: "a" }), tile({ key: "b:sid", userId: "b", tela: true })];
    expect(dividirPalco(tiles, "b").principal?.key).toBe("b:sid");
  });

  it("uma escolha que sumiu (a pessoa saiu) não deixa o palco vazio", () => {
    const tiles = [tile({ key: "a" })];
    expect(dividirPalco(tiles, "quem-saiu").principal?.key).toBe("a");
  });

  it("sem escolha, a transmissão que estou assistindo assume o palco", () => {
    const tiles = [
      tile({ key: "a" }),
      tile({ key: "b" }),
      tile({ key: "b:sid", userId: "b", tela: true, assistindo: true, comVideo: true }),
    ];
    expect(dividirPalco(tiles, null).principal?.key).toBe("b:sid");
  });

  it("uma transmissão ainda fechada também vem para o destaque — é onde o botão de assistir cabe", () => {
    const tiles = [tile({ key: "a", comVideo: true }), tile({ key: "b:sid", userId: "b", tela: true })];
    expect(dividirPalco(tiles, null).principal?.key).toBe("b:sid");
  });

  it("sem tela nenhuma, quem está de câmera ligada ganha do avatar", () => {
    const tiles = [tile({ key: "a" }), tile({ key: "b", comVideo: true })];
    expect(dividirPalco(tiles, null).principal?.key).toBe("b");
  });

  it("a faixa é todo o resto, na ordem original", () => {
    const tiles = [tile({ key: "a" }), tile({ key: "b", comVideo: true }), tile({ key: "c" })];
    expect(dividirPalco(tiles, null).faixa.map((t) => t.key)).toEqual(["a", "c"]);
  });
});

describe("tela cheia", () => {
  it("só há o que ampliar quando há imagem", () => {
    expect(podeAbrirEmTelaCheia({ comVideo: true })).toBe(true);
    expect(podeAbrirEmTelaCheia({ comVideo: false })).toBe(false);
  });
});
