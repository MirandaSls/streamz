import { describe, expect, it } from "vitest";
import {
  AJUSTE_INICIAL,
  ESCALA_MAX,
  aoDuploToque,
  centro,
  comPan,
  comZoom,
  distancia,
  ehOriginal,
  limitar,
  transformDe,
} from "./zoom-de-video";

const TELA = { largura: 390, altura: 844 };

describe("medidas dos dedos", () => {
  it("distância é a euclidiana", () => {
    expect(distancia({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("centro é o ponto médio", () => {
    expect(centro({ x: 0, y: 10 }, { x: 100, y: 30 })).toEqual({ x: 50, y: 20 });
  });
});

describe("limites", () => {
  it("com escala 1 o deslocamento é zerado — a imagem volta ao lugar sozinha", () => {
    expect(limitar({ escala: 1, x: 200, y: -300 }, TELA)).toEqual({ escala: 1, x: 0, y: 0 });
  });

  it("com escala 2 o deslocamento vai até metade da tela em cada eixo", () => {
    const a = limitar({ escala: 2, x: 9999, y: -9999 }, TELA);
    expect(a.x).toBe(195);
    expect(a.y).toBe(-422);
  });

  it("a escala não passa do teto nem cai abaixo do piso", () => {
    expect(limitar({ escala: 99, x: 0, y: 0 }, TELA).escala).toBe(ESCALA_MAX);
    expect(limitar({ escala: 0.1, x: 0, y: 0 }, TELA).escala).toBe(1);
  });
});

describe("pinça", () => {
  it("ampliar no centro não desloca nada", () => {
    const a = comZoom(AJUSTE_INICIAL, 2, { x: 195, y: 422 }, TELA);
    expect(a.escala).toBe(2);
    expect(a.x).toBeCloseTo(0, 5);
    expect(a.y).toBeCloseTo(0, 5);
  });

  it("ampliar num canto mantém aquele ponto no lugar", () => {
    // o canto superior esquerdo dobrando de tamanho tem de puxar a imagem para
    // baixo e para a direita — é o que dá a sensação de segurar a imagem
    const a = comZoom(AJUSTE_INICIAL, 2, { x: 0, y: 0 }, TELA);
    expect(a.x).toBeGreaterThan(0);
    expect(a.y).toBeGreaterThan(0);
  });

  it("insistir no teto não continua arrastando a imagem", () => {
    const noTeto = comZoom(AJUSTE_INICIAL, 99, { x: 0, y: 0 }, TELA);
    const depois = comZoom(noTeto, 2, { x: 0, y: 0 }, TELA);
    expect(depois.escala).toBe(ESCALA_MAX);
    expect(depois.x).toBeCloseTo(noTeto.x, 5);
    expect(depois.y).toBeCloseTo(noTeto.y, 5);
  });

  it("fechar a pinça de volta ao repouso recentraliza", () => {
    const ampliado = comZoom(AJUSTE_INICIAL, 3, { x: 10, y: 10 }, TELA);
    const voltou = comZoom(ampliado, 1 / 3, { x: 10, y: 10 }, TELA);
    expect(ehOriginal(voltou)).toBe(true);
  });
});

describe("arrasto", () => {
  it("no repouso o dedo não move a imagem", () => {
    expect(comPan(AJUSTE_INICIAL, 120, -80, TELA)).toEqual(AJUSTE_INICIAL);
  });

  it("ampliado ele move, até o limite", () => {
    const base = { escala: 2, x: 0, y: 0 };
    expect(comPan(base, 50, 0, TELA).x).toBe(50);
    expect(comPan(base, 9999, 0, TELA).x).toBe(195);
  });
});

describe("duplo-toque", () => {
  it("do repouso amplia 2×", () => {
    expect(aoDuploToque(AJUSTE_INICIAL, { x: 195, y: 422 }, TELA).escala).toBe(2);
  });

  it("de qualquer zoom volta ao original", () => {
    const ampliado = comZoom(AJUSTE_INICIAL, 4, { x: 0, y: 0 }, TELA);
    expect(aoDuploToque(ampliado, { x: 0, y: 0 }, TELA)).toEqual(AJUSTE_INICIAL);
  });
});

describe("transform", () => {
  it("sai na ordem que o CSS espera: translate e depois scale", () => {
    expect(transformDe({ escala: 2, x: 10, y: -5 })).toBe(
      "translate(10.00px, -5.00px) scale(2.0000)",
    );
  });
});
