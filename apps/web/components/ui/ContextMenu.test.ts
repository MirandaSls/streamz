import { describe, expect, it } from "vitest";
import { gestoDeRolagemRecente } from "./ContextMenu";

describe("gestoDeRolagemRecente", () => {
  it("sem gesto nenhum (null), nunca vale como rolagem de verdade", () => {
    expect(gestoDeRolagemRecente(null, 1_000)).toBe(false);
  });

  it("gesto dentro da janela vale — é a roda do mouse ou o dedo que rolou", () => {
    expect(gestoDeRolagemRecente(1_000, 1_050)).toBe(true);
    // na borda exata da janela (150ms) ainda conta
    expect(gestoDeRolagemRecente(1_000, 1_150)).toBe(true);
  });

  it("gesto fora da janela não vale — é o bug: scroll sem ninguém tocar nada", () => {
    // era exatamente este caso: a lista de canais muda de altura sozinha
    // (participante de voz entrando/saindo) e o navegador clampa/reancora o
    // scrollTop, disparando um `scroll` sem nenhum gesto recente
    expect(gestoDeRolagemRecente(1_000, 1_151)).toBe(false);
    expect(gestoDeRolagemRecente(1_000, 5_000)).toBe(false);
  });

  it("janela custom é respeitada", () => {
    expect(gestoDeRolagemRecente(1_000, 1_300, 500)).toBe(true);
    expect(gestoDeRolagemRecente(1_000, 1_600, 500)).toBe(false);
  });
});
