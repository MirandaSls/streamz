import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O defeito: "a supressão de ruído avançada não funciona; só o padrão".
 *
 * A causa era a CSP da janela do desktop. O `RnnoiseWorkletNode` monta sem
 * reclamar, manda o `.wasm` pela porta e quem o instancia é o processador
 * dentro do `AudioWorkletGlobalScope` — num `async` sem `catch`. Com
 * `script-src` sem `'wasm-unsafe-eval'`, o Chromium recusa a compilação lá
 * dentro, o processador nunca fica pronto e o `process()` do pacote passa a
 * devolver **silêncio**. Nada aparecia no console, nada em nenhum `catch`
 * nosso: a pessoa ficava muda ao ligar a Avançada.
 *
 * Este teste guarda as duas metades da correção:
 *
 * 1. a sonda de WebAssembly recusa **antes** de criar o nó, a cadeia continua
 *    de pé (sem RNNoise, com o ganho) e o motivo chega a quem avisa o usuário;
 * 2. a CSP do `tauri.conf.json` continua com `'wasm-unsafe-eval'`.
 */

// o pacote real estende `AudioWorkletNode`, que não existe fora do browser
(globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {};

/** Quantos nós de RNNoise foram construídos — é o que prova o "nem tentou". */
let construidos = 0;

vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  loadRnnoise: async () => new ArrayBuffer(8),
  RnnoiseWorkletNode: class {
    onprocessorerror: (() => void) | null = null;
    constructor() {
      construidos += 1;
    }
    connect<T>(destino: T): T {
      return destino;
    }
    disconnect() {}
    destroy() {}
  },
}));

class FaixaFalsaDeMidia {
  kind = "audio";
  readyState: "live" | "ended" = "live";
  enabled = true;
  stop() {
    this.readyState = "ended";
  }
}

function no() {
  return {
    connect<T>(destino: T): T {
      return destino;
    },
    disconnect() {},
  };
}

class ContextoFalso {
  state: "running" | "suspended" | "closed" = "running";
  sampleRate = 48_000;
  currentTime = 0;
  audioWorklet = { addModule: async () => {} };
  createMediaStreamSource() {
    return no();
  }
  createGain() {
    return {
      ...no(),
      gain: {
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        setTargetAtTime: () => {},
      },
    };
  }
  createMediaStreamDestination() {
    return {
      ...no(),
      stream: {
        getTracks: () => [new FaixaFalsaDeMidia()],
        getAudioTracks: () => [new FaixaFalsaDeMidia()],
      },
    };
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
}

/** `WebAssembly` como o Chromium o entrega sob uma CSP sem `'wasm-unsafe-eval'`. */
const WASM_BLOQUEADO = {
  compile: async () => {
    throw new Error(
      "WebAssembly.compile(): Compiling or instantiating WebAssembly module violates the " +
        "following Content Security policy directive because 'unsafe-eval' is not an allowed source",
    );
  },
};

const WASM_LIVRE = { compile: async () => ({}) };

async function montarCadeia() {
  const { cadeiaDoMicrofone } = await import("@/lib/supressor-ruido");
  const cadeia = cadeiaDoMicrofone({ supressao: true, ganho: 1 });
  await cadeia.init({ track: new FaixaFalsaDeMidia() } as never);
  return cadeia;
}

describe("supressão avançada indisponível", () => {
  beforeEach(async () => {
    construidos = 0;
    vi.stubGlobal("AudioContext", ContextoFalso);
    vi.stubGlobal("MediaStream", class {
      constructor(public faixas: unknown[]) {}
    });
    const { aoFalharASupressao, esquecerSupressaoIndisponivel } = await import(
      "@/lib/supressor-ruido"
    );
    aoFalharASupressao(null);
    esquecerSupressaoIndisponivel();
  });

  it("com WebAssembly bloqueado pela CSP: não cria o nó, avisa, e a cadeia continua", async () => {
    vi.stubGlobal("WebAssembly", WASM_BLOQUEADO);
    const { aoFalharASupressao, supressaoIndisponivel } = await import("@/lib/supressor-ruido");
    const avisos: string[] = [];
    aoFalharASupressao((motivo) => avisos.push(motivo));

    const cadeia = await montarCadeia();

    // 1. nem tentou montar o nó que devolveria silêncio
    expect(construidos).toBe(0);
    // 2. a voz continua subindo: a cadeia existe, só que sem o RNNoise
    expect(cadeia.processedTrack).toBeDefined();
    // 3. e a falha é dita, em vez de sumir dentro do worklet
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/política de segurança/);
    expect(supressaoIndisponivel()).toBe(avisos[0]);

    await cadeia.destroy();
  });

  it("com WebAssembly liberado: monta o RNNoise e não avisa nada", async () => {
    vi.stubGlobal("WebAssembly", WASM_LIVRE);
    const { aoFalharASupressao, supressaoIndisponivel } = await import("@/lib/supressor-ruido");
    const avisos: string[] = [];
    aoFalharASupressao((motivo) => avisos.push(motivo));

    const cadeia = await montarCadeia();

    expect(construidos).toBe(1);
    expect(avisos).toEqual([]);
    expect(supressaoIndisponivel()).toBeNull();

    await cadeia.destroy();
  });

  it("a CSP do desktop deixa o Chromium compilar WebAssembly", () => {
    const conf = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../../desktop/src-tauri/tauri.conf.json"),
        "utf8",
      ),
    ) as { app: { security: { csp: Record<string, string> } } };
    // sem isto o RNNoise sobe mudo no desktop e ninguém fica sabendo
    expect(conf.app.security.csp["script-src"]).toContain("'wasm-unsafe-eval'");
  });
});
