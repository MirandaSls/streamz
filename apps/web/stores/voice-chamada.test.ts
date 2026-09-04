import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceStateEvent } from "@streamz/shared";

/**
 * A chamada na conversa, do clique no telefone até a tela compartilhada — com
 * a `Room` do LiveKit e o gateway de mentira.
 *
 * É o teste que faltava. Tudo em `stores/voice.ts` era verificado só pelas
 * peças puras à volta (`call-machine`, `voice-saida`, `voice-retomada`), e os
 * três defeitos deste PR moravam justamente na costura entre elas:
 *
 * 1. o **ringback** parava no instante em que começava, porque `applyState`
 *    tratava o meu próprio estado de voz como "alguém entrou na chamada";
 * 2. o **segundo clique** no telefone abria uma segunda `Room` com a mesma
 *    identidade — o LiveKit derruba a anterior, e o handler de `Disconnected`
 *    dela anunciava queda e zerava a sala nova;
 * 3. a **tela compartilhada** morria junto, porque quem transmite depende da
 *    mesma `sala` que o item 2 apagava.
 *
 * A `Room` falsa registra cada instância criada e cada `disconnect`: é assim
 * que "duas salas ao mesmo tempo" vira uma asserção, e não uma suspeita.
 */

// ── a `Room` de mentira ────────────────────────────────────────────────────

const { SalaFalsa } = vi.hoisted(() => {
  class SalaFalsa {
    static criadas: SalaFalsa[] = [];
    static zerar() {
      SalaFalsa.criadas = [];
    }

    desconectada = false;
    ouvintes = new Map<string, Set<(...args: unknown[]) => void>>();
    sempre = new Map<string, Set<(...args: unknown[]) => void>>();
    activeSpeakers: unknown[] = [];
    remoteParticipants = new Map();
    state = "disconnected";
    publicadas: string[] = [];
    localParticipant = {
      identity: "ana",
      isCameraEnabled: false,
      trackPublications: new Map(),
      publishTrack: vi.fn(async (_t: unknown, o: { source: string }) => {
        this.publicadas.push(o.source);
      }),
      unpublishTrack: vi.fn(async () => {}),
      setCameraEnabled: vi.fn(async () => {}),
    };

    constructor() {
      SalaFalsa.criadas.push(this);
    }

    on(evento: string, fn: (...args: unknown[]) => void) {
      (this.ouvintes.get(evento) ?? this.ouvintes.set(evento, new Set()).get(evento)!).add(fn);
      // guardado à parte de propósito: `removeAllListeners` não apaga daqui, e
      // é o que permite ao teste disparar o evento da sala **aposentada** —
      // exatamente o que o LiveKit fazia com a conexão de identidade repetida
      (this.sempre.get(evento) ?? this.sempre.set(evento, new Set()).get(evento)!).add(fn);
      return this;
    }
    off() {
      return this;
    }
    removeAllListeners() {
      this.ouvintes.clear();
      return this;
    }
    async connect() {
      this.state = "connected";
    }
    async disconnect() {
      this.desconectada = true;
      this.state = "disconnected";
    }
    async switchActiveDevice() {}

    /** Dispara um evento do SDK, como o servidor de mídia faria. */
    emitir(evento: string) {
      for (const fn of Array.from(this.ouvintes.get(evento) ?? [])) fn();
    }

    /** Dispara mesmo se a sala já foi desmontada — o tombo da identidade repetida. */
    emitirDeQualquerJeito(evento: string) {
      for (const fn of Array.from(this.sempre.get(evento) ?? [])) fn();
    }
  }
  return { SalaFalsa };
});

vi.mock("livekit-client", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  Room: SalaFalsa,
  // as faixas locais do SDK mexem no `MediaStreamTrack` de verdade; aqui o
  // que importa é o que foi publicado, não como
  LocalVideoTrack: class {
    constructor(public faixa: unknown) {}
  },
  LocalAudioTrack: class {
    constructor(public faixa: unknown) {}
  },
}));

// ── o gateway e o resto do mundo ───────────────────────────────────────────

// `vi.mock` é içado para o topo do arquivo: tudo o que a fábrica lê precisa
// nascer em `vi.hoisted`, e não numa `const` do módulo
const { api, emitidos, sons, abrirPorId } = vi.hoisted(() => ({
  api: {
    startCall: vi.fn(),
    dmVoiceStates: vi.fn(async () => []),
    guildVoiceStates: vi.fn(async () => []),
    voiceToken: vi.fn(),
    telaToken: vi.fn(async () => ({ token: "t", url: "wss://lk", room: "r" })),
  },
  emitidos: [] as { evento: string; dados: unknown }[],
  sons: [] as string[],
  abrirPorId: vi.fn(async () => {}),
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
}));
vi.mock("@/lib/microfone", () => ({
  abrirMicrofone: vi.fn(async () => {}),
  atualizarMicrofone: vi.fn(async () => {}),
  definirMicrofoneAberto: vi.fn(async () => {}),
  definirMicrofoneEmTeste: vi.fn(async () => {}),
  fecharMicrofone: vi.fn(async () => {}),
}));
vi.mock("@/lib/ringtone", () => ({
  tocarSom: (nome: string) => void sons.push(nome),
  tocarSomDeMovido: () => void sons.push("movido"),
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
  useDMs: { getState: () => ({ abrirPorId }) },
}));
// os avisos usam `window.setTimeout`, que o ambiente de teste não stubba; aqui
// só interessa **se** houve aviso
vi.mock("@/stores/ui", () => ({
  ui: { toast: vi.fn(), setView: vi.fn(), openModal: vi.fn() },
}));

import { CHAMADA_INICIAL } from "@/stores/call-machine";
import { useAuth } from "@/stores/auth";
import { useVoice } from "@/stores/voice";

const EU = { id: "ana", username: "ana", displayName: null, avatarUrl: null } as never;
const OUTRO = { id: "bia", username: "bia", displayName: null, avatarUrl: null } as never;

function estadoDeVoz(userId: string, channelId: string): VoiceStateEvent {
  return {
    channelId,
    guildId: null,
    user: userId === "ana" ? EU : OUTRO,
    connected: true,
    muted: false,
    deafened: false,
    video: false,
    screen: false,
    reconnecting: false,
  } as VoiceStateEvent;
}

/** O que `POST /dms/:id/call` devolve quando a chamada nasce: só eu na sala. */
function respostaDaChamada(channelId: string) {
  return {
    channelId,
    voice: { token: "t", url: "wss://livekit", room: "sala" },
    states: [estadoDeVoz("ana", channelId)],
    ringing: [OUTRO],
  };
}

beforeEach(() => {
  abrirPorId.mockClear();
  SalaFalsa.zerar();
  emitidos.length = 0;
  sons.length = 0;
  api.startCall.mockReset();
  api.startCall.mockImplementation(async (id: string) => respostaDaChamada(id));
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
    camOn: false,
    screenOn: false,
    call: CHAMADA_INICIAL,
  });
});

describe("ringback de quem liga", () => {
  it("a chamada continua `outgoing` depois de eu entrar na sala", async () => {
    // era aqui que o som morria: o `POST` devolve o meu próprio estado de voz,
    // `applyState` o lia como "alguém entrou" e a fase pulava para `active` —
    // a `VoiceLayer` só toca o `<audio loop>` enquanto a fase é `outgoing`
    await useVoice.getState().startCall("dm1", false);
    expect(useVoice.getState().call.phase).toBe("outgoing");
    expect(useVoice.getState().status).toBe("connected");
  });

  it("a chamada vira `active` quando o OUTRO entra", async () => {
    await useVoice.getState().startCall("dm1", false);
    useVoice.getState().applyState(estadoDeVoz("bia", "dm1"));
    expect(useVoice.getState().call.phase).toBe("active");
  });

  it("um toque que ainda não atendi não é calado pelo meu próprio estado", () => {
    useVoice.getState().handleRing({ channelId: "dm1", from: OUTRO });
    useVoice.getState().applyState(estadoDeVoz("bia", "dm1"));
    expect(useVoice.getState().call.phase).toBe("incoming");
  });
});

describe("clique repetido no telefone", () => {
  it("dois cliques ligam uma vez só", async () => {
    const primeiro = useVoice.getState().startCall("dm1", false);
    const segundo = useVoice.getState().startCall("dm1", false);
    await Promise.all([primeiro, segundo]);
    expect(api.startCall).toHaveBeenCalledTimes(1);
    expect(SalaFalsa.criadas).toHaveLength(1);
    expect(SalaFalsa.criadas[0].desconectada).toBe(false);
  });

  it("clicar de novo com a chamada já de pé não refaz nada", async () => {
    await useVoice.getState().startCall("dm1", false);
    useVoice.getState().applyState(estadoDeVoz("bia", "dm1"));
    await useVoice.getState().startCall("dm1", false);
    expect(api.startCall).toHaveBeenCalledTimes(1);
    expect(SalaFalsa.criadas).toHaveLength(1);
    expect(useVoice.getState().status).toBe("connected");
  });

  it("`connect` no mesmo canal já conectado é no-op (nem som de entrar)", async () => {
    api.voiceToken.mockResolvedValue({ token: "t", url: "wss://livekit", room: "sala" });
    const canal = { id: "v1", guildId: "g1", name: "Geral", type: "VOICE" } as never;
    await useVoice.getState().connect(canal);
    expect(sons.filter((s) => s === "entrar")).toHaveLength(1);
    await useVoice.getState().connect(canal);
    expect(SalaFalsa.criadas).toHaveLength(1);
    expect(sons.filter((s) => s === "entrar")).toHaveLength(1);
  });

  it("atender duas vezes entra na sala uma vez só", async () => {
    useVoice.getState().handleRing({ channelId: "dm1", from: OUTRO });
    const a = useVoice.getState().acceptCall();
    const b = useVoice.getState().acceptCall();
    await Promise.all([a, b]);
    expect(api.startCall).toHaveBeenCalledTimes(1);
    expect(SalaFalsa.criadas).toHaveLength(1);
    expect(emitidos.filter((e) => e.evento === "call.accept")).toHaveLength(1);
  });

  it("uma falha libera o botão para tentar de novo", async () => {
    api.startCall.mockRejectedValueOnce(new Error("sem rede"));
    await useVoice.getState().startCall("dm1", false);
    expect(useVoice.getState().status).toBe("error");
    api.startCall.mockImplementation(async (id: string) => respostaDaChamada(id));
    await useVoice.getState().startCall("dm1", false);
    expect(api.startCall).toHaveBeenCalledTimes(2);
    expect(useVoice.getState().status).toBe("connected");
  });
});

describe("a queda de alguns segundos", () => {
  it("uma sala aposentada não derruba a que está no ar", async () => {
    await useVoice.getState().startCall("dm1", false);
    const primeira = SalaFalsa.criadas[0];
    // troca de conversa: a sala nova entra, a antiga é desmontada
    await useVoice.getState().startCall("dm2", false);
    expect(SalaFalsa.criadas).toHaveLength(2);
    expect(primeira.desconectada).toBe(true);
    // o servidor de mídia avisa a sala velha (identidade repetida). Antes,
    // este evento zerava `sala` e marcava "a conexão de voz caiu" — mesmo com
    // os ouvintes já removidos, porque o SDK guarda a própria referência
    primeira.emitirDeQualquerJeito("disconnected");
    expect(useVoice.getState().status).toBe("connected");
    expect(useVoice.getState().erro).toBeNull();
  });

  it("a sala que está no ar caindo de verdade continua virando erro", async () => {
    await useVoice.getState().startCall("dm1", false);
    SalaFalsa.criadas[0].emitir("disconnected");
    expect(useVoice.getState().status).toBe("error");
    expect(useVoice.getState().erro).toBe("A conexão de voz caiu.");
  });
});

describe("tela compartilhada", () => {
  function capturaFalsa() {
    const faixa = {
      contentHint: "",
      addEventListener: () => {},
      stop: () => {},
      kind: "video",
    };
    return {
      getVideoTracks: () => [faixa],
      getAudioTracks: () => [],
      getTracks: () => [faixa],
    } as unknown as MediaStream;
  }

  it("sobrevive a um clique repetido no telefone", async () => {
    await useVoice.getState().startCall("dm1", false);
    await useVoice.getState().publicarTela(capturaFalsa());
    expect(useVoice.getState().screenOn).toBe(true);
    const sala = SalaFalsa.criadas[0];

    await useVoice.getState().startCall("dm1", false);

    expect(SalaFalsa.criadas).toHaveLength(1);
    expect(sala.desconectada).toBe(false);
    expect(useVoice.getState().screenOn).toBe(true);
  });
});

describe("eventos da própria conta (todas as sessões, #117)", () => {
  it("atender em outro aparelho cala o toque desta janela", () => {
    useVoice.getState().handleRing({ channelId: "dm1", from: OUTRO });
    expect(useVoice.getState().call.phase).toBe("incoming");
    // o `voice.state` de mim mesmo entrando chega a todas as sessões da conta
    useVoice.getState().applyState(estadoDeVoz("ana", "dm1"));
    expect(useVoice.getState().call.phase).toBe("idle");
    // e sem avisar o gateway: não foi recusa
    expect(emitidos.filter((e) => e.evento === "call.decline")).toHaveLength(0);
  });

  it("a sessão que está ligando não é afetada pelo próprio `voice.state`", async () => {
    await useVoice.getState().startCall("dm1", false);
    useVoice.getState().applyState(estadoDeVoz("ana", "dm1"));
    expect(useVoice.getState().call.phase).toBe("outgoing");
    expect(useVoice.getState().channelId).toBe("dm1");
  });
});
