import { describe, expect, it } from "vitest";
import {
  LIMITE,
  VAZIO,
  atual,
  avancar,
  podeAvancar,
  podeVoltar,
  registrar,
  voltar,
  type Lugar,
} from "@/stores/historico-core";

const AMIGOS: Lugar = { tipo: "amigos" };
const CONVERSA: Lugar = { tipo: "conversa", channelId: "dm1" };
const SERVIDOR: Lugar = { tipo: "servidor", guildId: "g1", channelId: null };
const CANAL: Lugar = { tipo: "servidor", guildId: "g1", channelId: "c1" };

describe("histórico de navegação", () => {
  it("começa sem para onde ir", () => {
    expect(podeVoltar(VAZIO)).toBe(false);
    expect(podeAvancar(VAZIO)).toBe(false);
    const h = registrar(VAZIO, AMIGOS);
    expect(atual(h)).toEqual(AMIGOS);
    expect(podeVoltar(h)).toBe(false);
  });

  it("o mesmo lugar de novo não empilha", () => {
    const h = registrar(registrar(VAZIO, AMIGOS), { tipo: "amigos" });
    expect(h.pilha).toHaveLength(1);
  });

  it("volta e avança na ordem visitada", () => {
    let h = registrar(registrar(registrar(VAZIO, AMIGOS), CONVERSA), CANAL);
    expect(podeVoltar(h)).toBe(true);
    expect(podeAvancar(h)).toBe(false);
    h = voltar(h);
    expect(atual(h)).toEqual(CONVERSA);
    expect(podeAvancar(h)).toBe(true);
    h = voltar(h);
    expect(atual(h)).toEqual(AMIGOS);
    expect(podeVoltar(h)).toBe(false);
    expect(voltar(h)).toBe(h);
    h = avancar(avancar(h));
    expect(atual(h)).toEqual(CANAL);
    expect(avancar(h)).toBe(h);
  });

  it("registrar depois de voltar descarta o ramo abandonado", () => {
    let h = registrar(registrar(VAZIO, AMIGOS), CONVERSA);
    h = voltar(h);
    h = registrar(h, CANAL);
    expect(h.pilha).toEqual([AMIGOS, CANAL]);
    expect(podeAvancar(h)).toBe(false);
  });

  it("o servidor com canal substitui o servidor ainda sem canal", () => {
    const h = registrar(registrar(registrar(VAZIO, AMIGOS), SERVIDOR), CANAL);
    expect(h.pilha).toEqual([AMIGOS, CANAL]);
    // trocar de canal dentro do servidor, porém, empilha
    const h2 = registrar(h, { tipo: "servidor", guildId: "g1", channelId: "c2" });
    expect(h2.pilha).toHaveLength(3);
  });

  it("esquece o mais antigo além do limite", () => {
    let h = VAZIO;
    for (let i = 0; i < LIMITE + 5; i++) {
      h = registrar(h, { tipo: "conversa", channelId: `dm${i}` });
    }
    expect(h.pilha).toHaveLength(LIMITE);
    expect(atual(h)).toEqual({ tipo: "conversa", channelId: `dm${LIMITE + 4}` });
    expect(h.pilha[0]).toEqual({ tipo: "conversa", channelId: "dm5" });
  });
});
