import { describe, expect, it } from "vitest";
import { ehPrevia } from "./previa";

describe("ehPrevia", () => {
  it("238 s declarados e 32 s tocados é prévia", () => {
    expect(ehPrevia({ duracaoMs: 238_000, tocadoMs: 32_000, interferiuUsuario: false })).toBe(true);
  });
  it("tocou quase tudo não é prévia", () => {
    expect(ehPrevia({ duracaoMs: 238_000, tocadoMs: 230_000, interferiuUsuario: false })).toBe(false);
  });
  it("pausa ou seek invalida a medida", () => {
    expect(ehPrevia({ duracaoMs: 238_000, tocadoMs: 32_000, interferiuUsuario: true })).toBe(false);
  });
  it("faixa curta que tocou quase tudo não é prévia", () => {
    expect(ehPrevia({ duracaoMs: 40_000, tocadoMs: 38_000, interferiuUsuario: false })).toBe(false);
  });
  it("duração desconhecida ou stream não é prévia", () => {
    expect(ehPrevia({ duracaoMs: 0, tocadoMs: 10_000, interferiuUsuario: false })).toBe(false);
  });
});
