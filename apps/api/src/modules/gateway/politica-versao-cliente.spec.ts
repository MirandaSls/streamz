import { describe, expect, it } from "vitest";
import { avisoDeVersao, politicaDoAmbiente } from "./politica-versao-cliente";

describe("politicaDoAmbiente", () => {
  it("vazio vira sem política", () => {
    expect(politicaDoAmbiente({ MIN_CLIENT_VERSION: " ", WARN_CLIENT_VERSION: "" })).toEqual({
      minima: undefined,
      aviso: undefined,
    });
  });
});

describe("avisoDeVersao", () => {
  const politica = { minima: "1.3.0", aviso: "1.3.18" };
  it("bloqueia abaixo da mínima", () => {
    expect(avisoDeVersao("desktop/1.2.9", politica)).toEqual({
      nivel: "bloqueado",
      versaoAtual: "1.2.9",
      versaoMinima: "1.3.0",
    });
  });
  it("avisa entre mínima e aviso", () => {
    expect(avisoDeVersao("desktop/1.3.5", politica)?.nivel).toBe("aviso");
  });
  it("em dia, navegador e sem política não geram nada", () => {
    expect(avisoDeVersao("desktop/1.3.18", politica)).toBeNull();
    expect(avisoDeVersao(undefined, politica)).toBeNull();
    expect(avisoDeVersao("desktop/0.0.1", {})).toBeNull();
  });
});
