import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_APOS_MS } from "@streamz/shared";
import type { PublicUser } from "@streamz/shared";

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

const api = vi.hoisted(() => ({
  updateStatus: vi.fn(async (_status: "IDLE" | null) => ({}) as PublicUser),
}));
vi.mock("@/lib/api", () => ({ api }));

import { useAuth } from "@/stores/auth";
import { useAutoIdle } from "./presence";

const ONLINE: PublicUser = {
  id: "u1",
  username: "ana",
  displayName: null,
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
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
