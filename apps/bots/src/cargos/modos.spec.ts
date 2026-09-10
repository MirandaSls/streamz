import { describe, expect, it } from "vitest";
import { decidirAoDesreagir, decidirAoReagir, normalizarModo, type PainelParaDecidir } from "./modos";

const painel = (modo: PainelParaDecidir["modo"]): PainelParaDecidir => ({
  modo,
  itens: {
    "u:🎧": { cargoId: "cargo-ouvinte" },
    "u:🎮": { cargoId: "cargo-jogador" },
  },
});

describe("normalizarModo", () => {
  it("aceita o acento e o hífen que qualquer pessoa escreveria", () => {
    expect(normalizarModo("único")).toBe("unico");
    expect(normalizarModo("ÚNICO")).toBe("unico");
    expect(normalizarModo("só-adicionar")).toBe("so-adicionar");
    expect(normalizarModo("so adicionar")).toBe("so-adicionar");
    expect(normalizarModo(" Travado ")).toBe("travado");
  });

  it("recusa o que não é modo", () => {
    expect(normalizarModo("qualquer")).toBeNull();
    expect(normalizarModo("")).toBeNull();
    expect(normalizarModo(null)).toBeNull();
  });
});

describe("reagir", () => {
  it("emoji que não é do painel não mexe em nada", () => {
    expect(decidirAoReagir(painel("normal"), "u:🐟", [])).toEqual({
      darCargo: null,
      tirarCargos: [],
      tirarReacoes: [],
    });
  });

  it("normal: dá o cargo e deixa os outros em paz", () => {
    expect(decidirAoReagir(painel("normal"), "u:🎧", ["cargo-jogador"])).toEqual({
      darCargo: "cargo-ouvinte",
      tirarCargos: [],
      tirarReacoes: [],
    });
  });

  it("normal: quem já tem o cargo não ganha de novo (nada de PUT à toa)", () => {
    expect(decidirAoReagir(painel("normal"), "u:🎧", ["cargo-ouvinte"]).darCargo).toBeNull();
  });

  it("único: troca — dá o novo, tira o antigo e desfaz a reação antiga", () => {
    expect(decidirAoReagir(painel("unico"), "u:🎧", ["cargo-jogador"])).toEqual({
      darCargo: "cargo-ouvinte",
      tirarCargos: ["cargo-jogador"],
      tirarReacoes: ["u:🎮"],
    });
  });

  it("único: sem cargo anterior é igual ao normal", () => {
    expect(decidirAoReagir(painel("unico"), "u:🎧", [])).toEqual({
      darCargo: "cargo-ouvinte",
      tirarCargos: [],
      tirarReacoes: [],
    });
  });

  it("único: cargo de fora do painel não é tirado", () => {
    // O painel manda no que é dele. Tirar o cargo que outra pessoa deu à mão
    // seria o bot mexendo onde não foi chamado.
    expect(decidirAoReagir(painel("unico"), "u:🎧", ["cargo-de-fora"]).tirarCargos).toEqual([]);
  });

  it("travado: a primeira escolha passa", () => {
    expect(decidirAoReagir(painel("travado"), "u:🎧", []).darCargo).toBe("cargo-ouvinte");
  });

  it("travado: a segunda é desfeita, e não dá cargo nenhum", () => {
    const decisao = decidirAoReagir(painel("travado"), "u:🎧", ["cargo-jogador"]);
    expect(decisao.darCargo).toBeNull();
    expect(decisao.tirarCargos).toEqual([]);
    expect(decisao.tirarReacoes).toEqual(["u:🎧"]);
    expect(decisao.recusa).toBe("travado");
  });
});

describe("desreagir", () => {
  it("normal: tira o cargo", () => {
    expect(decidirAoDesreagir(painel("normal"), "u:🎧", ["cargo-ouvinte"])).toEqual({
      tirarCargo: "cargo-ouvinte",
    });
  });

  it("normal: não tenta tirar o que a pessoa não tem", () => {
    expect(decidirAoDesreagir(painel("normal"), "u:🎧", []).tirarCargo).toBeNull();
  });

  it("único: também tira (o que ele impede é ter dois, não desistir)", () => {
    expect(decidirAoDesreagir(painel("unico"), "u:🎧", ["cargo-ouvinte"]).tirarCargo).toBe(
      "cargo-ouvinte",
    );
  });

  it("só adicionar: não tira nada", () => {
    expect(decidirAoDesreagir(painel("so-adicionar"), "u:🎧", ["cargo-ouvinte"])).toEqual({
      tirarCargo: null,
      recusa: "so-adicionar",
    });
  });

  it("travado: não tira nada", () => {
    expect(decidirAoDesreagir(painel("travado"), "u:🎧", ["cargo-ouvinte"]).tirarCargo).toBeNull();
  });

  it("emoji de fora do painel não tira nada", () => {
    expect(decidirAoDesreagir(painel("normal"), "u:🐟", ["cargo-ouvinte"]).tirarCargo).toBeNull();
  });
});
