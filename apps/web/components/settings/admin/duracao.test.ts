import { describe, expect, it } from "vitest";
import { duracao } from "./duracao";

const AGORA = 1_700_000_000_000;
const min = (n: number) => AGORA - n * 60_000;

describe("duracao", () => {
  it("abaixo de um minuto não mostra número", () => {
    expect(duracao(AGORA, AGORA)).toBe("agora há pouco");
    expect(duracao(AGORA - 59_000, AGORA)).toBe("agora há pouco");
  });

  it("conta minutos até a virada da hora", () => {
    expect(duracao(min(1), AGORA)).toBe("há 1 min");
    expect(duracao(min(59), AGORA)).toBe("há 59 min");
  });

  it("hora cheia não mostra '0 min' pendurado", () => {
    expect(duracao(min(60), AGORA)).toBe("há 1 h");
    expect(duracao(min(120), AGORA)).toBe("há 2 h");
  });

  it("hora quebrada mostra as duas partes", () => {
    expect(duracao(min(61), AGORA)).toBe("há 1 h 1 min");
    expect(duracao(min(150), AGORA)).toBe("há 2 h 30 min");
  });

  // relógio do cliente atrasado em relação ao do servidor não pode virar
  // "há -3 min" na tela
  it("futuro é tratado como agora", () => {
    expect(duracao(AGORA + 5_000, AGORA)).toBe("agora há pouco");
  });

  it("sem instante de entrada não inventa um", () => {
    expect(duracao(null, AGORA)).toBe("—");
  });
});
