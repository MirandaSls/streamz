import { describe, expect, it } from "vitest";
import { larguraDoCentro, nivelDaBarra } from "./compactacao-da-barra";

describe("nivelDaBarra", () => {
  it("nível 0 no limite exato (432 + 8 de folga)", () => {
    expect(nivelDaBarra(440)).toBe(0);
  });

  it("um pixel abaixo do limite cai para o nível 1", () => {
    expect(nivelDaBarra(439)).toBe(1);
  });

  it("nível 1 no limite exato (378 + 8 de folga)", () => {
    expect(nivelDaBarra(386)).toBe(1);
  });

  it("um pixel abaixo do limite cai para o nível 2", () => {
    expect(nivelDaBarra(385)).toBe(2);
  });

  it("largura zero é nível 2", () => {
    expect(nivelDaBarra(0)).toBe(2);
  });

  it("palco largo é nível 0", () => {
    expect(nivelDaBarra(1200)).toBe(0);
    expect(nivelDaBarra(100000)).toBe(0);
  });
});

describe("larguraDoCentro", () => {
  it("laterais escondidos: só o padding apertado (px-2) é descontado", () => {
    expect(larguraDoCentro(273, true)).toBe(257);
  });

  it("laterais visíveis: padding normal e os dois gaps", () => {
    expect(larguraDoCentro(800, false)).toBe(736);
  });
});
