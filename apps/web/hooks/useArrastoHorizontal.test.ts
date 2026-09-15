/**
 * A parte pura do arrasto horizontal do celular: eixo, velocidade e a decisão
 * de soltura. O que estes casos travam é o **contrato com os outros gestos** —
 * a rolagem vertical ganha o empate, o limiar é o mesmo pixel em que o toque
 * longo desiste, e um arremesso manda mais que a distância nos dois sentidos.
 */
import { describe, expect, it } from "vitest";
import {
  FRACAO_PARA_COMPLETAR,
  LIMIAR_DE_EIXO,
  VELOCIDADE_DE_ARREMESSO,
  aparar,
  decidirEixo,
  decidirSoltura,
  limitar,
  velocidadeDoGesto,
} from "./useArrastoHorizontal";

describe("decidirEixo", () => {
  it("não decide dentro do limiar", () => {
    expect(decidirEixo(0, 0)).toBeNull();
    expect(decidirEixo(LIMIAR_DE_EIXO, -LIMIAR_DE_EIXO)).toBeNull();
  });

  it("trava no mesmo pixel em que o toque longo desiste (mais de 10)", () => {
    expect(LIMIAR_DE_EIXO).toBe(10);
    expect(decidirEixo(11, 0)).toBe("x");
    expect(decidirEixo(-11, 3)).toBe("x");
  });

  it("vertical quando o dedo sobe ou desce mais do que anda de lado", () => {
    expect(decidirEixo(4, 12)).toBe("y");
    expect(decidirEixo(-11, -14)).toBe("y");
  });

  it("empate é da rolagem", () => {
    expect(decidirEixo(12, 12)).toBe("y");
    expect(decidirEixo(-15, 15)).toBe("y");
  });
});

describe("velocidadeDoGesto", () => {
  it("zero sem amostras suficientes", () => {
    expect(velocidadeDoGesto([])).toBe(0);
    expect(velocidadeDoGesto([{ t: 0, v: 10 }])).toBe(0);
  });

  it("mede só a janela final, não a média do gesto", () => {
    const amostras = [
      { t: 0, v: 0 },
      { t: 500, v: 10 }, // devagar por meio segundo
      { t: 550, v: 40 },
      { t: 600, v: 90 }, // e um peteleco no fim
    ];
    expect(velocidadeDoGesto(amostras, 100)).toBeCloseTo(80 / 100);
  });

  it("dedo que parou antes de soltar não arremessa", () => {
    const amostras = [
      { t: 0, v: 0 },
      { t: 50, v: 120 },
      { t: 400, v: 120 },
    ];
    expect(velocidadeDoGesto(amostras, 100)).toBe(0);
  });

  it("guarda o sinal", () => {
    expect(velocidadeDoGesto([{ t: 0, v: 100 }, { t: 50, v: 60 }])).toBeCloseTo(-0.8);
  });
});

describe("decidirSoltura", () => {
  const lento = VELOCIDADE_DE_ARREMESSO / 2;

  it("sem arremesso, metade do caminho decide", () => {
    expect(decidirSoltura({ progresso: FRACAO_PARA_COMPLETAR, velocidade: 0, sentido: 1 })).toBe(true);
    expect(decidirSoltura({ progresso: 0.49, velocidade: lento, sentido: 1 })).toBe(false);
    expect(decidirSoltura({ progresso: 0.7, velocidade: -lento, sentido: 1 })).toBe(true);
  });

  it("arremesso rumo ao destino completa mesmo perto do começo", () => {
    expect(decidirSoltura({ progresso: 0.05, velocidade: VELOCIDADE_DE_ARREMESSO, sentido: 1 })).toBe(true);
  });

  it("arremesso contra o destino desfaz mesmo perto do fim", () => {
    expect(decidirSoltura({ progresso: 0.9, velocidade: -VELOCIDADE_DE_ARREMESSO, sentido: 1 })).toBe(false);
  });

  it("o sentido negativo inverte o sinal da velocidade", () => {
    // arrastar para a esquerda (membros): velocidade negativa é rumo ao destino
    expect(decidirSoltura({ progresso: 0.1, velocidade: -1, sentido: -1 })).toBe(true);
    expect(decidirSoltura({ progresso: 0.9, velocidade: 1, sentido: -1 })).toBe(false);
  });
});

describe("limitar e aparar", () => {
  it("limitar prende nos dois lados", () => {
    expect(limitar(-5, 0, 100)).toBe(0);
    expect(limitar(150, 0, 100)).toBe(100);
    expect(limitar(42, 0, 100)).toBe(42);
  });

  it("aparar mantém a janela e uma âncora antes dela", () => {
    const amostras = [0, 100, 200, 250, 300].map((t) => ({ t, v: t }));
    expect(aparar(amostras, 300, 100).map((a) => a.t)).toEqual([100, 200, 250, 300]);
    expect(aparar([{ t: 0, v: 0 }], 0, 100)).toHaveLength(1);
  });
});
