import { beforeEach, describe, expect, it, vi } from "vitest";
import { lerClientOutdated, useVersaoCliente } from "@/stores/versao-cliente";

const aviso = { nivel: "aviso", versaoAtual: "1.0.0", versaoMinima: "1.2.0" } as const;
const bloqueado = { nivel: "bloqueado", versaoAtual: "1.0.0", versaoMinima: "1.2.0" } as const;

beforeEach(() => {
  useVersaoCliente.setState({ nivel: null, versaoAtual: null, versaoMinima: null });
});

describe("lerClientOutdated", () => {
  it("aceita payload válido", () => {
    expect(lerClientOutdated(aviso)).toEqual(aviso);
  });
  it("ignora payload inválido com warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(lerClientOutdated({ nivel: "x" })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("useVersaoCliente", () => {
  it("dispensa o aviso", () => {
    useVersaoCliente.getState().definir(aviso);
    useVersaoCliente.getState().dispensar();
    expect(useVersaoCliente.getState().nivel).toBeNull();
  });
  it("não dispensa o bloqueio", () => {
    useVersaoCliente.getState().definir(bloqueado);
    useVersaoCliente.getState().dispensar();
    expect(useVersaoCliente.getState().nivel).toBe("bloqueado");
  });
  it("bloqueado não regride para aviso", () => {
    useVersaoCliente.getState().definir(bloqueado);
    useVersaoCliente.getState().definir(aviso);
    expect(useVersaoCliente.getState().nivel).toBe("bloqueado");
  });
});
