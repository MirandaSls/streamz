import { beforeEach, describe, expect, it, vi } from "vitest";
import { resposta } from "./ajudantes";

/**
 * O app de desktop precisa se declarar: dentro do Tauri o `User-Agent` é o do
 * Edge (WebView2), então o cabeçalho `X-Streamz-Client` é a única coisa que a
 * API tem para separar "app instalado" de "aba do navegador".
 */

vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "9.9.9" }));

/** Faz o `isTauri()` responder `true` no `window` que o setup recria. */
function fingirDesktop() {
  (window as unknown as { isTauri?: boolean }).isTauri = true;
}

beforeEach(() => {
  // o módulo memoriza a versão lida; cada teste começa do zero
  vi.resetModules();
});

describe("cabecalhoDoCliente", () => {
  it("não manda nada no navegador", async () => {
    const { cabecalhoDoCliente } = await import("../cliente");
    expect(cabecalhoDoCliente()).toEqual({});
  });

  it("no desktop responde já na primeira chamada, sem esperar a versão", async () => {
    fingirDesktop();
    const { cabecalhoDoCliente } = await import("../cliente");
    // o login não pode esperar por um `await`: sai sem versão e o tipo já basta
    expect(cabecalhoDoCliente()).toEqual({ "X-Streamz-Client": "desktop" });
    await vi.waitFor(() =>
      expect(cabecalhoDoCliente()).toEqual({ "X-Streamz-Client": "desktop/9.9.9" }),
    );
  });
});

describe("cabeçalho nas requisições que criam sessão", () => {
  function servidorFalso() {
    const chamadas: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push({ url, init });
        return resposta(200, { accessToken: "a", refreshToken: "r" });
      }),
    );
    return chamadas;
  }

  function cliente(init: RequestInit | undefined): string | undefined {
    return (init?.headers as Record<string, string> | undefined)?.["X-Streamz-Client"];
  }

  it("vai no login (é ali que a sessão nasce)", async () => {
    fingirDesktop();
    const chamadas = servidorFalso();
    const { api } = await import("../api");
    await api.login("mdz", "senha");
    expect(chamadas[0].url).toContain("/api/auth/login");
    expect(cliente(chamadas[0].init)).toBe("desktop");
  });

  it("vai no refresh — é o que reclassifica quem já estava logado", async () => {
    fingirDesktop();
    localStorage.setItem("refreshToken", "refresh-antigo");
    const chamadas = servidorFalso();
    const { renovarTokens } = await import("../session");
    await renovarTokens();
    expect(chamadas[0].url).toContain("/api/auth/refresh");
    expect(cliente(chamadas[0].init)).toBe("desktop");
  });

  it("no navegador nenhuma das duas manda o cabeçalho", async () => {
    localStorage.setItem("refreshToken", "refresh-antigo");
    const chamadas = servidorFalso();
    const { renovarTokens } = await import("../session");
    await renovarTokens();
    expect(cliente(chamadas[0].init)).toBeUndefined();
  });
});
