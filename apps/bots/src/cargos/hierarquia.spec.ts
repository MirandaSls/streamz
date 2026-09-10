import { describe, expect, it } from "vitest";
import { explicarHierarquia, podeMexerNoCargo } from "./hierarquia";

/**
 * A regra é a do `GuildsService.assertPodeMexerNoCargo`: `position >= teto` é
 * recusado. Reproduzi-la aqui só vale se for **a mesma** — daí o caso do
 * empate, que é justamente o que um `>` em vez de `>=` deixaria passar para
 * morrer com `50013` mais adiante.
 */
describe("podeMexerNoCargo", () => {
  it("cargo abaixo do meu: pode", () => {
    expect(podeMexerNoCargo({ posicaoDoAlvo: 3, posicaoDoBot: 7 })).toBe(true);
  });

  it("cargo acima do meu: não pode", () => {
    expect(podeMexerNoCargo({ posicaoDoAlvo: 9, posicaoDoBot: 7 })).toBe(false);
  });

  it("cargo na mesma altura: não pode (a API recusa o empate)", () => {
    expect(podeMexerNoCargo({ posicaoDoAlvo: 7, posicaoDoBot: 7 })).toBe(false);
  });

  it("bot sem cargo nenhum: não pode nada", () => {
    expect(podeMexerNoCargo({ posicaoDoAlvo: 0, posicaoDoBot: null })).toBe(false);
  });

  it("dono do servidor passa por cima (a exceção da regra)", () => {
    expect(podeMexerNoCargo({ posicaoDoAlvo: 99, posicaoDoBot: null, botEhDono: true })).toBe(true);
  });
});

describe("explicarHierarquia", () => {
  it("diz o que fazer, e não só o que deu errado", () => {
    const frase = explicarHierarquia("Streamer", "Streamz Cargos");
    expect(frase).toContain("Streamer");
    expect(frase).toContain("Streamz Cargos");
    expect(frase).toMatch(/arraste/i);
  });

  it("sem cargo nenhum, manda instalar direito", () => {
    expect(explicarHierarquia("Streamer", null)).toMatch(/gerenciar cargos/i);
  });
});
