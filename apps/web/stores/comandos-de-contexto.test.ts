import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComandoDeApp } from "@streamz/shared";

/**
 * O cache por servidor dos comandos de contexto (submenu "Apps >" do menu de
 * mensagem, `docs/CONTRATO-MENUS.md` §7).
 *
 * O que estes testes protegem:
 * 1. `doGuild`/`doTipo` respondem `[]` sem cache — o submenu nunca trava
 *    esperando rede.
 * 2. `garantir` não dispara duas cargas para o mesmo servidor ao mesmo tempo.
 * 3. Falha na rota não deixa a próxima chamada de `garantir` travada.
 * 4. `aplicarAtualizacao` só relista servidor que já estava em cache.
 */

const api = vi.hoisted(() => ({
  comandosDeContexto: vi.fn(async (_guildId: string): Promise<ComandoDeApp[]> => []),
}));
vi.mock("@/lib/api", () => ({ api }));

import { useComandosDeContexto } from "./comandos-de-contexto";

function comando(nome: string, tipo: 2 | 3): ComandoDeApp {
  return {
    id: `cmd_${nome}`,
    snowflake: "1000",
    name: nome,
    description: "",
    options: [],
    applicationId: "app_1",
    applicationName: "Pixel",
    botUser: {
      id: "u_bot",
      username: "pixel",
      displayName: "Pixel",
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
    } as ComandoDeApp["botUser"],
    tipo,
  };
}

beforeEach(() => {
  useComandosDeContexto.setState({ porGuild: {}, carregando: {} });
  api.comandosDeContexto.mockReset();
  api.comandosDeContexto.mockImplementation(async () => []);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("cache vazio", () => {
  it("doGuild e doTipo respondem [] sem travar o menu, mesmo sem carga nenhuma", () => {
    expect(useComandosDeContexto.getState().doGuild("g_1")).toEqual([]);
    expect(useComandosDeContexto.getState().doTipo("g_1", 3)).toEqual([]);
  });
});

describe("garantir", () => {
  it("carrega uma vez e preenche o cache do servidor", async () => {
    const traduzir = comando("Traduzir mensagem", 3);
    const verAvatar = comando("Ver avatar", 2);
    api.comandosDeContexto.mockResolvedValueOnce([traduzir, verAvatar]);

    useComandosDeContexto.getState().garantir("g_1");
    expect(api.comandosDeContexto).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(useComandosDeContexto.getState().doGuild("g_1")).toHaveLength(2));

    expect(useComandosDeContexto.getState().doTipo("g_1", 3)).toEqual([traduzir]);
    expect(useComandosDeContexto.getState().doTipo("g_1", 2)).toEqual([verAvatar]);
  });

  it("não dispara duas cargas para o mesmo servidor com uma já em voo", async () => {
    useComandosDeContexto.getState().garantir("g_1");
    useComandosDeContexto.getState().garantir("g_1");
    useComandosDeContexto.getState().garantir("g_1");
    await vi.waitFor(() => expect(useComandosDeContexto.getState().carregando["g_1"]).toBeFalsy());
    expect(api.comandosDeContexto).toHaveBeenCalledTimes(1);
  });

  it("já em cache: um novo guildId nem chama a rota de novo", async () => {
    useComandosDeContexto.getState().garantir("g_1");
    await vi.waitFor(() => expect(useComandosDeContexto.getState().carregando["g_1"]).toBeFalsy());
    useComandosDeContexto.getState().garantir("g_1");
    expect(api.comandosDeContexto).toHaveBeenCalledTimes(1);
  });

  it("rota fora do ar: cai em silêncio, e uma chamada seguinte tenta de novo", async () => {
    api.comandosDeContexto.mockRejectedValueOnce(new Error("offline"));
    useComandosDeContexto.getState().garantir("g_1");
    await vi.waitFor(() => expect(useComandosDeContexto.getState().carregando["g_1"]).toBeFalsy());
    expect(useComandosDeContexto.getState().doGuild("g_1")).toEqual([]);

    api.comandosDeContexto.mockResolvedValueOnce([comando("Ver avatar", 2)]);
    useComandosDeContexto.getState().garantir("g_1");
    await vi.waitFor(() => expect(useComandosDeContexto.getState().doGuild("g_1")).toHaveLength(1));
    expect(api.comandosDeContexto).toHaveBeenCalledTimes(2);
  });
});

describe("aplicarAtualizacao", () => {
  it("servidor nunca pedido: não chama a rota à toa", () => {
    useComandosDeContexto.getState().aplicarAtualizacao("g_nunca_visto");
    expect(api.comandosDeContexto).not.toHaveBeenCalled();
  });

  it("servidor já em cache: relista", async () => {
    api.comandosDeContexto.mockResolvedValueOnce([comando("Traduzir mensagem", 3)]);
    useComandosDeContexto.getState().garantir("g_1");
    await vi.waitFor(() => expect(useComandosDeContexto.getState().doGuild("g_1")).toHaveLength(1));

    api.comandosDeContexto.mockResolvedValueOnce([comando("Traduzir mensagem", 3), comando("Resumir", 3)]);
    useComandosDeContexto.getState().aplicarAtualizacao("g_1");
    await vi.waitFor(() => expect(useComandosDeContexto.getState().doGuild("g_1")).toHaveLength(2));
    expect(api.comandosDeContexto).toHaveBeenCalledTimes(2);
  });
});

describe("clear", () => {
  it("esvazia o cache de todos os servidores", async () => {
    api.comandosDeContexto.mockResolvedValueOnce([comando("Traduzir mensagem", 3)]);
    useComandosDeContexto.getState().garantir("g_1");
    await vi.waitFor(() => expect(useComandosDeContexto.getState().doGuild("g_1")).toHaveLength(1));

    useComandosDeContexto.getState().clear();
    expect(useComandosDeContexto.getState().porGuild).toEqual({});
    expect(useComandosDeContexto.getState().carregando).toEqual({});
  });
});
