import { afterEach, describe, expect, it, vi } from "vitest";
import { SEM_CAPTURA_DE_TELA, capturarTelaNoNavegador, suportaCapturaDeTela } from "./captura-de-tela";

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function fingirNavegador(mediaDevices: unknown) {
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
});

describe("detecção de suporte", () => {
  it("sem `getDisplayMedia` não há compartilhamento (Safari do iOS, Chrome do Android)", () => {
    fingirNavegador({});
    expect(suportaCapturaDeTela()).toBe(false);
  });

  it("sem `mediaDevices` (http fora de localhost) também não", () => {
    fingirNavegador(undefined);
    expect(suportaCapturaDeTela()).toBe(false);
  });

  it("com a função, sim", () => {
    fingirNavegador({ getDisplayMedia: () => Promise.resolve({}) });
    expect(suportaCapturaDeTela()).toBe(true);
  });
});

describe("captura", () => {
  it("devolve `null` quando não há suporte — e nunca inventa uma captura", async () => {
    fingirNavegador({});
    await expect(capturarTelaNoNavegador("1080p30", false)).resolves.toBeNull();
  });

  it("chama `getDisplayMedia` com as restrições do preset", async () => {
    const getDisplayMedia = vi.fn().mockResolvedValue("faixa");
    fingirNavegador({ getDisplayMedia });
    await expect(capturarTelaNoNavegador("1080p30", true)).resolves.toBe("faixa");
    const opcoes = getDisplayMedia.mock.calls[0][0];
    expect(opcoes.video).toMatchObject({ width: 1920, height: 1080 });
    expect(opcoes.audio).not.toBe(false);
  });
});

describe("a frase do botão apagado", () => {
  it("diz onde a coisa funciona, não só que não funciona", () => {
    expect(SEM_CAPTURA_DE_TELA).toContain("use o app no computador");
  });
});
