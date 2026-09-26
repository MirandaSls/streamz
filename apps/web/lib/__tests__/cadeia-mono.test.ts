import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O defeito: em chamada de voz, cada pessoa ouvia a outra só no fone esquerdo.
 *
 * Causa: o processador do RNNoise (`maxChannels: 1`) só roda o canal 0; com um
 * microfone estéreo, o nó devolvia 2 canais com o 1 zerado. O
 * `MediaStreamAudioDestinationNode` nasce com `channelCount` 2 por padrão, então
 * a faixa publicada saía estéreo com o canal direito mudo — e mesmo sem
 * supressão, um microfone estéreo passando puro pelo destino de 2 canais
 * publicaria estéreo de verdade. Dos dois jeitos o livekit-client lê
 * `channelCount === 2` em `getSettings()` e publica com `stereo=1`.
 *
 * Este teste guarda a correção: o nó do RNNoise e o destino ficam fixados em
 * mono (`channelCount: 1`, `channelCountMode: "explicit"`), então a faixa
 * publicada é sempre 1 canal, com ou sem a supressão avançada ligada.
 */

// o pacote real estende `AudioWorkletNode`, que não existe fora do browser
(globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {};

/** O último nó de RNNoise construído — é nele que o teste confere o `channelCount`. */
let ultimoNoDoModelo: { channelCount: number; channelCountMode: string } | null = null;

vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  loadRnnoise: async () => new ArrayBuffer(8),
  RnnoiseWorkletNode: class {
    onprocessorerror: (() => void) | null = null;
    channelCount = 2;
    channelCountMode: ChannelCountMode = "max";
    channelInterpretation: ChannelInterpretation = "speakers";
    constructor() {
      ultimoNoDoModelo = this;
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

class DestinoFalso {
  channelCount = 2;
  channelCountMode: ChannelCountMode = "max";
  channelInterpretation: ChannelInterpretation = "speakers";
  connect<T>(destino: T): T {
    return destino;
  }
  disconnect() {}
  stream = {
    getTracks: () => [new FaixaFalsaDeMidia()],
    getAudioTracks: () => [new FaixaFalsaDeMidia()],
  };
}

class ContextoFalso {
  state: "running" | "suspended" | "closed" = "running";
  sampleRate = 48_000;
  currentTime = 0;
  audioWorklet = { addModule: async () => {} };
  /** O último destino criado — é nele que o teste confere o `channelCount`. */
  ultimoDestino: DestinoFalso | null = null;
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
    this.ultimoDestino = new DestinoFalso();
    return this.ultimoDestino;
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

async function montarCadeia(supressao: boolean) {
  const { cadeiaDoMicrofone } = await import("@/lib/supressor-ruido");
  const cadeia = cadeiaDoMicrofone({ supressao, ganho: 1 });
  await cadeia.init({ track: new FaixaFalsaDeMidia() } as never);
  return cadeia;
}

describe("cadeia do microfone fica mono", () => {
  let contexto: ContextoFalso;

  beforeEach(() => {
    // cada teste começa sem contexto nenhum de pé: eles são módulo-globais e
    // nunca são fechados (ver o cabeçalho de `lib/supressor-ruido.ts`)
    vi.resetModules();
    ultimoNoDoModelo = null;
    contexto = new ContextoFalso();
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          return contexto;
        }
      },
    );
    vi.stubGlobal(
      "MediaStream",
      class {
        constructor(public faixas: unknown[]) {}
      },
    );
  });

  it("sem supressão: o destino é forçado a 1 canal", async () => {
    const cadeia = await montarCadeia(false);

    expect(contexto.ultimoDestino?.channelCount).toBe(1);
    expect(contexto.ultimoDestino?.channelCountMode).toBe("explicit");

    await cadeia.destroy();
  });

  it("com supressão: o nó do RNNoise e o destino ficam os dois em 1 canal", async () => {
    const cadeia = await montarCadeia(true);

    expect(ultimoNoDoModelo?.channelCount).toBe(1);
    expect(ultimoNoDoModelo?.channelCountMode).toBe("explicit");
    expect(contexto.ultimoDestino?.channelCount).toBe(1);
    expect(contexto.ultimoDestino?.channelCountMode).toBe("explicit");

    await cadeia.destroy();
  });
});
