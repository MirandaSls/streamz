import { describe, expect, it } from "vitest";
import { PTT_RELEASE_MS } from "@newdisc/shared";
import {
  PTT_INICIAL,
  pttAberto,
  pttCombina,
  pttFechaEm,
  pttPress,
  pttRelease,
  pttRotulo,
} from "./ptt-core";

describe("push-to-talk", () => {
  it("fechado em repouso, aberto com a tecla apertada", () => {
    expect(pttAberto(PTT_INICIAL, 0)).toBe(false);
    expect(pttAberto(pttPress(PTT_INICIAL, 100), 100)).toBe(true);
  });

  it("segura o microfone aberto pela folga depois de soltar", () => {
    // é o ponto da regra: sem a folga a última sílaba de cada frase some
    const solto = pttRelease(pttPress(PTT_INICIAL, 0), 1000);
    expect(pttAberto(solto, 1000 + PTT_RELEASE_MS - 1)).toBe(true);
    expect(pttAberto(solto, 1000 + PTT_RELEASE_MS)).toBe(false);
  });

  it("auto-repeat do teclado não reinicia a contagem", () => {
    const primeiro = pttPress(PTT_INICIAL, 500);
    expect(pttPress(primeiro, 700)).toBe(primeiro);
  });

  it("soltar sem ter pressionado não muda nada", () => {
    expect(pttRelease(PTT_INICIAL, 10)).toBe(PTT_INICIAL);
  });

  it("apertar de novo dentro da folga cancela o fechamento", () => {
    const solto = pttRelease(pttPress(PTT_INICIAL, 0), 100);
    const denovo = pttPress(solto, 100 + PTT_RELEASE_MS / 2);
    expect(pttFechaEm(denovo, 100 + PTT_RELEASE_MS / 2)).toBeNull();
    expect(pttAberto(denovo, 100 + PTT_RELEASE_MS * 10)).toBe(true);
  });

  it("pttFechaEm devolve o que falta, e null quando não há fecho pendente", () => {
    expect(pttFechaEm(PTT_INICIAL, 0)).toBeNull();
    const solto = pttRelease(pttPress(PTT_INICIAL, 0), 1000);
    expect(pttFechaEm(solto, 1000)).toBe(PTT_RELEASE_MS);
    expect(pttFechaEm(solto, 1000 + PTT_RELEASE_MS)).toBeNull();
  });

  it("combina só a tecla configurada; sem tecla, nada dispara", () => {
    expect(pttCombina("KeyV", "KeyV")).toBe(true);
    expect(pttCombina("KeyV", "KeyB")).toBe(false);
    expect(pttCombina("KeyV", null)).toBe(false);
  });

  it("rotula os códigos do browser de forma legível", () => {
    expect(pttRotulo(null)).toBe("Nenhuma");
    expect(pttRotulo("Space")).toBe("Espaço");
    expect(pttRotulo("KeyV")).toBe("V");
    expect(pttRotulo("Digit4")).toBe("4");
    expect(pttRotulo("Numpad7")).toBe("Num 7");
    expect(pttRotulo("ArrowLeft")).toBe("Seta left");
    expect(pttRotulo("F13")).toBe("F13");
  });
});
