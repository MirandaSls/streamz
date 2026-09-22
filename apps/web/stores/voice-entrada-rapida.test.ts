import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **Entrar na sala não espera pelo microfone.**
 *
 * Este é o teste do defeito "ao entrar na call de algum servidor está demorando
 * muito tempo para carregar e entrar" (desktop 0.0.24). O caminho era todo
 * serial: `connect` só dizia `connected` — e o palco só aparecia — depois de o
 * `getUserMedia`, a cadeia de captura e o `publishTrack` terminarem. Medido nos
 * logs do `streamz-livekit` em produção (168 h, 213 entradas), o intervalo
 * entre a sessão RTC começar e o microfone ser publicado tem **p50 de 457 ms,
 * p75 de 833 ms, p90 de 3,5 s e p95 de 12,3 s**: 23% das entradas passavam de
 * um segundo de tela de espera, 12% de três segundos. O ICE não tinha culpa
 * nenhuma — 284 de 285 conexões fecharam por UDP, com p50 de 188 ms.
 *
 * A `abrirMicrofone` de mentira aqui **não resolve sozinha**: o teste a segura
 * de propósito, porque é exatamente isso que o navegador faz enquanto o usuário
 * responde ao pedido de permissão ou o headset Bluetooth acorda. Se alguém
 * voltar a esperar por ela na entrada, a primeira asserção quebra.
 */

const { SalaFalsa } = vi.hoisted(() => {
  class SalaFalsa {
    static criadas: SalaFalsa[] = [];
    static zerar() {
      SalaFalsa.criadas = [];
    }
    state = "disconnected";
    localParticipant = {
      identity: "ana",
      isCameraEnabled: false,
      trackPublications: new Map(),
      publishTrack: vi.fn(async () => {}),
      unpublishTrack: vi.fn(async () => {}),
      setCameraEnabled: vi.fn(async () => {}),
      getTrackPublication: vi.fn(() => undefined),
      // o aviso de CPU da câmera (`LocalTrackCpuConstrained`)
      on: vi.fn(),
    };
    activeSpeakers: unknown[] = [];
    remoteParticipants = new Map();
    constructor() {
      SalaFalsa.criadas.push(this);
    }
    on() {
      return this;
    }
    off() {
      return this;
    }
    removeAllListeners() {
      return this;
    }
    async connect() {
      this.state = "connected";
    }
    async disconnect() {
      this.state = "disconnected";
    }
    async switchActiveDevice() {}
  }
  return { SalaFalsa };
});

vi.mock("livekit-client", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  Room: SalaFalsa,
  LocalVideoTrack: class {},
  LocalAudioTrack: class {},
}));

const { api, microfone, emitidos } = vi.hoisted(() => ({
  api: {
    startCall: vi.fn(),
    dmVoiceStates: vi.fn(async () => []),
    guildVoiceStates: vi.fn(async () => []),
    voiceToken: vi.fn(async () => ({ token: "t", url: "wss://livekit", room: "voice:c1" })),
    telaToken: vi.fn(async () => ({ token: "t", url: "wss://lk", room: "r" })),
  },
  microfone: {
    /** resolve só quando o teste mandar — é a espera do `getUserMedia`. */
    liberar: null as null | (() => void),
    abrirMicrofone: vi.fn(),
    definirMicrofoneAberto: vi.fn(async () => {}),
  },
  emitidos: [] as { evento: string; dados: unknown }[],
}));

vi.mock("@/lib/api", () => ({ api }));
vi.mock("@/stores/socket-adapter", () => ({
  emit: (evento: string, dados: unknown) => void emitidos.push({ evento, dados }),
  errorMessage: (_e: unknown, f: string) => f,
  on: () => () => {},
  onReconnect: () => () => {},
  joinChannel: () => {},
  leaveChannel: () => {},
}));
vi.mock("@/lib/desktop", () => ({
  isTauri: () => false,
  iniciarTelaNativa: vi.fn(async () => {}),
  pararTelaNativa: vi.fn(async () => {}),
  ouvirTelaEncerrada: () => () => {},
  suspenderAtenuacaoDoWindows: vi.fn(async () => {}),
  restaurarAtenuacaoDoWindows: vi.fn(async () => {}),
}));
// o Node não tem `RTCPeerConnection`: sem isto toda entrada pararia no aviso
// de "este ambiente não faz chamada", que não é o que este arquivo testa
vi.mock("@/lib/suporte-a-chamadas", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  suportaChamadas: () => true,
}));
vi.mock("@/lib/microfone", () => ({
  abrirMicrofone: microfone.abrirMicrofone,
  atualizarMicrofone: vi.fn(async () => {}),
  definirMicrofoneAberto: microfone.definirMicrofoneAberto,
  definirMicrofoneEmTeste: vi.fn(async () => {}),
  fecharMicrofone: vi.fn(async () => {}),
}));
vi.mock("@/lib/ringtone", () => ({
  tocarSom: vi.fn(),
  tocarSomDeMovido: vi.fn(),
}));
vi.mock("@/stores/voice-ping", () => ({
  iniciarMedicaoDePing: vi.fn(),
  pararMedicaoDePing: vi.fn(),
}));
vi.mock("@/stores/voz-detector-local", () => ({
  armarDetectorLocal: vi.fn(),
  desarmarDetectorLocal: vi.fn(),
}));
vi.mock("@/stores/dms", () => ({
  useDMs: { getState: () => ({ abrirPorId: vi.fn(async () => {}) }) },
}));
vi.mock("@/stores/ui", () => ({
  ui: { toast: vi.fn(), setView: vi.fn(), openModal: vi.fn() },
}));

import { CHAMADA_INICIAL } from "@/stores/call-machine";
import { useAuth } from "@/stores/auth";
import { ui } from "@/stores/ui";
import { explicarMidia } from "@/stores/voiceDevices";
import { useVoice } from "@/stores/voice";

const EU = { id: "ana", username: "ana", displayName: null, avatarUrl: null } as never;
const CANAL = { id: "c1", guildId: "g1", name: "Geral", type: "VOICE" as const };

/** Deixa as promessas pendentes andarem sem avançar relógio nenhum. */
const drenar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  SalaFalsa.zerar();
  emitidos.length = 0;
  vi.mocked(ui.toast).mockClear();
  microfone.abrirMicrofone.mockReset();
  microfone.definirMicrofoneAberto.mockReset();
  microfone.definirMicrofoneAberto.mockResolvedValue(undefined);
  // o microfone fica pendurado até o teste soltar
  microfone.abrirMicrofone.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        microfone.liberar = resolve;
      }),
  );
  useAuth.setState({ user: EU });
  useVoice.setState({
    states: {},
    channelId: null,
    guildId: null,
    channelName: "",
    desde: null,
    status: "idle",
    erro: null,
    midiaDisponivel: false,
    microfonePronto: false,
    camOn: false,
    screenOn: false,
    call: CHAMADA_INICIAL,
  });
});

describe("entrar na call não espera pelo microfone", () => {
  it("fica `connected` com o `abrirMicrofone` ainda pendurado", async () => {
    await useVoice.getState().connect(CANAL);

    const s = useVoice.getState();
    // a sala está de pé e o áudio dos outros já chega — é o palco que o clique
    // pediu, sem a tela de espera
    expect(s.status).toBe("connected");
    expect(s.midiaDisponivel).toBe(true);
    // ...e o microfone ainda não subiu: quem olhar a barra vê "Ativando
    // microfone…", não um microfone aberto que não existe
    expect(s.microfonePronto).toBe(false);
    expect(microfone.abrirMicrofone).toHaveBeenCalledTimes(1);
  });

  it("o `voice.join` sai antes do token, e não depois dele", async () => {
    // o estado de voz não depende do LiveKit: os outros veem a pessoa no canal
    // mesmo que o token demore
    await useVoice.getState().connect(CANAL);
    expect(emitidos[0]?.evento).toBe("voice.join");
  });

  it("quando a faixa sobe, a flag vira e o mudo escolhido é reaplicado", async () => {
    await useVoice.getState().connect(CANAL);
    expect(useVoice.getState().microfonePronto).toBe(false);

    microfone.liberar?.();
    await drenar();

    expect(useVoice.getState().microfonePronto).toBe(true);
    // a reaplicação é o que salva o `toggleMute` clicado ENQUANTO a faixa
    // subia: naquele instante não havia faixa e `definirMicrofoneAberto` era um
    // no-op, então o clique se perderia
    expect(microfone.definirMicrofoneAberto).toHaveBeenCalled();
  });

  it("sair antes de a faixa subir não marca pronto nem mexe na sala morta", async () => {
    await useVoice.getState().connect(CANAL);
    await useVoice.getState().disconnect();
    microfone.definirMicrofoneAberto.mockClear();

    microfone.liberar?.();
    await drenar();

    expect(useVoice.getState().microfonePronto).toBe(false);
    expect(microfone.definirMicrofoneAberto).not.toHaveBeenCalled();
  });

  it("microfone que falha não tira ninguém da sala", async () => {
    microfone.abrirMicrofone.mockRejectedValueOnce(new Error("NotAllowedError"));
    await useVoice.getState().connect(CANAL);
    await drenar();

    expect(useVoice.getState().status).toBe("connected");
    // a janela fecha mesmo assim: insistir em "Ativando microfone…" para sempre
    // seria pior do que mostrar o mudo que a pessoa de fato tem
    expect(useVoice.getState().microfonePronto).toBe(true);
  });
});

/**
 * **A falha do microfone era invisível.** O `catch` descartava o erro (nem
 * `binding` tinha) e o único rastro era um `console.debug` do cronômetro, que
 * não aparece no nível padrão do console — daí o relato "às vezes entro na call
 * e o áudio não funciona" nunca vir com passo de reprodução: a barra desenhava
 * um microfone normal e ninguém tinha o que contar.
 *
 * Contar não é segurar: as asserções de sala continuam aqui de propósito, para
 * que quem trocar o aviso por um `return` derrube o teste.
 */
describe("microfone que não sobe conta que não subiu", () => {
  it("avisa no console e no toast, e mesmo assim deixa a pessoa na sala", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    microfone.abrirMicrofone.mockRejectedValueOnce(new Error("NotReadableError"));

    await useVoice.getState().connect(CANAL);
    await drenar();

    // o rastro que faltava na máquina de quem relata
    expect(
      warn.mock.calls.some(([texto]) => String(texto).startsWith("[voz] o microfone não subiu")),
    ).toBe(true);
    // ...e o aviso na tela, no mesmo par (mensagem, "error") da câmera e da tela
    expect(ui.toast).toHaveBeenCalledWith(
      expect.stringContaining("configurações de voz"),
      "error",
    );
    // contar é tudo o que esta correção faz: a sala segue de pé e a barra para
    // de esperar por um microfone que não vem
    expect(useVoice.getState().status).toBe("connected");
    expect(useVoice.getState().microfonePronto).toBe(true);
  });

  it("permissão negada manda a pessoa ao cadeado, não um 'não foi possível'", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // com `mediaDevices` no lugar, `motivoDaFalha()` responde "negado" — é o
    // navegador que tem a permissão trancada, não o endereço que é http
    vi.stubGlobal("navigator", { mediaDevices: {} });
    microfone.abrirMicrofone.mockRejectedValueOnce(
      Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }),
    );

    await useVoice.getState().connect(CANAL);
    await drenar();

    // o texto é o mesmo das configurações de voz, e diz o que fazer: o cadeado
    const aviso = explicarMidia("negado") ?? "";
    expect(aviso).toContain("cadeado");
    expect(ui.toast).toHaveBeenCalledWith(aviso, "error");
    expect(useVoice.getState().status).toBe("connected");
    expect(useVoice.getState().microfonePronto).toBe(true);
  });
});
