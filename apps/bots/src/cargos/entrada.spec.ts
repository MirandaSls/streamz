import { describe, expect, it } from "vitest";
import {
  lerArgumentosDeAdicionar,
  lerMencaoDeCanal,
  lerMencaoDeCargo,
  separarTituloEDescricao,
} from "./entrada";

describe("menções", () => {
  it("canal: menção ou id cru", () => {
    expect(lerMencaoDeCanal("<#1414>")).toBe("1414");
    expect(lerMencaoDeCanal("1414")).toBe("1414");
    expect(lerMencaoDeCanal(" <#1414> ")).toBe("1414");
  });

  it("canal: `#geral` não é id (quem resolve pelo nome é o comando)", () => {
    expect(lerMencaoDeCanal("#geral")).toBeNull();
    expect(lerMencaoDeCanal("<@&1414>")).toBeNull();
    expect(lerMencaoDeCanal("")).toBeNull();
  });

  it("cargo: menção de cargo tem `&`, e a de canal não passa por ela", () => {
    expect(lerMencaoDeCargo("<@&1414>")).toBe("1414");
    expect(lerMencaoDeCargo("1414")).toBe("1414");
    expect(lerMencaoDeCargo("<#1414>")).toBeNull();
    // menção de **usuário** não é cargo
    expect(lerMencaoDeCargo("<@1414>")).toBeNull();
  });
});

describe("título e descrição", () => {
  it("sem barra, tudo é título", () => {
    expect(separarTituloEDescricao("Cargos do servidor")).toEqual({
      titulo: "Cargos do servidor",
      descricao: "",
    });
  });

  it("com barra, a primeira separa", () => {
    expect(separarTituloEDescricao(" Cargos | escolha o seu | de verdade ")).toEqual({
      titulo: "Cargos",
      descricao: "escolha o seu | de verdade",
    });
  });

  it("vazio é vazio (o comando é quem recusa)", () => {
    expect(separarTituloEDescricao(null)).toEqual({ titulo: "", descricao: "" });
  });
});

describe("argumentos do adicionar", () => {
  it("emoji, cargo e o rótulo com espaços", () => {
    expect(lerArgumentosDeAdicionar("🎧 <@&1414> Avisos de live")).toEqual({
      emoji: "🎧",
      cargo: "<@&1414>",
      rotulo: "Avisos de live",
    });
  });

  it("o rótulo é opcional", () => {
    expect(lerArgumentosDeAdicionar("🎧 <@&1414>")).toEqual({
      emoji: "🎧",
      cargo: "<@&1414>",
      rotulo: "",
    });
  });

  it("espaço a mais não quebra", () => {
    expect(lerArgumentosDeAdicionar("  🎧   <@&1414>   Avisos  ")?.rotulo).toBe("Avisos");
  });

  it("falta o cargo: recusa em vez de criar um item pela metade", () => {
    expect(lerArgumentosDeAdicionar("🎧")).toBeNull();
    expect(lerArgumentosDeAdicionar("")).toBeNull();
    expect(lerArgumentosDeAdicionar(null)).toBeNull();
  });
});
