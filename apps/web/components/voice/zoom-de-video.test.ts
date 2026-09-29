import { describe, expect, it } from "vitest";
import {
  AJUSTE_INICIAL,
  ESCALA_MAX,
  ESCALA_MIN,
  PASSO_DO_BOTAO,
  aoDuploToque,
  centro,
  comBotao,
  comPan,
  comZoom,
  distancia,
  ehOriginal,
  fatorDaPinca,
  fatorDaRoda,
  fatorDoGesto,
  limitar,
  percentualDe,
  podeAmpliar,
  podeReduzir,
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

describe("roda do mouse", () => {
  it("roda para cima (deltaY negativo) amplia — fator maior que 1", () => {
    expect(fatorDaRoda(-100)).toBeGreaterThan(1);
  });

  it("roda para baixo (deltaY positivo) reduz — fator menor que 1", () => {
    expect(fatorDaRoda(100)).toBeLessThan(1);
  });

  it("prende cada evento a no máximo 1.5×", () => {
    expect(fatorDaRoda(-999999)).toBeCloseTo(1.5, 5);
  });

  it("prende cada evento a no mínimo 1/1.5×", () => {
    expect(fatorDaRoda(999999)).toBeCloseTo(1 / 1.5, 5);
  });

  it("deltaMode 1 (linhas) equivale a multiplicar por 16px", () => {
    expect(fatorDaRoda(-10, 1)).toBeCloseTo(fatorDaRoda(-160, 0), 10);
  });

  it("deltaMode 2 (páginas) equivale a multiplicar por 800px", () => {
    expect(fatorDaRoda(-1, 2)).toBeCloseTo(fatorDaRoda(-800, 0), 10);
  });

  it("NaN/Infinity não quebram a conta — vira 1 (sem mudança)", () => {
    expect(fatorDaRoda(Number.NaN)).toBe(1);
    expect(fatorDaRoda(Number.POSITIVE_INFINITY)).toBe(1);
    expect(fatorDaRoda(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe("pinça do touchpad (wheel com ctrlKey)", () => {
  it("é mais forte que a roda para o mesmo delta pequeno", () => {
    expect(fatorDaPinca(-5)).toBeGreaterThan(fatorDaRoda(-5));
    expect(fatorDaPinca(5)).toBeLessThan(fatorDaRoda(5));
  });

  it("deltaY negativo amplia e positivo reduz", () => {
    expect(fatorDaPinca(-5)).toBeGreaterThan(1);
    expect(fatorDaPinca(5)).toBeLessThan(1);
  });

  it("prende ao teto de 1.5× e ao piso de 1/1.5×", () => {
    expect(fatorDaPinca(-999999)).toBeCloseTo(1.5, 5);
    expect(fatorDaPinca(999999)).toBeCloseTo(1 / 1.5, 5);
  });

  it("respeita deltaMode como a roda", () => {
    expect(fatorDaPinca(-0.1, 1)).toBeCloseTo(fatorDaPinca(-1.6, 0), 10);
    expect(fatorDaPinca(-0.001, 2)).toBeCloseTo(fatorDaPinca(-0.8, 0), 10);
  });

  it("NaN/Infinity viram 1", () => {
    expect(fatorDaPinca(Number.NaN)).toBe(1);
    expect(fatorDaPinca(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("gesto do WebKit (scale acumulado)", () => {
  it("de 1 para 1.2 dá 1.2", () => {
    expect(fatorDoGesto(1, 1.2)).toBeCloseTo(1.2, 10);
  });

  it("escala igual à anterior dá 1", () => {
    expect(fatorDoGesto(1.2, 1.2)).toBe(1);
  });

  it("zero, negativo e NaN em qualquer lado dão 1", () => {
    expect(fatorDoGesto(0, 1.2)).toBe(1);
    expect(fatorDoGesto(1, 0)).toBe(1);
    expect(fatorDoGesto(-1, 1.2)).toBe(1);
    expect(fatorDoGesto(1, -1.2)).toBe(1);
    expect(fatorDoGesto(Number.NaN, 1.2)).toBe(1);
    expect(fatorDoGesto(1, Number.NaN)).toBe(1);
    expect(fatorDoGesto(1, Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("prende ao teto de 1.5× e ao piso de 1/1.5×", () => {
    expect(fatorDoGesto(1, 10)).toBeCloseTo(1.5, 10);
    expect(fatorDoGesto(10, 1)).toBeCloseTo(1 / 1.5, 10);
  });
});

describe("botão da cápsula", () => {
  it("ampliando, escala cresce por PASSO_DO_BOTAO em torno do centro", () => {
    const a = comBotao(AJUSTE_INICIAL, 1, TELA);
    expect(a.escala).toBeCloseTo(PASSO_DO_BOTAO, 10);
    expect(a.x).toBeCloseTo(0, 5);
    expect(a.y).toBeCloseTo(0, 5);
  });

  it("reduzindo a partir de ampliado, escala cai por 1/PASSO_DO_BOTAO", () => {
    const ampliado = comBotao(AJUSTE_INICIAL, 1, TELA);
    const de_volta = comBotao(ampliado, -1, TELA);
    expect(de_volta.escala).toBeCloseTo(1, 10);
  });

  it("reduzir perto de 1 cai em exatamente {1,0,0}, não em algo abaixo do piso", () => {
    const quaseUm = { escala: 1.1, x: 3, y: -3 };
    expect(comBotao(quaseUm, -1, TELA)).toEqual(AJUSTE_INICIAL);
  });
});

describe("percentual e limites da cápsula", () => {
  it("percentualDe arredonda a escala para inteiro", () => {
    expect(percentualDe({ escala: 1, x: 0, y: 0 })).toBe(100);
    expect(percentualDe({ escala: 2.5, x: 0, y: 0 })).toBe(250);
    expect(percentualDe({ escala: 1.004, x: 0, y: 0 })).toBe(100);
  });

  it("podeAmpliar é falso só encostado no teto", () => {
    expect(podeAmpliar({ escala: ESCALA_MAX, x: 0, y: 0 })).toBe(false);
    expect(podeAmpliar({ escala: ESCALA_MAX - 0.5, x: 0, y: 0 })).toBe(true);
  });

  it("podeReduzir é falso só encostado no piso", () => {
    expect(podeReduzir({ escala: ESCALA_MIN, x: 0, y: 0 })).toBe(false);
    expect(podeReduzir({ escala: ESCALA_MIN + 0.5, x: 0, y: 0 })).toBe(true);
  });
});
