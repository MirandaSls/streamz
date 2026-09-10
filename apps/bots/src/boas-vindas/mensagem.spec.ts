import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH } from "@streamz/shared";
import {
  MENSAGEM_ENTRADA_PADRAO,
  montarMensagem,
  substituirVariaveis,
  variaveisDesconhecidas,
  type DadosDoMembro,
} from "./mensagem";

const ana: DadosDoMembro = {
  usuario: "@ana",
  nome: "Ana",
  servidor: "Streamz",
  contagem: 42,
};

describe("substituirVariaveis", () => {
  it("troca as quatro variáveis", () => {
    expect(
      substituirVariaveis("{usuario} ({nome}) entrou no {servidor}; somos {contagem}", ana),
    ).toBe("@ana (Ana) entrou no Streamz; somos 42");
  });

  it("troca todas as ocorrências da mesma variável", () => {
    expect(substituirVariaveis("{nome}, {nome}, {nome}", ana)).toBe("Ana, Ana, Ana");
  });

  it("não mexe num marcador que não conhece", () => {
    expect(substituirVariaveis("oi {data} {nome}", ana)).toBe("oi {data} Ana");
  });

  it("não substitui de novo o que já substituiu", () => {
    // O defeito que a passada única evita: um apelido que **é** um marcador
    // faria a segunda passada trocar o nome da pessoa pelo do servidor.
    const trapaceiro: DadosDoMembro = { ...ana, nome: "{servidor}" };
    expect(substituirVariaveis("bem-vindo {nome}", trapaceiro)).toBe("bem-vindo {servidor}");
  });

  it("a contagem entra como número, não como '[object Object]'", () => {
    expect(substituirVariaveis("{contagem}", { ...ana, contagem: 0 })).toBe("0");
  });

  it("o modelo de fábrica usa só variáveis conhecidas", () => {
    expect(variaveisDesconhecidas(MENSAGEM_ENTRADA_PADRAO)).toEqual([]);
  });
});

describe("variaveisDesconhecidas", () => {
  it("aponta o que foi digitado errado, sem repetir", () => {
    expect(variaveisDesconhecidas("{data} {data} {nome} {hora}").sort()).toEqual(["data", "hora"]);
  });
  it("não reclama de nada quando só há variáveis conhecidas", () => {
    expect(variaveisDesconhecidas("{usuario} {nome} {servidor} {contagem}")).toEqual([]);
  });
});

describe("montarMensagem", () => {
  it("corta no limite da mensagem do Streamz", () => {
    const modelo = `${"a".repeat(MAX_MESSAGE_LENGTH - 5)}{servidor}`;
    const pronta = montarMensagem(modelo, { ...ana, servidor: "servidor de nome comprido" });
    expect(pronta.length).toBe(MAX_MESSAGE_LENGTH);
    expect(pronta.endsWith("…")).toBe(true);
  });

  it("não mexe no que cabe", () => {
    expect(montarMensagem("oi {nome}", ana)).toBe("oi Ana");
  });
});
