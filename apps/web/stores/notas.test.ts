import { beforeEach, describe, expect, it } from "vitest";
import { useNotas } from "./notas";

/**
 * `handleUpdated` (o tratador de `user.noteUpdated`) precisa ser idempotente
 * pelo mesmo motivo de `stores/friends`: a aba que salvou já aplicou a
 * resposta, e o evento da própria ação chega logo atrás pela sala do usuário.
 */
beforeEach(() => {
  useNotas.setState({ minhasNotas: {}, loading: false, loaded: false });
});

describe("handleUpdated", () => {
  it("grava a nota nova", () => {
    useNotas.getState().handleUpdated({ userId: "bia", nota: "conheci na faculdade" });
    expect(useNotas.getState().nota("bia")).toBe("conheci na faculdade");
  });

  it("aplicar a mesma nota duas vezes não muda nada", () => {
    useNotas.getState().handleUpdated({ userId: "bia", nota: "conheci na faculdade" });
    useNotas.getState().handleUpdated({ userId: "bia", nota: "conheci na faculdade" });
    expect(Object.keys(useNotas.getState().minhasNotas)).toEqual(["bia"]);
  });

  it("nota: null apaga", () => {
    useNotas.setState({ minhasNotas: { bia: "conheci na faculdade" } });
    useNotas.getState().handleUpdated({ userId: "bia", nota: null });
    expect(useNotas.getState().nota("bia")).toBe("");
    expect(useNotas.getState().minhasNotas).not.toHaveProperty("bia");
  });

  it("apagar quem já não tem nota não faz nada", () => {
    useNotas.getState().handleUpdated({ userId: "caio", nota: null });
    expect(useNotas.getState().minhasNotas).toEqual({});
  });

  it("não mexe na nota de outra pessoa", () => {
    useNotas.setState({ minhasNotas: { bia: "a", caio: "b" } });
    useNotas.getState().handleUpdated({ userId: "bia", nota: "a2" });
    expect(useNotas.getState().minhasNotas).toEqual({ bia: "a2", caio: "b" });
  });
});

describe("nota", () => {
  it("string vazia para quem não tem nota (preenche o campo do modal sem null)", () => {
    expect(useNotas.getState().nota("ninguem")).toBe("");
  });
});
