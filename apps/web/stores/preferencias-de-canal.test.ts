import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanaisFixados, ordenarComFixados } from "./canais-fixados";
import { useNomesOcultos } from "./nomes-ocultos";

/**
 * Preferências de canal: canais fixados e nomes ocultos em canais de voz.
 * Ambas armazenam no localStorage com try/catch e guarda de typeof window.
 */

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

beforeEach(() => {
  mockLocalStorage.clear();
  Object.defineProperty(global, "window", {
    value: { localStorage: mockLocalStorage },
    writable: true,
  });

  // Reseta o estado das stores
  useCanaisFixados.setState({ porServidor: {} });
  useNomesOcultos.setState({ porCanal: {} });
});

afterEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
});

describe("useCanaisFixados", () => {
  describe("fixados", () => {
    it("retorna [] quando nenhum canal está fixado no servidor", () => {
      expect(useCanaisFixados.getState().fixados("g_1")).toEqual([]);
    });

    it("retorna a lista de IDs fixados do servidor", () => {
      useCanaisFixados.getState().alternar("g_1", "c_a");
      useCanaisFixados.getState().alternar("g_1", "c_b");
      expect(useCanaisFixados.getState().fixados("g_1")).toEqual(["c_a", "c_b"]);
    });
  });

  describe("estaFixado", () => {
    it("retorna false quando canal não está fixado", () => {
      expect(useCanaisFixados.getState().estaFixado("g_1", "c_a")).toBe(false);
    });

    it("retorna true quando canal está fixado", () => {
      useCanaisFixados.getState().alternar("g_1", "c_a");
      expect(useCanaisFixados.getState().estaFixado("g_1", "c_a")).toBe(true);
    });
  });

  describe("alternar", () => {
    it("fixa um canal quando ele não está fixado", () => {
      useCanaisFixados.getState().alternar("g_1", "c_a");
      expect(useCanaisFixados.getState().fixados("g_1")).toEqual(["c_a"]);
    });

    it("desfixa um canal quando ele está fixado", () => {
      useCanaisFixados.getState().alternar("g_1", "c_a");
      useCanaisFixados.getState().alternar("g_1", "c_a");
      expect(useCanaisFixados.getState().fixados("g_1")).toEqual([]);
    });

    it("adiciona novos canais no fim da lista", () => {
      useCanaisFixados.getState().alternar("g_1", "c_a");
      useCanaisFixados.getState().alternar("g_1", "c_b");
      useCanaisFixados.getState().alternar("g_1", "c_c");
      expect(useCanaisFixados.getState().fixados("g_1")).toEqual(["c_a", "c_b", "c_c"]);
    });

    it("não afeta outros servidores", () => {
      useCanaisFixados.getState().alternar("g_1", "c_a");
      useCanaisFixados.getState().alternar("g_2", "c_b");
      expect(useCanaisFixados.getState().fixados("g_1")).toEqual(["c_a"]);
      expect(useCanaisFixados.getState().fixados("g_2")).toEqual(["c_b"]);
    });

    it("persiste no localStorage", () => {
      useCanaisFixados.getState().alternar("g_1", "c_a");
      const salvo = mockLocalStorage.getItem("streamz:canais-fixados");
      expect(salvo).toBeTruthy();
      const obj = JSON.parse(salvo || "{}");
      expect(obj.g_1).toEqual(["c_a"]);
    });
  });
});

describe("ordenarComFixados", () => {
  it("retorna fixados e resto vazios para lista vazia", () => {
    const resultado = ordenarComFixados([], []);
    expect(resultado).toEqual({ fixados: [], resto: [] });
  });

  it("ordena itens fixados primeiro, na ordem da preferência", () => {
    const itens = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ];
    const fixados = ["c", "a"];
    const resultado = ordenarComFixados(itens, fixados);
    expect(resultado.fixados).toEqual([
      { id: "c", name: "C" },
      { id: "a", name: "A" },
    ]);
    expect(resultado.resto).toEqual([{ id: "b", name: "B" }]);
  });

  it("ignora IDs na lista de fixados que não existem na lista", () => {
    const itens = [{ id: "a", name: "A" }];
    const fixados = ["a", "inexistente"];
    const resultado = ordenarComFixados(itens, fixados);
    expect(resultado.fixados).toEqual([{ id: "a", name: "A" }]);
    expect(resultado.resto).toEqual([]);
  });

  it("mantém a ordem original do resto", () => {
    const itens = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
      { id: "d", name: "D" },
    ];
    const fixados = ["b"];
    const resultado = ordenarComFixados(itens, fixados);
    expect(resultado.fixados).toEqual([{ id: "b", name: "B" }]);
    expect(resultado.resto).toEqual([
      { id: "a", name: "A" },
      { id: "c", name: "C" },
      { id: "d", name: "D" },
    ]);
  });
});

describe("useNomesOcultos", () => {
  describe("ocultos", () => {
    it("retorna false quando nomes não estão ocultos (padrão)", () => {
      expect(useNomesOcultos.getState().ocultos("ch_1")).toBe(false);
    });

    it("retorna true quando nomes estão ocultos no canal", () => {
      useNomesOcultos.getState().alternar("ch_1");
      expect(useNomesOcultos.getState().ocultos("ch_1")).toBe(true);
    });
  });

  describe("alternar", () => {
    it("liga o ocultamento de nomes quando desligado", () => {
      expect(useNomesOcultos.getState().ocultos("ch_1")).toBe(false);
      useNomesOcultos.getState().alternar("ch_1");
      expect(useNomesOcultos.getState().ocultos("ch_1")).toBe(true);
    });

    it("desliga o ocultamento quando ligado", () => {
      useNomesOcultos.getState().alternar("ch_1");
      useNomesOcultos.getState().alternar("ch_1");
      expect(useNomesOcultos.getState().ocultos("ch_1")).toBe(false);
    });

    it("não afeta outros canais", () => {
      useNomesOcultos.getState().alternar("ch_1");
      expect(useNomesOcultos.getState().ocultos("ch_1")).toBe(true);
      expect(useNomesOcultos.getState().ocultos("ch_2")).toBe(false);
    });

    it("persiste no localStorage", () => {
      useNomesOcultos.getState().alternar("ch_1");
      const salvo = mockLocalStorage.getItem("streamz:nomes-ocultos");
      expect(salvo).toBeTruthy();
      const obj = JSON.parse(salvo || "{}");
      expect(obj.ch_1).toBe(true);
    });
  });
});
