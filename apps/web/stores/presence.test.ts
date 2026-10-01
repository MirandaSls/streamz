import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_APOS_MS } from "@streamz/shared";
import type { PublicUser, UserStatus } from "@streamz/shared";

/**
 * `useAutoIdle` roda dentro de um `useEffect` de verdade, mas o projeto não
 * tem `@testing-library/react` nem ambiente jsdom (`vitest.config.ts` usa
 * `environment: "node"` com stubs mínimos — ver `test/ambiente.ts`). Trocamos
 * `useEffect`/`useRef` por versões sem ciclo de render (`useEffect` chama a
 * função na hora e guarda o cleanup; `useRef` vira uma caixa mutável simples):
 * o suficiente para exercitar o efeito de verdade — os `addEventListener` e o
 * `setTimeout` são os do hook — sem inventar um DOM inteiro.
 */
const cleanups: Array<(() => void) | undefined> = [];
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    useRef: <T,>(inicial: T) => ({ current: inicial }),
    useEffect: (efeito: () => void | (() => void)) => {
      // `void | (() => void)` não é atribuível a `(() => void) | undefined`
      // direto (TS trata os dois `void` como coisas diferentes aqui) — o
      // `typeof` estreita para função ou vira `undefined` explícito
      const limpeza = efeito();
      cleanups.push(typeof limpeza === "function" ? limpeza : undefined);
    },
  };
});

// devolve o usuário com o status pedido (null = volta ao ONLINE), como a API
// real: o hook grava o retorno no `useAuth`, e os testes leem o status de lá
const api = vi.hoisted(() => ({
  updateStatus: vi.fn(
    async (status: UserStatus | null) =>
      ({
        id: "u1",
        username: "ana",
        displayName: null,
        avatarUrl: null,
        status: status ?? "ONLINE",
        customStatusText: null,
        customStatusEmoji: null,
      }) as PublicUser,
  ),
}));
vi.mock("@/lib/api", () => ({ api }));

import { useAuth } from "@/stores/auth";
import { definirStatusManual, useAutoIdle } from "./presence";

const ONLINE: PublicUser = {
  id: "u1",
  username: "ana",
  displayName: null,
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
  manualStatusExpiresAt: null,
};

/** Stub de `window`/`document`: `EventTarget` de verdade (add/removeEventListener
 * e dispatchEvent reais) mais o que o hook usa e o `test/ambiente.ts` não cobre. */
function stubJanelaEDocumento() {
  const janela = Object.assign(new EventTarget(), {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
  });
  vi.stubGlobal("window", janela);

  const documento = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  vi.stubGlobal("document", documento);

  return { janela, documento };
}

beforeEach(() => {
  vi.useFakeTimers();
  cleanups.length = 0;
  api.updateStatus.mockClear();
  useAuth.setState({ user: ONLINE });
});

afterEach(() => {
  for (const limpar of cleanups.splice(0)) limpar?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAutoIdle — visibilitychange", () => {
  it("inatividade por IDLE_APOS_MS marca ausente automático", async () => {
    stubJanelaEDocumento();
    useAutoIdle(true);

    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);

    expect(api.updateStatus).toHaveBeenCalledWith("IDLE");
  });

  it("esconder a aba (alt-tab, minimizar) não desfaz o ausente automático", async () => {
    const { documento } = stubJanelaEDocumento();
    useAutoIdle(true);
    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);
    expect(api.updateStatus).toHaveBeenCalledWith("IDLE");
    api.updateStatus.mockClear();

    // era o bug: `visibilitychange` ao ESCONDER também rodava `voltar()`, que
    // via `posto.current === true` e desfazia o ausente sem o usuário ter
    // voltado — sair da janela não é volta, é o oposto
    documento.visibilityState = "hidden";
    documento.dispatchEvent(new Event("visibilitychange"));

    expect(api.updateStatus).not.toHaveBeenCalled();
  });

  it("a aba voltar a ficar visível desfaz o ausente automático", async () => {
    const { documento } = stubJanelaEDocumento();
    useAutoIdle(true);
    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);
    expect(api.updateStatus).toHaveBeenCalledWith("IDLE");
    api.updateStatus.mockClear();

    documento.visibilityState = "visible";
    documento.dispatchEvent(new Event("visibilitychange"));

    expect(api.updateStatus).toHaveBeenCalledWith(null);
  });
});

/** Simula o `presence.update` do próprio usuário (é o que o `useRealtime` faz). */
function statusChegouPeloSocket(status: UserStatus) {
  useAuth.setState({ user: { ...useAuth.getState().user!, status } });
}

const CHAVE = "streamz:auto-idle:u1";

describe("useAutoIdle — volta do ausente automático", () => {
  it("queda de socket durante o ausente não prende o usuário em ausente", async () => {
    const { janela } = stubJanelaEDocumento();
    useAutoIdle(true);
    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);
    expect(useAuth.getState().user?.status).toBe("IDLE");
    api.updateStatus.mockClear();

    // era o bug: o IDLE→OFFLINE apagava a marca, e na reconexão o servidor
    // reaplicava o IDLE sem ninguém para desfazê-lo
    statusChegouPeloSocket("OFFLINE");
    janela.dispatchEvent(new Event("mousemove"));
    expect(api.updateStatus).not.toHaveBeenCalled();

    statusChegouPeloSocket("IDLE");
    janela.dispatchEvent(new Event("mousemove"));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.updateStatus).toHaveBeenCalledWith(null);
    expect(useAuth.getState().user?.status).toBe("ONLINE");
  });

  it.each(["ONLINE", "OFFLINE"] as const)(
    "marca no localStorage com user do cache %s ainda desfaz o ausente depois",
    async (doCache) => {
      localStorage.setItem(CHAVE, "1");
      useAuth.setState({ user: { ...ONLINE, status: doCache } });
      const { janela } = stubJanelaEDocumento();
      useAutoIdle(true);

      // conexão confirma o IDLE que o auto-idle tinha gravado antes do reload
      statusChegouPeloSocket("IDLE");
      janela.dispatchEvent(new Event("keydown"));
      await vi.advanceTimersByTimeAsync(0);

      expect(api.updateStatus).toHaveBeenCalledWith(null);
      expect(localStorage.getItem(CHAVE)).toBeNull();
    },
  );

  it("rajada de eventos desfaz o ausente uma vez só", async () => {
    const { janela } = stubJanelaEDocumento();
    useAutoIdle(true);
    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);
    api.updateStatus.mockClear();

    for (let i = 0; i < 5; i++) janela.dispatchEvent(new Event("mousemove"));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.updateStatus).toHaveBeenCalledTimes(1);
    expect(api.updateStatus).toHaveBeenCalledWith(null);
  });

  it("voltar com o IDLE ainda em voo desfaz depois que ele termina", async () => {
    let soltarIdle!: () => void;
    api.updateStatus.mockImplementationOnce(
      (status) =>
        new Promise<PublicUser>((resolve) => {
          soltarIdle = () => resolve({ ...ONLINE, status: status ?? "ONLINE" });
        }),
    );
    const { janela } = stubJanelaEDocumento();
    useAutoIdle(true);
    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);
    expect(api.updateStatus).toHaveBeenLastCalledWith("IDLE");

    // status ainda ONLINE: sem saber do voo, isso pareceria marca obsoleta
    janela.dispatchEvent(new Event("mousemove"));
    expect(api.updateStatus).toHaveBeenCalledTimes(1);

    soltarIdle();
    await vi.advanceTimersByTimeAsync(0);

    expect(api.updateStatus).toHaveBeenCalledTimes(2);
    expect(api.updateStatus).toHaveBeenLastCalledWith(null);
    expect(useAuth.getState().user?.status).toBe("ONLINE");
  });

  it("marca obsoleta (outro status escolhido noutro aparelho) some sem chamar a API", async () => {
    const { janela } = stubJanelaEDocumento();
    useAutoIdle(true);
    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);
    api.updateStatus.mockClear();

    statusChegouPeloSocket("DND");
    janela.dispatchEvent(new Event("mousemove"));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.updateStatus).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });
});

describe("definirStatusManual", () => {
  it("escolher DND durante o ausente automático tira a posse do auto-idle", async () => {
    const { janela } = stubJanelaEDocumento();
    useAutoIdle(true);
    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);

    const resultado = await definirStatusManual("DND");
    expect(resultado.status).toBe("DND");
    expect(useAuth.getState().user?.status).toBe("DND");
    expect(localStorage.getItem(CHAVE)).toBeNull();
    api.updateStatus.mockClear();

    janela.dispatchEvent(new Event("mousemove"));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.updateStatus).not.toHaveBeenCalledWith(null);
  });

  it("escolher um status com o IDLE em voo cancela a volta encadeada", async () => {
    let soltarIdle!: () => void;
    api.updateStatus.mockImplementationOnce(
      (status) =>
        new Promise<PublicUser>((resolve) => {
          soltarIdle = () => resolve({ ...ONLINE, status: status ?? "ONLINE" });
        }),
    );
    const { janela } = stubJanelaEDocumento();
    useAutoIdle(true);
    await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);
    janela.dispatchEvent(new Event("mousemove"));

    await definirStatusManual("DND");
    soltarIdle();
    await vi.advanceTimersByTimeAsync(0);

    expect(api.updateStatus).not.toHaveBeenCalledWith(null);
    // a resposta velha do IDLE não pinta ausente por cima da escolha
    expect(useAuth.getState().user?.status).toBe("DND");
  });

  it("erro da API propaga para quem chamou", async () => {
    api.updateStatus.mockRejectedValueOnce(new Error("falhou"));
    await expect(definirStatusManual("IDLE")).rejects.toThrow("falhou");
  });
});

describe("useAutoIdle — status escolhido à mão", () => {
  it.each(["DND", "IDLE"] as const)(
    "%s manual não é promovido a ausente nem restaurado",
    async (manual) => {
      useAuth.setState({ user: { ...ONLINE, status: manual } });
      const { janela } = stubJanelaEDocumento();
      useAutoIdle(true);

      await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);
      janela.dispatchEvent(new Event("mousemove"));
      await vi.advanceTimersByTimeAsync(IDLE_APOS_MS);

      expect(api.updateStatus).not.toHaveBeenCalled();
    },
  );
});
