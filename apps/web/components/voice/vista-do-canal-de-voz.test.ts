import { describe, expect, it } from "vitest";
import {
  CHAT_ABERTO_POR_PADRAO,
  LIMITE_DE_AVATARES,
  alemDosAvatares,
  alternarChatDoCanal,
  chatDoCanalAberto,
  definirChatDoCanal,
  esquecerChatDoCanal,
  textoDePresenca,
} from "./vista-do-canal-de-voz";

describe("quantas pessoas estão em voz", () => {
  it("sem ninguém é a frase da print, não '0 pessoas'", () => {
    expect(textoDePresenca(0)).toBe("Ninguém está em voz");
  });

  it("uma pessoa é singular", () => {
    expect(textoDePresenca(1)).toBe("1 pessoa em voz");
  });

  it("duas ou mais é plural", () => {
    expect(textoDePresenca(2)).toBe("2 pessoas em voz");
    expect(textoDePresenca(17)).toBe("17 pessoas em voz");
  });

  it("número inválido ou negativo cai na frase de canal vazio", () => {
    expect(textoDePresenca(-3)).toBe("Ninguém está em voz");
    expect(textoDePresenca(Number.NaN)).toBe("Ninguém está em voz");
  });
});

describe("quantos avatares o palco desenha", () => {
  it("até o limite não sobra ninguém", () => {
    expect(alemDosAvatares(0)).toBe(0);
    expect(alemDosAvatares(LIMITE_DE_AVATARES)).toBe(0);
  });

  it("acima do limite o resto vira '+N'", () => {
    expect(alemDosAvatares(LIMITE_DE_AVATARES + 5)).toBe(5);
  });
});

describe("memória do balão por canal", () => {
  it("canal que ninguém mexeu usa o padrão (fechado: só abre pelo balão)", () => {
    expect(CHAT_ABERTO_POR_PADRAO).toBe(false);
    expect(chatDoCanalAberto({}, "c1")).toBe(false);
  });

  it("sem canal nenhum devolve o padrão em vez de estourar", () => {
    expect(chatDoCanalAberto({}, null)).toBe(false);
    expect(chatDoCanalAberto({}, undefined)).toBe(false);
  });

  it("abrir num canal não abre no outro", () => {
    const mapa = alternarChatDoCanal({}, "c1");
    expect(chatDoCanalAberto(mapa, "c1")).toBe(true);
    expect(chatDoCanalAberto(mapa, "c2")).toBe(false);
  });

  it("alternar duas vezes volta ao padrão", () => {
    const mapa = alternarChatDoCanal(alternarChatDoCanal({}, "c1"), "c1");
    expect(chatDoCanalAberto(mapa, "c1")).toBe(false);
  });

  it("definir o mesmo valor devolve o mesmo mapa (não re-renderiza à toa)", () => {
    const mapa = definirChatDoCanal({}, "c1", false);
    expect(definirChatDoCanal(mapa, "c1", false)).toBe(mapa);
    expect(definirChatDoCanal(mapa, "c1", true)).not.toBe(mapa);
  });

  it("abrir um canal já aberto por padrão ainda grava a escolha", () => {
    const mapa = definirChatDoCanal({}, "c1", true);
    expect(mapa).toEqual({ c1: true });
  });

  it("sem canal, gravar e alternar são no-op sobre o mesmo mapa", () => {
    const mapa = { c1: false };
    expect(definirChatDoCanal(mapa, null, true)).toBe(mapa);
    expect(alternarChatDoCanal(mapa, undefined)).toBe(mapa);
  });

  it("esquecer tira o canal do mapa e ele volta ao padrão", () => {
    const mapa = definirChatDoCanal({}, "c1", true);
    const limpo = esquecerChatDoCanal(mapa, "c1");
    expect(limpo).toEqual({});
    expect(chatDoCanalAberto(limpo, "c1")).toBe(false);
  });

  it("esquecer canal que não está no mapa devolve o mesmo mapa", () => {
    const mapa = { c1: false };
    expect(esquecerChatDoCanal(mapa, "c2")).toBe(mapa);
  });
});
