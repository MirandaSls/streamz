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
      getTrackPublication: vi.fn((_fonte: string): unknown => undefined),
      // o aviso de CPU da câmera (`LocalTrackCpuConstrained`)
      on: vi.fn(),
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
const { api, emitidos, sons, abrirPorId, ambiente, avisos } = vi.hoisted(() => {
  const avisos = {
    toast: vi.fn(),
    confirm: vi.fn(async (_o: unknown) => false),
    abrirNoSistema: vi.fn(async (_url: string) => true),
    closeModal: vi.fn(),
    /** topo da pilha de modais que `stores/ui` real teria — só o que a vigia
     *  do toque em `avisarSemChamadas` olha antes de fechar. */
    modais: [{ kind: "confirm" }] as { kind: string }[],
    /** o `resolve` do `confirm` "pendurado" (ver `confirmPendurado` abaixo) —
     *  é o que deixa `closeModal` fechar o aviso de verdade, como no app real
     *  (lá `closeModal` resolve o `confirm` do topo da pilha como cancelado). */
    resolvePendente: null as ((ok: boolean) => void) | null,
  };
  // desligado do `confirm` acima só por serem dois mocks independentes: sem
  // isto, `closeModal()` fechava a caixa na pilha de mentira sem nunca
  // destravar o `await ui.confirm(...)` que `avisarSemChamadas` ainda segura
  // — e a trava de "um aviso por vez" ficava presa para o resto do arquivo
  avisos.closeModal = vi.fn(() => {
    const resolver = avisos.resolvePendente;
    avisos.resolvePendente = null;
    resolver?.(false);
  });
  return {
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
    /** O que o ambiente de mentira responde: WebRTC e "estou no app". */
    ambiente: { webrtc: true, tauri: false },
    avisos,
  };
});

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
  isTauri: () => ambiente.tauri,
  abrirNoSistema: avisos.abrirNoSistema,
  iniciarTelaNativa: vi.fn(async () => {}),
  pararTelaNativa: vi.fn(async () => {}),
  ouvirTelaEncerrada: () => () => {},
}));
// o Node não tem `RTCPeerConnection`: quem decide aqui é o teste
vi.mock("@/lib/suporte-a-chamadas", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  suportaChamadas: () => ambiente.webrtc,
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
  ui: { toast: avisos.toast, confirm: avisos.confirm, setView: vi.fn(), openModal: vi.fn() },
  useUI: { getState: () => ({ modals: avisos.modais, closeModal: avisos.closeModal }) },
}));

import { CHAMADA_INICIAL } from "@/stores/call-machine";
import { useAuth } from "@/stores/auth";
import { esquecerAvisoSemChamadas, useVoice } from "@/stores/voice";

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

/**
 * Um `ui.confirm` que só resolve quando algo chama `closeModal()` — é o que os
 * testes do §(a) usam para segurar o aviso "aberto" enquanto o toque acaba por
 * baixo dele.
 */
function confirmPendurado(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    avisos.resolvePendente = resolve;
  });
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
  ambiente.webrtc = true;
  ambiente.tauri = false;
  avisos.toast.mockClear();
  avisos.confirm.mockReset();
  avisos.confirm.mockResolvedValue(false);
  avisos.abrirNoSistema.mockClear();
  avisos.closeModal.mockClear();
  avisos.modais = [{ kind: "confirm" }];
  avisos.resolvePendente = null;
  esquecerAvisoSemChamadas();
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

  it("publica com o teto do preset escolhido em `screenShareEncoding`", async () => {
    // com `videoEncoding` o SDK ignorava o preset para a fonte ScreenShare e a
    // tela saía no padrão dele (1080p15, 2,5 Mbps)
    useVoice.getState().setScreenQuality("1440p60");
    await useVoice.getState().startCall("dm1", false);
    await useVoice.getState().publicarTela(capturaFalsa());
    const [, opcoes] = SalaFalsa.criadas[0].localParticipant.publishTrack.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(opcoes.screenShareEncoding).toEqual({ maxBitrate: 9_000_000, maxFramerate: 60 });
    expect(opcoes.videoEncoding).toBeUndefined();
  });
});

describe("câmera: fps e alívio com a tela no ar", () => {
  /** Uma câmera publicada e ligada, com um sender de duas camadas. */
  function cameraNoAr() {
    let encodings: RTCRtpEncodingParameters[] = [
      { rid: "q", active: true, maxBitrate: 450_000, maxFramerate: 20, scaleResolutionDownBy: 3 },
      { rid: "h", active: true, maxBitrate: 3_000_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
    ];
    const sender = {
      getParameters: () => ({ encodings: encodings.map((e) => ({ ...e })) }),
      setParameters: vi.fn(async (p: { encodings: RTCRtpEncodingParameters[] }) => {
        encodings = p.encodings;
      }),
    };
    const faixa = {
      isMuted: false,
      sender,
      publishOptions: {} as Record<string, unknown>,
      mediaStreamTrack: { getSettings: () => ({ width: 1920, height: 1080, deviceId: "cam1" }) },
      restartTrack: vi.fn(async (_o: unknown) => {}),
    };
    const lp = SalaFalsa.criadas[0].localParticipant;
    lp.getTrackPublication.mockImplementation(() => ({ videoTrack: faixa }));
    return { faixa, sender, encodings: () => encodings };
  }

  beforeEach(() => {
    useVoice.setState({ cameraFps: 30 });
  });

  it("guarda o fps e o preset de tela, e recusa fps fora das opções", () => {
    useVoice.getState().setCameraFps(60);
    expect(useVoice.getState().cameraFps).toBe(60);
    expect(localStorage.getItem("voiceCameraFps")).toBe("60");
    useVoice.getState().setCameraFps(25 as never);
    expect(useVoice.getState().cameraFps).toBe(60);
    useVoice.getState().setScreenQuality("720p60");
    expect(localStorage.getItem("voiceScreenQuality")).toBe("720p60");
  });

  it("liga a câmera no fps escolhido, com duas camadas", async () => {
    await useVoice.getState().startCall("dm1", false);
    useVoice.getState().setCameraFps(60);
    await useVoice.getState().toggleCam();
    const lp = SalaFalsa.criadas[0].localParticipant;
    const [ligar, captura, publicacao] = lp.setCameraEnabled.mock.calls[0] as unknown as [
      boolean,
      { resolution: unknown },
      { videoEncoding: unknown; videoSimulcastLayers: { width: number; height: number }[] },
    ];
    expect(ligar).toBe(true);
    expect(captura.resolution).toEqual({ width: 1280, height: 720, frameRate: 60 });
    expect(publicacao.videoEncoding).toEqual({ maxBitrate: 2_500_000, maxFramerate: 60 });
    expect(publicacao.videoSimulcastLayers).toHaveLength(1);
    expect(publicacao.videoSimulcastLayers[0]).toMatchObject({ width: 640, height: 360 });
  });

  it("trocar o fps com a câmera no ar reinicia a captura e reescreve o sender", async () => {
    await useVoice.getState().startCall("dm1", false);
    const { faixa, encodings } = cameraNoAr();
    useVoice.getState().setCameraFps(24);
    await vi.waitFor(() => expect(faixa.restartTrack).toHaveBeenCalledTimes(1));
    expect(faixa.restartTrack.mock.calls[0]?.[0]).toEqual({
      deviceId: "cam1",
      resolution: { width: 1920, height: 1080, frameRate: 24 },
    });
    await vi.waitFor(() => expect(encodings()[1]?.maxFramerate).toBe(24));
    expect(encodings()[1]).toMatchObject({ rid: "h", maxBitrate: 2_500_000, scaleResolutionDownBy: 1 });
    expect(encodings()[0]?.maxFramerate).toBe(20);
  });

  it("a tela no ar alivia a câmera no sender, e parar a tela devolve", async () => {
    await useVoice.getState().startCall("dm1", false);
    const { faixa, encodings } = cameraNoAr();
    useVoice.setState({ screenOn: true });
    await vi.waitFor(() => expect(encodings()[1]?.maxFramerate).toBe(15));
    expect(encodings()[1]?.scaleResolutionDownBy).toBe(1.5);
    expect(encodings()[0]?.maxFramerate).toBe(15);
    useVoice.setState({ screenOn: false });
    await vi.waitFor(() => expect(encodings()[1]?.maxFramerate).toBe(30));
    expect(encodings()[1]?.scaleResolutionDownBy).toBe(1);
    // sem republicar e sem reabrir a captura: não pisca
    expect(faixa.restartTrack).not.toHaveBeenCalled();
  });

  it("o aviso de CPU do navegador aplica o mesmo alívio", async () => {
    await useVoice.getState().startCall("dm1", false);
    const { encodings } = cameraNoAr();
    const lp = SalaFalsa.criadas[0].localParticipant;
    const [evento, ouvinte] = lp.on.mock.calls[0] as unknown as [
      string,
      (faixa: unknown, pub: { source: string }) => void,
    ];
    expect(evento).toBe("localTrackCpuConstrained");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    ouvinte({}, { source: "camera" });
    await vi.waitFor(() => expect(encodings()[1]?.maxFramerate).toBe(15));
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
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

describe("ambiente sem WebRTC (app de Linux)", () => {
  /** O que qualquer tentativa de entrar não pode ter feito. */
  function nadaSaiu() {
    expect(api.startCall).not.toHaveBeenCalled();
    expect(api.voiceToken).not.toHaveBeenCalled();
    expect(SalaFalsa.criadas).toHaveLength(0);
    // nem `voice.join`: os outros me veriam numa chamada em que não estou
    expect(emitidos).toHaveLength(0);
    expect(useVoice.getState().channelId).toBeNull();
    expect(useVoice.getState().status).toBe("idle");
  }

  beforeEach(() => {
    ambiente.webrtc = false;
    api.voiceToken.mockReset();
  });

  it("entrar num canal de voz não conecta e oferece o navegador no mesmo canal", async () => {
    ambiente.tauri = true;
    avisos.confirm.mockResolvedValueOnce(true);
    const canal = { id: "v1", guildId: "g1", name: "Geral", type: "VOICE" } as never;
    await useVoice.getState().connect(canal);
    nadaSaiu();
    expect(sons).toHaveLength(0);
    await vi.waitFor(() => expect(avisos.abrirNoSistema).toHaveBeenCalledTimes(1));
    expect(avisos.confirm.mock.calls[0]?.[0]).toMatchObject({ confirmLabel: "Abrir no navegador" });
    expect(avisos.abrirNoSistema.mock.calls[0]?.[0]).toMatch(/\/app\/channels\/g1\/v1$/);
  });

  it("ligar numa conversa não faz o outro lado tocar", async () => {
    ambiente.tauri = true;
    await useVoice.getState().startCall("dm1", true);
    nadaSaiu();
    expect(useVoice.getState().call.phase).toBe("idle");
    expect(avisos.confirm).toHaveBeenCalledTimes(1);
    // cancelou: nada abre
    expect(avisos.abrirNoSistema).not.toHaveBeenCalled();
  });

  it("o toque continua, e atender não atende", async () => {
    ambiente.tauri = true;
    useVoice.getState().handleRing({ channelId: "dm1", from: OUTRO });
    const atendeu = await useVoice.getState().acceptCall();
    expect(atendeu).toBe(false);
    expect(useVoice.getState().call.phase).toBe("incoming");
    nadaSaiu();
    expect(avisos.confirm).toHaveBeenCalledTimes(1);
  });

  it("o toque acabando (30s) fecha sozinho o aviso ainda aberto", async () => {
    ambiente.tauri = true;
    useVoice.getState().handleRing({ channelId: "dm1", from: OUTRO });
    // o aviso fica pendurado até algo chamar `closeModal` — é a janela em que
    // o toque pode acabar por baixo dele, com "Abrir no navegador" ainda na tela
    avisos.confirm.mockImplementationOnce(confirmPendurado);
    const atendeu = await useVoice.getState().acceptCall();
    expect(atendeu).toBe(false);
    expect(avisos.closeModal).not.toHaveBeenCalled();
    // ninguém atendeu nos 30s: o servidor derruba o toque
    useVoice.getState().handleEnded({ channelId: "dm1", reason: "timeout", by: null });
    expect(useVoice.getState().call.phase).toBe("idle");
    expect(avisos.closeModal).toHaveBeenCalled();
    // drena o `await ui.confirm(...)` que `closeModal` acabou de destravar,
    // senão a trava de "um aviso por vez" fica presa para o próximo teste
    await new Promise((r) => setTimeout(r, 0));
  });

  it("o chamador desistindo também fecha o aviso ainda aberto", async () => {
    ambiente.tauri = true;
    useVoice.getState().handleRing({ channelId: "dm1", from: OUTRO });
    avisos.confirm.mockImplementationOnce(confirmPendurado);
    await useVoice.getState().acceptCall();
    useVoice.getState().handleEnded({ channelId: "dm1", reason: "ended", by: OUTRO });
    expect(avisos.closeModal).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
  });

  it("um estado de voz alheio não fecha o aviso: só o fim do toque fecha", async () => {
    ambiente.tauri = true;
    useVoice.getState().handleRing({ channelId: "dm1", from: OUTRO });
    avisos.confirm.mockImplementationOnce(confirmPendurado);
    await useVoice.getState().acceptCall();
    useVoice.getState().applyState(estadoDeVoz("bia", "dm2"));
    expect(avisos.closeModal).not.toHaveBeenCalled();
    expect(useVoice.getState().call.phase).toBe("incoming");
    // o aviso deste teste nunca fecha sozinho — fecha à mão, para não vazar a
    // trava de "um aviso por vez" para o próximo teste
    avisos.resolvePendente?.(false);
    await new Promise((r) => setTimeout(r, 0));
  });

  it("dois cliques seguidos não empilham dois avisos", async () => {
    ambiente.tauri = true;
    // o primeiro aviso fica aberto até o teste fechá-lo
    let fechar: (ok: boolean) => void = () => {};
    avisos.confirm.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (fechar = resolve)),
    );
    await useVoice.getState().startCall("dm1", false);
    await useVoice.getState().startCall("dm1", false);
    expect(avisos.confirm).toHaveBeenCalledTimes(1);
    // fechado o primeiro, o próximo clique volta a avisar
    fechar(false);
    await new Promise((r) => setTimeout(r, 0));
    await useVoice.getState().startCall("dm1", false);
    expect(avisos.confirm).toHaveBeenCalledTimes(2);
  });

  it("num navegador sem WebRTC avisa sem oferecer abrir no navegador", async () => {
    await useVoice.getState().startCall("dm2", false);
    nadaSaiu();
    expect(avisos.confirm).not.toHaveBeenCalled();
    expect(avisos.toast).toHaveBeenCalledWith(expect.stringContaining("WebRTC"), "error");
  });

  it("clique repetido no navegador sem WebRTC não empilha um toast por clique", async () => {
    // sem `confirm` (não é o app) não há como saber quando o aviso "fechou" —
    // é a mesma trava do outro caminho, só que destravada por tempo
    await useVoice.getState().startCall("dm2", false);
    await useVoice.getState().startCall("dm2", false);
    await useVoice.getState().startCall("dm2", false);
    expect(avisos.toast).toHaveBeenCalledTimes(1);
  });

  it("depois da janela da trava, um novo clique volta a avisar", async () => {
    vi.useFakeTimers();
    try {
      await useVoice.getState().startCall("dm2", false);
      expect(avisos.toast).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      await useVoice.getState().startCall("dm2", false);
      expect(avisos.toast).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
