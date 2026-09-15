/**
 * A normalização roda a cada tecla no campo do nome: o caso que justifica o
 * teste é o do meio da digitação ("bate " precisa continuar "bate-", senão o
 * espaço some antes da segunda palavra chegar).
 */
import { describe, expect, it } from "vitest";
import { normalizarNomeDeCanal } from "./nome-de-canal";

describe("normalizarNomeDeCanal", () => {
  it("põe em minúsculas", () => {
    expect(normalizarNomeDeCanal("Geral")).toBe("geral");
  });

  it("troca espaço por hífen", () => {
    expect(normalizarNomeDeCanal("bate papo")).toBe("bate-papo");
  });

  it("colapsa espaços e hífens repetidos num hífen só", () => {
    expect(normalizarNomeDeCanal("bate   papo")).toBe("bate-papo");
    expect(normalizarNomeDeCanal("bate---papo")).toBe("bate-papo");
    expect(normalizarNomeDeCanal("bate - papo")).toBe("bate-papo");
  });

  it("não apara o hífen da ponta no meio da digitação", () => {
    expect(normalizarNomeDeCanal("bate ")).toBe("bate-");
    expect(normalizarNomeDeCanal(" bate")).toBe("-bate");
  });

  it("mantém acento e número", () => {
    expect(normalizarNomeDeCanal("Música 2")).toBe("música-2");
  });

  it("é idempotente", () => {
    const uma = normalizarNomeDeCanal("Bate  Papo -- Geral");
    expect(normalizarNomeDeCanal(uma)).toBe(uma);
  });
});
