import { describe, expect, it } from "vitest";
import { canalVisivel, visivelComRecolhida } from "./categoria-colapso";

/**
 * A regra do Discord: recolher a categoria esconde o que está quieto, nunca o
 * que está acontecendo. Se um destes casos quebrar, uma mensagem nova (ou um
 * canal recém-criado, que entra como ativo) some da coluna sem aviso.
 */

const QUIETO = { ativo: false, naoLido: false, mencoes: 0 };

describe("visivelComRecolhida", () => {
  it("mostra o canal ativo", () => {
    expect(visivelComRecolhida({ ...QUIETO, ativo: true })).toBe(true);
  });

  it("mostra o canal com mensagem não lida", () => {
    expect(visivelComRecolhida({ ...QUIETO, naoLido: true })).toBe(true);
  });

  it("mostra o canal com menção", () => {
    expect(visivelComRecolhida({ ...QUIETO, mencoes: 2 })).toBe(true);
  });

  it("esconde o canal sem nada", () => {
    expect(visivelComRecolhida(QUIETO)).toBe(false);
  });
});

describe("canalVisivel", () => {
  it("mostra tudo enquanto a categoria está expandida", () => {
    expect(canalVisivel({ ...QUIETO, recolhida: false })).toBe(true);
  });

  it("aplica a regra do recolhido quando a categoria está fechada", () => {
    expect(canalVisivel({ ...QUIETO, recolhida: true })).toBe(false);
    expect(canalVisivel({ ...QUIETO, recolhida: true, mencoes: 1 })).toBe(true);
  });
});
