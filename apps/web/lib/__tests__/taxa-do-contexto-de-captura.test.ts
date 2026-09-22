import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Quem abre `AudioContext` com **taxa forçada**, e quando.
 *
 * Contexto: usuários relatam que entrar numa chamada estraga o áudio dos outros
 * aplicativos, com **qualquer** configuração de supressão de ruído — inclusive
 * desligada. Um `new AudioContext({ sampleRate: 48_000 })` ficava aberto do
 * começo ao fim de toda call, e quem o mantinha não era o supressor: era o
 * detector local de fala, armado sempre, que só mede nível e não depende de
 * taxa nenhuma.
 *
 * **Isto não prova causa.** Não há evidência de que o contexto forçado produza
 * o sintoma — as três hipóteses anteriores foram descartadas. É eliminação de
 * suspeito: 48 kHz é exigência do RNNoise, então é só na cadeia do RNNoise que
 * eles são pedidos. O que este teste guarda é essa regra, que de outro modo
 * volta em silêncio na próxima mexida — a taxa de um contexto não aparece em
 * lugar nenhum da UI.
 */

// o pacote real estende `AudioWorkletNode`, que não existe fora do browser
(globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {};

vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  loadRnnoise: async () => new ArrayBuffer(8),
  RnnoiseWorkletNode: class {
    onprocessorerror: (() => void) | null = null;
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

/** Todo contexto criado no teste, com a taxa que foi **pedida** (ou nenhuma). */
const contextos: ContextoFalso[] = [];

class ContextoFalso {
  state: "running" | "suspended" | "closed" = "running";
  /** `undefined` = ninguém pediu taxa; o aparelho decide. É o que se afere. */
  taxaPedida: number | undefined;
  sampleRate: number;
  currentTime = 0;
  audioWorklet = { addModule: async () => {} };
  constructor(opts?: { sampleRate?: number }) {
    this.taxaPedida = opts?.sampleRate;
    // 44,1 kHz como um Mac qualquer: o dublê não obedece ao pedido por acaso
    this.sampleRate = opts?.sampleRate ?? 44_100;
    contextos.push(this);
  }
  createMediaStreamSource() {
    return no();
  }
  createAnalyser() {
    return {
      ...no(),
      fftSize: 1024,
      getByteTimeDomainData: (destino: Uint8Array) => destino.fill(128),
    };
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

/** Uma `Room` do LiveKit com uma faixa de microfone publicada e aberta. */
function salaComMicrofone(faixa: FaixaFalsaDeMidia) {
  return {
    localParticipant: {
      getTrackPublication: () => ({ isMuted: false, track: { mediaStreamTrack: faixa } }),
    },
  } as never;
}

async function montarCadeia(supressao: boolean) {
  const { cadeiaDoMicrofone } = await import("@/lib/supressor-ruido");
  const cadeia = cadeiaDoMicrofone({ supressao, ganho: 1.5 });
  await cadeia.init({ track: new FaixaFalsaDeMidia() } as never);
  return cadeia;
}

const taxasPedidas = () => contextos.map((c) => c.taxaPedida);

describe("taxa do contexto de captura", () => {
  beforeEach(() => {
    contextos.length = 0;
    // cada teste começa sem contexto nenhum de pé: eles são módulo-globais e
    // nunca são fechados (ver o cabeçalho de `lib/supressor-ruido.ts`)
    vi.resetModules();
    vi.stubGlobal("AudioContext", ContextoFalso);
    vi.stubGlobal("MediaStream", class {
      constructor(public faixas: unknown[]) {}
    });
  });

  it("o detector local de fala não pede taxa nenhuma", async () => {
    const { armarDetectorLocal, desarmarDetectorLocal } = await import(
      "@/stores/voz-detector-local"
    );

    armarDetectorLocal(salaComMicrofone(new FaixaFalsaDeMidia()), () => {});

    // era este o contexto de 48 kHz que ficava aberto em TODA chamada
    expect(taxasPedidas()).toEqual([undefined]);

    desarmarDetectorLocal(() => {});
    // sem dono, suspenso — não fechado: recriá-lo a cada call era o vazamento
    expect(contextos[0]?.state).toBe("suspended");
  });

  it("a cadeia sem supressão avançada (só ganho) também roda na taxa do aparelho", async () => {
    const cadeia = await montarCadeia(false);
    expect(taxasPedidas()).toEqual([undefined]);
    await cadeia.destroy();
  });

  it("a cadeia com supressão avançada abre o contexto de 48 kHz", async () => {
    // o RNNoise assume essa taxa: em 44,1 kHz devolveria a voz com a altura
    // errada, e aqui a exigência é real
    const cadeia = await montarCadeia(true);
    expect(taxasPedidas()).toEqual([48_000]);
    await cadeia.destroy();
  });

  it("com a cadeia avançada no ar, o detector usa o contexto dela em vez de abrir outro", async () => {
    const cadeia = await montarCadeia(true);
    const { armarDetectorLocal, desarmarDetectorLocal } = await import(
      "@/stores/voz-detector-local"
    );

    armarDetectorLocal(salaComMicrofone(new FaixaFalsaDeMidia()), () => {});

    // um contexto só: dois abertos ao mesmo tempo seria trocar um custo por outro
    expect(contextos).toHaveLength(1);
    expect(contextos[0]?.taxaPedida).toBe(48_000);

    // e a contagem de donos é por contexto: sair da cadeia com o detector ainda
    // medindo não pode suspender o contexto embaixo dele
    await cadeia.destroy();
    expect(contextos[0]?.state).toBe("running");
    desarmarDetectorLocal(() => {});
    expect(contextos[0]?.state).toBe("suspended");
  });
});
