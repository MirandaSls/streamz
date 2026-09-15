/**
 * Onde uma folha inferior assenta ao soltar a alça. Os casos travam as três
 * regras do `decidirParada`: arremesso vai para a próxima parada no sentido do
 * dedo, sem arremesso vale a mais perto (com "fechada" contando como parada na
 * altura toda), e empate fica aberto.
 */
import { describe, expect, it } from "vitest";
import { VELOCIDADE_DE_ARREMESSO } from "./useArrastoHorizontal";
import { decidirParada, deslocamentosDasParadas } from "./useArrastoDeFolha";

const ALTURA = 800;
const RAPIDO = VELOCIDADE_DE_ARREMESSO;

describe("deslocamentosDasParadas", () => {
  it("fração à vista vira deslocamento a partir do topo da folha", () => {
    expect(deslocamentosDasParadas(ALTURA, [1])).toEqual([0]);
    expect(deslocamentosDasParadas(ALTURA, [0.5, 1])).toEqual([400, 0]);
  });

  it("frações fora de 0..1 são presas", () => {
    expect(deslocamentosDasParadas(ALTURA, [1.5, -1])).toEqual([0, 800]);
  });
});

describe("decidirParada — só altura cheia (o padrão)", () => {
  const paradas = [1];

  it("sem arremesso, metade da altura decide", () => {
    expect(decidirParada({ deslocamento: 399, velocidade: 0, altura: ALTURA, paradas })).toBe(0);
    expect(decidirParada({ deslocamento: 401, velocidade: 0, altura: ALTURA, paradas })).toBe("fechar");
  });

  it("empate fica aberto", () => {
    expect(decidirParada({ deslocamento: 400, velocidade: 0, altura: ALTURA, paradas })).toBe(0);
  });

  it("arremesso para baixo fecha logo no começo", () => {
    expect(decidirParada({ deslocamento: 30, velocidade: RAPIDO, altura: ALTURA, paradas })).toBe("fechar");
  });

  it("arremesso para cima devolve mesmo quase fechada", () => {
    expect(decidirParada({ deslocamento: 760, velocidade: -RAPIDO, altura: ALTURA, paradas })).toBe(0);
  });
});

describe("decidirParada — meia altura e altura cheia", () => {
  const paradas = [0.5, 1];

  it("arremesso para baixo da cheia para na meia, e da meia fecha", () => {
    expect(decidirParada({ deslocamento: 50, velocidade: RAPIDO, altura: ALTURA, paradas })).toBe(400);
    expect(decidirParada({ deslocamento: 420, velocidade: RAPIDO, altura: ALTURA, paradas })).toBe("fechar");
  });

  it("arremesso para cima da meia vai para a cheia", () => {
    expect(decidirParada({ deslocamento: 380, velocidade: -RAPIDO, altura: ALTURA, paradas })).toBe(0);
  });

  it("sem arremesso, a mais perto", () => {
    expect(decidirParada({ deslocamento: 150, velocidade: 0, altura: ALTURA, paradas })).toBe(0);
    expect(decidirParada({ deslocamento: 350, velocidade: 0, altura: ALTURA, paradas })).toBe(400);
    expect(decidirParada({ deslocamento: 650, velocidade: 0, altura: ALTURA, paradas })).toBe("fechar");
  });

  it("empate entre meia e fechada fica na meia", () => {
    expect(decidirParada({ deslocamento: 600, velocidade: 0, altura: ALTURA, paradas })).toBe(400);
  });
});

describe("decidirParada — casos de borda", () => {
  it("folha sem altura fecha", () => {
    expect(decidirParada({ deslocamento: 0, velocidade: 0, altura: 0, paradas: [1] })).toBe("fechar");
  });

  it("sem paradas fecha", () => {
    expect(decidirParada({ deslocamento: 0, velocidade: 0, altura: ALTURA, paradas: [] })).toBe("fechar");
  });
});
