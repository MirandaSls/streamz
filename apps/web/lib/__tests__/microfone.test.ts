import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O ciclo de vida do microfone: entrar → ligar/desligar supressão → trocar de
 * microfone → sair → entrar de novo, N vezes.
 *
 * O que este teste guarda é o defeito que o usuário descreveu como "ao sair e
 * entrar da call muitas vezes a supressão de ruído buga": cada `init()` do
 * supressor antigo podia abrir uma `AudioContext` nova, e a `destroy()` que a
 * fecharia é chamada pelo LiveKit **sem `await`**. Ao encostar no teto de
 * contextos do Chromium (≈6 por página), `new AudioContext()` passa a lançar e
 * a supressão morre até o F5. Daí a asserção: depois de N ciclos, no máximo um
 * contexto e uma faixa vivos.
 *
 * A `FaixaFalsa` imita o `LocalAudioTrack` de propósito, inclusive nos vícios
 * que importam (o `stop()` chama a `destroy()` do processador sem esperar por
 * ela): um dublê educado demais não pegaria o defeito.
 */

// o pacote real estende `AudioWorkletNode`, que não existe fora do browser: o
// dublê troca o módulo inteiro, e o `globalThis` cobre o caso de o vitest
// resolver o arquivo antes do mock
(globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {};

vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  loadRnnoise: async () => new ArrayBuffer(8),
  RnnoiseWorkletNode: class {
    constructor(
      public ctx: unknown,
      public opts: unknown,
    ) {}
    connect<T>(destino: T): T {
      return destino;
    }
    disconnect() {}
    destroy() {}
  },
}));

/* ---------------------------------------------------------------- */
/* Dublês de browser                                                 */
/* ---------------------------------------------------------------- */

/** Toda faixa criada no teste, para contar quantas continuam vivas. */
const faixas: FaixaFalsaDeMidia[] = [];

class FaixaFalsaDeMidia {
  kind = "audio";
  readyState: "live" | "ended" = "live";
  enabled = true;
  constructor() {
    faixas.push(this);
  }
  stop() {
    this.readyState = "ended";
  }
  getSettings() {
    return { deviceId: "padrao" };
  }
  addEventListener() {}
  removeEventListener() {}
}

class StreamFalso {
  constructor(private faixas: FaixaFalsaDeMidia[]) {}
  getTracks() {
    return this.faixas;
  }
  getAudioTracks() {
    return this.faixas;
  }
}

/** Todo `AudioContext` criado no teste; `close()`/`suspend()` marcam o estado. */
const contextos: ContextoFalso[] = [];

class ContextoFalso {
  state: "running" | "suspended" | "closed" = "running";
  sampleRate: number;
  currentTime = 0;
  audioWorklet = { addModule: async () => {} };
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 44_100;
    contextos.push(this);
  }
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
    return { ...no(), stream: new StreamFalso([new FaixaFalsaDeMidia()]) };
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

function no() {
  return {
    connect<T>(destino: T): T {
      return destino;
    },
    disconnect() {},
  };
}

/* ---------------------------------------------------------------- */
/* Dublê da faixa local do LiveKit                                   */
/* ---------------------------------------------------------------- */

interface ProcessadorFalso {
  init(opts: { track: unknown; audioContext: unknown; kind: string }): Promise<void>;
  restart(opts: { track: unknown; audioContext: unknown; kind: string }): Promise<void>;
  destroy(): Promise<void>;
  processedTrack?: unknown;
}

class FaixaFalsa {
  processor: ProcessadorFalso | null = null;
  mudo = false;
  parada = false;
  private ctx: AudioContext | undefined;

  constructor(public midia: FaixaFalsaDeMidia) {}

  /** como o `LocalTrack`: a faixa processada quando há processador. */
  get mediaStreamTrack(): FaixaFalsaDeMidia {
    return (this.processor?.processedTrack as FaixaFalsaDeMidia | undefined) ?? this.midia;
  }

  setAudioContext(ctx: AudioContext | undefined) {
    this.ctx = ctx;
  }
  async setProcessor(p: ProcessadorFalso) {
    if (!this.ctx) throw new Error("Audio context needs to be set on LocalAudioTrack");
    if (this.processor) await this.processor.destroy();
    await p.init({ track: this.midia, audioContext: this.ctx, kind: "audio" });
    this.processor = p;
  }
  async stopProcessor() {
    await this.processor?.destroy();
    this.processor = null;
  }
  async restartTrack() {
    const nova = new FaixaFalsaDeMidia();
    this.midia.stop();
    this.midia = nova;
    // é o que o `LocalTrack.restart` faz: reinicia o processador na faixa nova
    await this.processor?.restart({ track: nova, audioContext: this.ctx, kind: "audio" });
  }
  async mute() {
    this.mudo = true;
  }
  async unmute() {
    this.mudo = false;
  }
  stop() {
    this.parada = true;
    this.midia.stop();
    // como o LiveKit: dispara a `destroy()` e NÃO espera por ela
    void this.processor?.destroy();
    this.processor = null;
  }
}

const publicadas = new Set<FaixaFalsa>();

function salaFalsa() {
  return {
    criarFaixa: async () => {
      const stream = (await navigator.mediaDevices.getUserMedia({
        audio: true,
      })) as unknown as StreamFalso;
      return new FaixaFalsa(stream.getAudioTracks()[0]) as unknown as FaixaFalsa;
    },
    publicar: async (f: FaixaFalsa) => void publicadas.add(f),
    despublicar: async (f: FaixaFalsa) => void publicadas.delete(f),
  };
}

/* ---------------------------------------------------------------- */

function prefs(patch: Partial<{ supressao: boolean; ganho: number; deviceId: string }> = {}) {
  return {
    restricoes: {
      ...(patch.deviceId ? { deviceId: patch.deviceId } : {}),
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: true,
    },
    supressao: patch.supressao ?? false,
    ganho: patch.ganho ?? 1,
    aberto: true,
  };
}

const vivas = () => faixas.filter((f) => f.readyState === "live").length;
const contextosVivos = () => contextos.filter((c) => c.state !== "closed").length;

describe("dono da faixa de microfone", () => {
  beforeEach(() => {
    faixas.length = 0;
    contextos.length = 0;
    publicadas.clear();
    vi.stubGlobal("AudioContext", ContextoFalso);
    vi.stubGlobal("MediaStream", class {
      constructor(public faixas: unknown[]) {}
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: async () => new StreamFalso([new FaixaFalsaDeMidia()]),
      },
    });
  });

  it("depois de dez entradas e saídas sobra no máximo um contexto e uma faixa", async () => {
    const { abrirMicrofone, atualizarMicrofone, fecharMicrofone } = await import(
      "@/lib/microfone"
    );
    const { cadeiasMontadas } = await import("@/lib/supressor-ruido");

    for (let i = 0; i < 10; i++) {
      // entrar
      await abrirMicrofone(salaFalsa() as never, prefs());
      // ligar a supressão avançada e mexer no volume
      await atualizarMicrofone(prefs({ supressao: true, ganho: 1.5 }));
      await atualizarMicrofone(prefs({ supressao: true, ganho: 0.4 }));
      // trocar de microfone
      await atualizarMicrofone(prefs({ supressao: true, ganho: 0.4, deviceId: `mic-${i}` }));
      // desligar a supressão
      await atualizarMicrofone(prefs({ supressao: false, ganho: 1 }));
      // sair
      await fecharMicrofone();
      // sair duas vezes é o caso do usuário impaciente: tem de ser inofensivo
      await fecharMicrofone();
    }

    expect(contextosVivos()).toBeLessThanOrEqual(1);
    expect(vivas()).toBe(0);
    expect(cadeiasMontadas()).toBe(0);
    expect(publicadas.size).toBe(0);
  });

  it("mantém uma faixa publicada só, com a cadeia montada, enquanto a call dura", async () => {
    const { abrirMicrofone, atualizarMicrofone, fecharMicrofone, faixaDoMicrofone } = await import(
      "@/lib/microfone"
    );
    const { cadeiasMontadas } = await import("@/lib/supressor-ruido");

    await abrirMicrofone(salaFalsa() as never, prefs({ supressao: true }));
    expect(publicadas.size).toBe(1);
    expect(cadeiasMontadas()).toBe(1);
    expect(vivas()).toBe(2); // a do microfone e a de saída da cadeia

    // entrar de novo sem sair: o dono fecha a anterior antes de abrir a nova
    await abrirMicrofone(salaFalsa() as never, prefs({ supressao: true }));
    expect(publicadas.size).toBe(1);
    expect(cadeiasMontadas()).toBe(1);
    expect(vivas()).toBe(2);

    // só o volume: nada é recriado
    const antes = faixaDoMicrofone();
    await atualizarMicrofone(prefs({ supressao: true, ganho: 1.8 }));
    expect(faixaDoMicrofone()).toBe(antes);
    expect(cadeiasMontadas()).toBe(1);

    await fecharMicrofone();
    expect(cadeiasMontadas()).toBe(0);
    expect(vivas()).toBe(0);
  });

  it("o teste de microfone tira a faixa da sala sem fechá-la", async () => {
    const {
      abrirMicrofone,
      definirMicrofoneAberto,
      definirMicrofoneEmTeste,
      faixaDeMonitoracao,
      fecharMicrofone,
    } = await import("@/lib/microfone");
    const { cadeiasMontadas, usuariosDoContexto } = await import("@/lib/supressor-ruido");

    await abrirMicrofone(salaFalsa() as never, prefs({ supressao: true }));
    const monitorada = faixaDeMonitoracao();
    expect(publicadas.size).toBe(1);

    // mudo: a captura continua, mas a faixa de entrada é desabilitada
    await definirMicrofoneAberto(false);

    await definirMicrofoneEmTeste(true);
    // fora da sala…
    expect(publicadas.size).toBe(0);
    // …mas viva, com a mesma cadeia e a mesma faixa a monitorar — e aberta,
    // porque o teste do Discord funciona com o microfone mudo
    expect(cadeiasMontadas()).toBe(1);
    expect(usuariosDoContexto()).toBeGreaterThan(0);
    expect(faixaDeMonitoracao()).toBe(monitorada);
    expect(vivas()).toBe(2);

    await definirMicrofoneEmTeste(false);
    expect(publicadas.size).toBe(1);

    await fecharMicrofone();
    expect(vivas()).toBe(0);
    expect(usuariosDoContexto()).toBe(0);
  });

  it("desligar a supressão tira a cadeia quando o volume está em 1", async () => {
    const { abrirMicrofone, atualizarMicrofone, fecharMicrofone } = await import(
      "@/lib/microfone"
    );
    const { cadeiasMontadas } = await import("@/lib/supressor-ruido");

    await abrirMicrofone(salaFalsa() as never, prefs({ supressao: true }));
    expect(cadeiasMontadas()).toBe(1);

    await atualizarMicrofone(prefs({ supressao: false, ganho: 1 }));
    expect(cadeiasMontadas()).toBe(0);

    // mas o volume sozinho já justifica a cadeia
    await atualizarMicrofone(prefs({ supressao: false, ganho: 0.5 }));
    expect(cadeiasMontadas()).toBe(1);

    await fecharMicrofone();
  });
});

/**
 * O aviso de fone Bluetooth é decidido pelo **rótulo** do dispositivo — o
 * navegador não conta transporte nem perfil. Errar para mais é o lado caro:
 * quem usa microfone de mesa levaria um aviso sobre um problema que não tem,
 * e o aviso inteiro perderia crédito. Daí os negativos abaixo pesarem tanto
 * quanto os positivos.
 */
describe("ehMicrofoneDeFoneBluetooth", () => {
  it("reconhece as formas com que os sistemas batizam o perfil mãos-livres", async () => {
    const { ehMicrofoneDeFoneBluetooth } = await import("@/lib/microfone");

    for (const rotulo of [
      // Windows em inglês
      "Headset (WH-1000XM4 Hands-Free AG Audio)",
      // Windows em pt-BR
      "Fone de Ouvido (WH-1000XM4 Áudio Mãos-Livres AG)",
      // macOS
      "WH-1000XM4 (Hands-Free)",
      // driver que anuncia o perfil pela sigla
      "Microfone HFP (Galaxy Buds)",
      // alguns drivers só dizem o transporte
      "Bluetooth Audio Input",
    ]) {
      expect(ehMicrofoneDeFoneBluetooth(rotulo), rotulo).toBe(true);
    }
  });

  it("não avisa quem não tem o problema", async () => {
    const { ehMicrofoneDeFoneBluetooth } = await import("@/lib/microfone");

    for (const rotulo of [
      // "Headset" sozinho é qualquer fone com fio: não troca perfil nenhum
      "Headset USB",
      "Microfone (Realtek Audio)",
      "Webcam C920",
      "Microfone de mesa (Yeti Stereo Microphone)",
      "Padrão - Alto-falantes (Realtek High Definition Audio)",
    ]) {
      expect(ehMicrofoneDeFoneBluetooth(rotulo), rotulo).toBe(false);
    }
  });

  it("lista anônima não vira aviso: sem rótulo não há o que afirmar", async () => {
    const { ehMicrofoneDeFoneBluetooth } = await import("@/lib/microfone");

    expect(ehMicrofoneDeFoneBluetooth("")).toBe(false);
    expect(ehMicrofoneDeFoneBluetooth(null)).toBe(false);
    expect(ehMicrofoneDeFoneBluetooth(undefined)).toBe(false);
  });
});
