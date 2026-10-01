import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O handshake do socket precisa da versão para o piso da API valer já no
 * primeiro connect, mas não pode ficar refém do Tauri: a espera tem teto.
 */

function fingirDesktop() {
  (window as unknown as { isTauri?: boolean }).isTauri = true;
}

beforeEach(() => {
  // o módulo memoriza versão e leitura; cada teste começa do zero
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("@tauri-apps/api/app");
});

describe("versaoDoAppPronta", () => {
  it("espera a versão carregar e a identificação sai com ela", async () => {
    fingirDesktop();
    vi.doMock("@tauri-apps/api/app", () => ({ getVersion: async () => "9.9.9" }));
    const { identificacaoDoCliente, versaoDoAppPronta } = await import("../desktop");
    await versaoDoAppPronta();
    expect(identificacaoDoCliente()).toBe("desktop/9.9.9");
  });

  it("se getVersion nunca resolve, termina no limite e fica em 'desktop'", async () => {
    fingirDesktop();
    vi.doMock("@tauri-apps/api/app", () => ({ getVersion: () => new Promise<string>(() => {}) }));
    const { identificacaoDoCliente, versaoDoAppPronta } = await import("../desktop");
    vi.useFakeTimers();
    let terminou = false;
    const espera = versaoDoAppPronta(1500).then(() => {
      terminou = true;
    });
    await vi.advanceTimersByTimeAsync(1499);
    expect(terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await espera;
    expect(terminou).toBe(true);
    expect(identificacaoDoCliente()).toBe("desktop");
  });

  it("fora do Tauri resolve na hora e não se identifica", async () => {
    const { identificacaoDoCliente, versaoDoAppPronta } = await import("../desktop");
    vi.useFakeTimers();
    await versaoDoAppPronta();
    expect(identificacaoDoCliente()).toBeNull();
  });
});
