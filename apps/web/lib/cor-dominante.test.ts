import { describe, expect, it } from "vitest";
import { corDominanteDosPixels, paraHex } from "./cor-dominante";

/** Monta um RGBA com `n` cópias de cada cor. */
function pixels(...blocos: [n: number, r: number, g: number, b: number, a?: number][]) {
  const saida: number[] = [];
  for (const [n, r, g, b, a = 255] of blocos) {
    for (let i = 0; i < n; i++) saida.push(r, g, b, a);
  }
  return saida;
}

describe("cor dominante", () => {
  it("devolve a cor que mais aparece", () => {
    expect(corDominanteDosPixels(pixels([10, 178, 222, 234], [3, 20, 20, 20]))).toBe("#b2deea");
  });

  it("agrupa tons vizinhos: a foto não tem duas vezes o mesmo pixel", () => {
    // três azuis quase iguais somam mais que o preto sólido, e a cor devolvida
    // é a média deles — não o centro da caixa
    const cor = corDominanteDosPixels(
      pixels([2, 176, 220, 232], [2, 178, 222, 234], [2, 180, 223, 236], [5, 0, 0, 0]),
    );
    expect(cor).toBe(paraHex(178, 222, 234));
  });

  it("ignora pixel transparente — avatar vazado não é 'cor nenhuma'", () => {
    expect(corDominanteDosPixels(pixels([100, 0, 0, 0, 0], [4, 200, 30, 30]))).toBe("#c81e1e");
  });

  it("sem pixel nenhum opaco, não inventa cor", () => {
    expect(corDominanteDosPixels(pixels([8, 10, 10, 10, 0]))).toBeNull();
    expect(corDominanteDosPixels([])).toBeNull();
  });

  it("hexadecimal sempre com dois dígitos por canal", () => {
    expect(paraHex(0, 5, 255)).toBe("#0005ff");
    expect(paraHex(-4, 300, 16)).toBe("#00ff10");
  });
});
