import { describe, expect, it } from "vitest";
import {
  CONFIGURACAO_PADRAO,
  mesclarConfiguracao,
  nomeDoArquivoDeConfiguracao,
  normalizarConfiguracao,
} from "./configuracao";

describe("normalizarConfiguracao", () => {
  it("devolve o padrão (tudo desligado) para o que não é objeto", () => {
    for (const cru of [undefined, null, 5, "x", []]) {
      expect(normalizarConfiguracao(cru)).toEqual({ vinte4Sete: false, autoplay: false });
    }
  });

  it("mantém booleanos válidos", () => {
    expect(normalizarConfiguracao({ vinte4Sete: true, autoplay: true })).toEqual({
      vinte4Sete: true,
      autoplay: true,
    });
  });

  it("valor corrompido de um campo volta ao padrão sem afetar o outro", () => {
    expect(normalizarConfiguracao({ vinte4Sete: "sim", autoplay: true })).toEqual({
      vinte4Sete: false,
      autoplay: true,
    });
    expect(normalizarConfiguracao({ vinte4Sete: true, autoplay: 1 })).toEqual({
      vinte4Sete: true,
      autoplay: false,
    });
  });
});

describe("mesclarConfiguracao", () => {
  it("altera só o campo informado", () => {
    expect(mesclarConfiguracao({ ...CONFIGURACAO_PADRAO }, { autoplay: true })).toEqual({
      vinte4Sete: false,
      autoplay: true,
    });
  });

  it("parcial vazio não muda nada, e valor inválido é ignorado", () => {
    const atual = { vinte4Sete: true, autoplay: false };
    expect(mesclarConfiguracao(atual, {})).toEqual(atual);
    expect(mesclarConfiguracao(atual, { vinte4Sete: "x" as never })).toEqual({
      vinte4Sete: false,
      autoplay: false,
    });
  });
});

describe("nomeDoArquivoDeConfiguracao", () => {
  it("aceita snowflake e recusa caminho", () => {
    expect(nomeDoArquivoDeConfiguracao("123")).toBe("123.json");
    expect(() => nomeDoArquivoDeConfiguracao("../x")).toThrow();
  });
});
