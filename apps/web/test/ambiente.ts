/**
 * Stubs de browser para os testes de unidade.
 *
 * Os módulos sob teste (`lib/session.ts`, `lib/api.ts`, `lib/socket.ts`) tocam
 * apenas `localStorage` e `window.location`; recriá-los a cada teste isola o
 * estado sem o custo de um DOM completo.
 */
import { beforeEach, afterEach, vi } from "vitest";

function localStorageDeMemoria(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (chave: string) => (dados.has(chave) ? dados.get(chave)! : null),
    key: (indice: number) => Array.from(dados.keys())[indice] ?? null,
    removeItem: (chave: string) => void dados.delete(chave),
    setItem: (chave: string, valor: string) => void dados.set(chave, String(valor)),
  };
}

/** Última navegação forçada por `expirarSessao`, para os testes conferirem. */
export const navegacao = { destino: null as string | null };

beforeEach(() => {
  const storage = localStorageDeMemoria();
  navegacao.destino = null;
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    location: {
      pathname: "/app",
      replace: (url: string) => {
        navegacao.destino = url;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
