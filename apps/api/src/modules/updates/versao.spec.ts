import { describe, expect, it } from "vitest";
import { ehMaisNova, partes } from "./versao";

describe("partes", () => {
  it("lê o x.y.z", () => {
    expect(partes("1.2.3")).toEqual([1, 2, 3]);
  });

  it("tolera o v na frente e o pré-lançamento atrás", () => {
    expect(partes("v0.4.0")).toEqual([0, 4, 0]);
    expect(partes("1.0.0-beta.2")).toEqual([1, 0, 0]);
  });

  it("trata pedaço ausente ou lixo como zero", () => {
    expect(partes("2")).toEqual([2, 0, 0]);
    expect(partes("")).toEqual([0, 0, 0]);
    expect(partes("nao-e-versao")).toEqual([0, 0, 0]);
  });
});

describe("ehMaisNova", () => {
  it("compara número por número, não como texto", () => {
    // o caso que uma comparação de string erra: "0.10.0" < "0.9.0"
    expect(ehMaisNova("0.10.0", "0.9.0")).toBe(true);
    expect(ehMaisNova("0.9.0", "0.10.0")).toBe(false);
  });

  it("versão igual não é atualização", () => {
    expect(ehMaisNova("1.2.3", "1.2.3")).toBe(false);
  });

  it("não oferece downgrade", () => {
    expect(ehMaisNova("1.0.0", "1.0.1")).toBe(false);
  });

  it("respeita a precedência de maior sobre menor e correção", () => {
    expect(ehMaisNova("1.0.0", "0.99.99")).toBe(true);
    expect(ehMaisNova("1.1.0", "1.0.99")).toBe(true);
    expect(ehMaisNova("1.0.2", "1.0.1")).toBe(true);
  });
});
