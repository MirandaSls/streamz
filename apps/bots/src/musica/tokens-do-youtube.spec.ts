import { describe, expect, it } from "vitest";
import { RodizioDeTokens, ehBloqueioDoYoutube, tokensDoAmbiente } from "./tokens-do-youtube";

describe("RodizioDeTokens", () => {
  it("sem contas não tem token nem troca", () => {
    const r = new RodizioDeTokens([]);
    expect(r.ativo).toBeNull();
    expect(r.registrarFaixa()).toBeNull();
    expect(r.barrarAtiva()).toBeNull();
  });

  it("troca de conta a cada maxPedidos faixas, em círculo", () => {
    const r = new RodizioDeTokens(["a", "b"], { maxPedidos: 2 });
    expect(r.ativo).toBe("a");
    expect(r.registrarFaixa()).toBeNull();
    expect(r.registrarFaixa()).toBe("b");
    expect(r.ativo).toBe("b");
    r.registrarFaixa();
    expect(r.registrarFaixa()).toBe("a");
  });

  it("com uma conta só, nunca 'troca' para ela mesma", () => {
    const r = new RodizioDeTokens(["a"], { maxPedidos: 1 });
    expect(r.registrarFaixa()).toBeNull();
    expect(r.ativo).toBe("a");
  });

  it("conta barrada fica de molho e volta depois do prazo", () => {
    let agora = 0;
    const r = new RodizioDeTokens(["a", "b"], { molhoMs: 100, maxPedidos: 1, agora: () => agora });
    expect(r.barrarAtiva()).toBe("b");
    // "a" ainda de molho: não há para quem trocar.
    expect(r.barrarAtiva()).toBeNull();
    agora = 101;
    expect(r.registrarFaixa()).toBe("a");
  });

  it("ignora token repetido", () => {
    expect(new RodizioDeTokens(["a", "a", "b"]).quantidade).toBe(2);
  });
});

describe("tokensDoAmbiente", () => {
  it("aceita vírgula, espaço e quebra de linha", () => {
    expect(tokensDoAmbiente("1//a, 1//b\n1//c  ")).toEqual(["1//a", "1//b", "1//c"]);
    expect(tokensDoAmbiente(undefined)).toEqual([]);
    expect(tokensDoAmbiente("")).toEqual([]);
  });
});

describe("ehBloqueioDoYoutube", () => {
  it("reconhece as frases do youtube-plugin", () => {
    expect(ehBloqueioDoYoutube("Client [WEB] failed: This video requires login.")).toBe(true);
    expect(ehBloqueioDoYoutube("Sign in to confirm you’re not a bot")).toBe(true);
    expect(ehBloqueioDoYoutube("This content isn’t available.")).toBe(true);
    expect(
      ehBloqueioDoYoutube("(yts.version: 1.18.2) All clients failed to load the item."),
    ).toBe(true);
  });
  it("não confunde com outras falhas", () => {
    expect(ehBloqueioDoYoutube("Something broke when playing the track.")).toBe(false);
    expect(ehBloqueioDoYoutube(undefined)).toBe(false);
  });
});
