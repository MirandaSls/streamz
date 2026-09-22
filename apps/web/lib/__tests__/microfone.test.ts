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

/** Só o que `applyConstraints` troca: as restrições sem o aparelho. */
interface ProcessamentoFalso {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  voiceIsolation: boolean;
}

/** As restrições como o SDK as recebe: o `deviceId` pode chegar embrulhado. */
type RestricoesFalsas = Record<string, unknown>;

/**
 * Como o `constraintsForOptions` do livekit-client 2.22.0: ele **muta** o
 * objeto de opções que recebe (`constraints.audio = options.audio` e depois
 * `constraints.audio.deviceId ??= { ideal: "default" }`). O dublê repete o
 * vício de propósito — é dele que saía a reabertura a cada troca de
 * preferência, e um dublê educado não pegaria isso.
 */
function comoOSdkMuta(restricoes: RestricoesFalsas): RestricoesFalsas {
  restricoes.deviceId ??= { ideal: "default" };
  return restricoes;
}

class FaixaFalsa {
  processor: ProcessadorFalso | null = null;
  mudo = false;
  parada = false;
  /** ouvintes de `restarted`: o `LocalTrack` do LiveKit é um EventEmitter. */
  private ouvintes = new Set<() => void>();
  /** o objeto de restrições que cada `restartTrack` recebeu, na ordem. */
  readonly recebidas: RestricoesFalsas[] = [];
  /** o que foi reconfigurado ao vivo, na ordem: é o que o `applyConstraints` recebeu. */
  readonly aplicadas: ProcessamentoFalso[] = [];
  /** quantas vezes o dispositivo foi fechado e reaberto. */
  reinicios = 0;
  /**
   * O navegador recusa trocar ao vivo (é o `OverconstrainedError` de um driver
   * que só aceita o processamento no `getUserMedia`).
   */
  recusarAplicacao = false;
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
  /** como o `LocalAudioTrack`: aplica na faixa de ENTRADA, sem `getUserMedia`. */
  async applyConstraints(p: ProcessamentoFalso) {
    if (this.recusarAplicacao) {
      const e = new Error("Cannot satisfy constraints");
      e.name = "OverconstrainedError";
      throw e;
    }
    this.aplicadas.push(p);
  }
  async restartTrack(restricoes?: RestricoesFalsas) {
    if (restricoes) this.recebidas.push(comoOSdkMuta(restricoes));
    this.reinicios += 1;
    const nova = new FaixaFalsaDeMidia();
    this.midia.stop();
    this.midia = nova;
    // é o que o `LocalTrack.restart` faz: reinicia o processador na faixa nova
    await this.processor?.restart({ track: nova, audioContext: this.ctx, kind: "audio" });
    // ...e no fim emite `restarted`, tenha a reabertura vindo de nós ou dele
    this.ouvintes.forEach((ouvinte) => ouvinte());
  }
  on(_evento: "restarted", ouvinte: () => void) {
    this.ouvintes.add(ouvinte);
    return this;
  }
  off(_evento: "restarted", ouvinte: () => void) {
    this.ouvintes.delete(ouvinte);
    return this;
  }
  /**
   * O que o `LocalParticipant` faz sozinho quando a faixa do aparelho termina
   * (fone Bluetooth trocando de perfil, microfone desconectado, padrão do
   * sistema mudando): reabre a captura com `{ deviceId: "default" }` e **só**
   * isso — sem eco, sem ruído, sem AGC, sem `voiceIsolation`.
   */
  async reaquisicaoDoSdk() {
    await this.restartTrack({ deviceId: "default" });
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
    criarFaixa: async (restricoes: RestricoesFalsas) => {
      // `createLocalTracks` passa pelo mesmo `constraintsForOptions`
      comoOSdkMuta(restricoes);
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

function prefs(
  patch: Partial<{
    supressao: boolean;
    ganho: number;
    deviceId: string;
    echoCancellation: boolean;
    noiseSuppression: boolean;
  }> = {},
) {
  return {
    restricoes: {
      ...(patch.deviceId ? { deviceId: patch.deviceId } : {}),
      echoCancellation: patch.echoCancellation ?? true,
      noiseSuppression: patch.noiseSuppression ?? false,
      autoGainControl: true,
      voiceIsolation: false,
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
 * Quando mudar de preferência reabre o dispositivo — e quando não reabre.
 *
 * O que esta suíte guarda: até aqui, **qualquer** mudança de eco, ruído nativo
 * ou ganho automático caía num `restartTrack`, que é `stop()` + `getUserMedia`
 * novo. Cada reabertura é uma renegociação com o áudio do sistema (num fone
 * Bluetooth, de perfil e codec inteiros), e nada disso é preciso para trocar
 * restrições da mesma captura: `applyConstraints` as troca com o dispositivo
 * aberto. Element Call e LiveKit Meet, que usam este mesmo SDK no navegador,
 * só usam `restartTrack` para trocar de **aparelho** — que é o único caso que
 * continua reabrindo aqui.
 *
 * A recusa importa tanto quanto o caminho feliz: `applyConstraints` rejeita
 * (`OverconstrainedError`) onde o driver não aceita a troca ao vivo, e aí a
 * preferência **tem** de valer de qualquer jeito, pelo caminho caro.
 */
describe("trocar preferência de áudio sem reabrir o microfone", () => {
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

  async function abrir(patch: Parameters<typeof prefs>[0] = {}) {
    const mod = await import("@/lib/microfone");
    await mod.abrirMicrofone(salaFalsa() as never, prefs(patch));
    return { ...mod, faixa: mod.faixaDoMicrofone() as unknown as FaixaFalsa };
  }

  it("mesmo aparelho e só o processamento mudou: reconfigura a captura aberta", async () => {
    const { atualizarMicrofone, fecharMicrofone, faixa } = await abrir();
    const midia = faixa.midia;

    await atualizarMicrofone(prefs({ echoCancellation: false, noiseSuppression: true }));

    expect(faixa.reinicios).toBe(0);
    // a faixa do dispositivo é a mesma: nada foi fechado e reaberto
    expect(faixa.midia).toBe(midia);
    expect(faixa.midia.readyState).toBe("live");
    expect(faixa.aplicadas).toEqual([
      {
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true,
        voiceIsolation: false,
      },
    ]);

    // e preferência que não mudou nada não fala com o navegador
    await atualizarMicrofone(prefs({ echoCancellation: false, noiseSuppression: true }));
    expect(faixa.aplicadas).toHaveLength(1);
    expect(faixa.reinicios).toBe(0);

    await fecharMicrofone();
  });

  it("o aparelho mudou: aí sim reabre a captura", async () => {
    const { atualizarMicrofone, fecharMicrofone, faixa } = await abrir();

    await atualizarMicrofone(prefs({ deviceId: "mic-2" }));

    expect(faixa.reinicios).toBe(1);
    // trocar de aparelho é outro `getUserMedia`: não há `applyConstraints` que
    // resolva, e por isso nenhum é tentado
    expect(faixa.aplicadas).toEqual([]);

    await fecharMicrofone();
  });

  it("o navegador recusou a troca ao vivo: recua para a reabertura e avisa", async () => {
    const { atualizarMicrofone, fecharMicrofone, faixa } = await abrir();
    faixa.recusarAplicacao = true;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await atualizarMicrofone(prefs({ noiseSuppression: true }));

    // a preferência não pode ficar sem efeito em silêncio
    expect(faixa.reinicios).toBe(1);
    expect(aviso).toHaveBeenCalled();

    aviso.mockRestore();
    await fecharMicrofone();
  });

  it("trocar de nível de ruído também monta e desmonta a cadeia do RNNoise", async () => {
    const { atualizarMicrofone, fecharMicrofone, faixa } = await abrir({
      noiseSuppression: true,
    });
    const { cadeiasMontadas } = await import("@/lib/supressor-ruido");
    expect(cadeiasMontadas()).toBe(0);

    // "Padrão" → "Avançada": a nativa sai pelas restrições, o RNNoise entra
    // pelo nosso grafo. `applyConstraints` resolve só a primeira metade
    await atualizarMicrofone(prefs({ supressao: true, noiseSuppression: false }));
    expect(faixa.reinicios).toBe(0);
    expect(faixa.aplicadas.at(-1)?.noiseSuppression).toBe(false);
    expect(cadeiasMontadas()).toBe(1);

    // e voltar desmonta a cadeia, ainda sem reabrir o dispositivo
    await atualizarMicrofone(prefs({ supressao: false, noiseSuppression: true }));
    expect(faixa.reinicios).toBe(0);
    expect(faixa.aplicadas.at(-1)?.noiseSuppression).toBe(true);
    expect(cadeiasMontadas()).toBe(0);

    await fecharMicrofone();
  });
});

/**
 * Quando o **SDK** reabre a captura por baixo de nós.
 *
 * O `LocalParticipant` do livekit-client 2.22.0 reage à faixa do microfone
 * terminar com `track.restartTrack({ deviceId: "default" })` — o
 * `getUserMedia` refeito vai sem `echoCancellation`, `noiseSuppression`,
 * `autoGainControl` nem `voiceIsolation`, e o `restart()` ainda grava esse
 * objeto pobre em `_constraints`. Ou seja: a captura volta ao padrão do
 * navegador, as nossas preferências deixam de valer e **nada no app
 * percebia**. No WebKit do macOS isso é audível — `echoCancellation` ligado é
 * o que liga a VoiceProcessingIO, que abaixa o som dos outros aplicativos.
 *
 * O mesmo caminho passa pelo `constraintsForOptions`, que muta o objeto de
 * restrições recebido: enquanto era o **nosso** objeto que ia para lá, o
 * `deviceId` virava `{ ideal: "default" }` dentro das preferências guardadas e
 * toda troca de nível seguinte reabria o microfone de novo.
 */
describe("o SDK reabre a captura por conta própria", () => {
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

  /** a reaplicação entra na fila do dono da faixa; isto espera a fila escoar. */
  const escoar = () => new Promise((pronto) => setTimeout(pronto, 0));

  async function abrir(preferencias = prefs()) {
    const mod = await import("@/lib/microfone");
    await mod.abrirMicrofone(salaFalsa() as never, preferencias);
    return { ...mod, faixa: mod.faixaDoMicrofone() as unknown as FaixaFalsa };
  }

  it("reaplica o processamento escolhido e deixa rastro no log", async () => {
    const { fecharMicrofone, faixa } = await abrir(
      prefs({ echoCancellation: false, noiseSuppression: true }),
    );
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await faixa.reaquisicaoDoSdk();
    await escoar();

    expect(faixa.aplicadas.at(-1)).toEqual({
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
      voiceIsolation: false,
    });
    // a reaquisição é invisível para quem usa: o log é o único sinal dela
    expect(aviso).toHaveBeenCalled();

    aviso.mockRestore();
    await fecharMicrofone();
  });

  it("reabertura nossa não é reaquisição: não reaplica nem avisa", async () => {
    const { atualizarMicrofone, fecharMicrofone, faixa } = await abrir();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await atualizarMicrofone(prefs({ deviceId: "mic-2" }));
    await escoar();

    expect(faixa.reinicios).toBe(1);
    expect(faixa.aplicadas).toEqual([]);
    expect(aviso).not.toHaveBeenCalled();

    aviso.mockRestore();
    await fecharMicrofone();
  });

  it("a faixa fechada não é mais corrigida: o ouvinte sai com ela", async () => {
    const { fecharMicrofone, faixa } = await abrir();
    await fecharMicrofone();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await faixa.reaquisicaoDoSdk();
    await escoar();

    expect(faixa.aplicadas).toEqual([]);
    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("o SDK só muta a cópia: as preferências guardadas ficam intactas", async () => {
    const preferencias = prefs();
    const { atualizarMicrofone, fecharMicrofone, faixa } = await abrir(preferencias);

    // `criarFaixa` já passou pelo `constraintsForOptions` do dublê
    expect(preferencias.restricoes.deviceId).toBeUndefined();

    await atualizarMicrofone(prefs({ deviceId: "mic-2" }));
    expect(faixa.recebidas.at(-1)).not.toBe(preferencias.restricoes);
    expect(faixa.recebidas.at(-1)?.deviceId).toBe("mic-2");

    await fecharMicrofone();
  });

  it("`deviceId` embrulhado pelo SDK é o mesmo aparelho: não reabre nada", async () => {
    // é a forma em que o `constraintsForOptions` deixa o `deviceId`; o que
    // vale para decidir a reabertura é o aparelho, não o embrulho
    const embrulhado = prefs();
    embrulhado.restricoes = {
      ...embrulhado.restricoes,
      deviceId: { ideal: "mic-1" } as unknown as string,
    };
    const { atualizarMicrofone, fecharMicrofone, faixa } = await abrir(embrulhado);

    await atualizarMicrofone(prefs({ deviceId: "mic-1", echoCancellation: false }));

    expect(faixa.reinicios).toBe(0);
    expect(faixa.aplicadas.at(-1)?.echoCancellation).toBe(false);

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

/* ---------------------------------------------------------------- */
/* Qual sistema mexe no som dos outros aplicativos                   */
/* ---------------------------------------------------------------- */

/**
 * O que esta suíte guarda é a distinção que a tela de voz errou duas vezes: no
 * Windows nenhuma opção nossa tira o sistema do modo de comunicação; no macOS,
 * o cancelamento de eco liga a `VoiceProcessingIO` — **mas só no WebKit**
 * (Safari e o WKWebView do app), porque no Chrome do macOS o AEC de sistema
 * está atrás de uma `feature` desligada de fábrica. Separar Chromium de WebKit
 * pelo `userAgent` é a única parte disto que pode errar, então é a que o teste
 * prende, com `userAgent` reais.
 */
describe("sistemaDeAudio", () => {
  const UA = {
    chromeWindows:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    edgeWindows:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
    chromeMac:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    safariMac:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    // o WKWebView do Tauri não traz `Version/` nem `Chrome/`
    tauriMac:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    chromeLinux:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  };

  it("Windows é Windows em qualquer navegador: a atenuação é do sistema", async () => {
    const { sistemaDeAudio } = await import("@/lib/microfone");

    expect(sistemaDeAudio(UA.chromeWindows)).toBe("windows");
    expect(sistemaDeAudio(UA.edgeWindows)).toBe("windows");
  });

  it("no macOS, WebKit e Chromium são casos opostos", async () => {
    const { sistemaDeAudio } = await import("@/lib/microfone");

    // aqui desligar o eco resolve (o WebKit troca a VoiceProcessingIO pela HAL)
    expect(sistemaDeAudio(UA.safariMac)).toBe("macos-webkit");
    expect(sistemaDeAudio(UA.tauriMac)).toBe("macos-webkit");
    // e aqui não há o que resolver: o AEC é software e não toca na saída
    expect(sistemaDeAudio(UA.chromeMac)).toBe("macos-chromium");
  });

  it("o resto não tem mecanismo nenhum", async () => {
    const { sistemaDeAudio } = await import("@/lib/microfone");

    expect(sistemaDeAudio(UA.chromeLinux)).toBe("outro");
    expect(sistemaDeAudio("")).toBe("outro");
    expect(sistemaDeAudio(null)).toBe("outro");
    expect(sistemaDeAudio(undefined)).toBe("outro");
  });
});
