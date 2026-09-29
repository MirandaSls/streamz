import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **Trocar de canal de voz não pode deixar a call anterior tocando.**
 *
 * O relato: "quando você está em uma call em um servidor e troca de chat de
 * voz você continua escutando a call anterior". A entrada numa sala é
 * assíncrona em várias etapas (token, chunk do SDK, `room.connect`) e nenhuma
 * era cancelada pela troca: `desmontarSala` só alcança a `Room` que já está em
 * `sala`, e uma entrada esperando o token ainda não tem `Room`. Quando o token
 * atrasado chegava, `entrarNaSala` derrubava a sala **nova**, punha a antiga em
 * `sala` — que é de onde o `AudioRemotoHost` tira quem tocar — e o
 * `set({ status: "connected" })` dela ainda passava por cima da entrada nova.
 *
 * Aqui o token de cada canal só chega quando o teste manda, e a `Room` falsa
 * registra com que token conectou e se foi desconectada: "a sala vigente é a
 * do canal B" vira asserção.
 */

const { SalaFalsa } = vi.hoisted(() => {
  class SalaFalsa {
    static criadas: SalaFalsa[] = [];
    /** quando ligado, `connect` fica pendurado até o teste chamar `concluir`. */
    static segurarConexao = false;
    static zerar() {
      SalaFalsa.criadas = [];
      SalaFalsa.segurarConexao = false;
    }
    state = "disconnected";
    token: string | null = null;
    desconectada = false;
    concluir: (() => void) | null = null;
    private rejeitar: ((e: Error) => void) | null = null;
    localParticipant = {
      identity: "ana",
      isCameraEnabled: false,
      trackPublications: new Map(),
      publishTrack: vi.fn(async () => {}),
      unpublishTrack: vi.fn(async () => {}),
      setCameraEnabled: vi.fn(async () => {}),
      getTrackPublication: vi.fn(() => undefined),
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
    async connect(_url: string, token: string) {
      this.token = token;
      if (SalaFalsa.segurarConexao) {
        await new Promise<void>((resolve, reject) => {
          this.concluir = resolve;
          this.rejeitar = reject;
        });
      }
      this.state = "connected";
    }
    async disconnect() {
      this.desconectada = true;
      this.state = "disconnected";
      // como o SDK: desconectar no meio do handshake rejeita o `connect`
      this.rejeitar?.(new Error("Client initiated disconnect"));
      this.rejeitar = null;
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

const { api, tokens, emitidos } = vi.hoisted(() => {
  /** o token de cada canal, liberado quando o teste mandar. */
  const tokens = new Map<string, () => void>();
  return {
    tokens,
    api: {
      startCall: vi.fn(),
      dmVoiceStates: vi.fn(async () => []),
      guildVoiceStates: vi.fn(async () => []),
      voiceToken: vi.fn(
        (channelId: string) =>
          new Promise<{ token: string; url: string; room: string }>((resolve) => {
            tokens.set(channelId, () =>
              resolve({ token: `t-${channelId}`, url: "wss://livekit", room: `voice:${channelId}` }),
            );
          }),
      ),
      telaToken: vi.fn(async () => ({ token: "t", url: "wss://lk", room: "r" })),
    },
    emitidos: [] as { evento: string; dados: unknown }[],
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
  ehMac: () => false,
  isTauri: () => false,
  iniciarTelaNativa: vi.fn(async () => {}),
  pararTelaNativa: vi.fn(async () => {}),
  ouvirTelaEncerrada: () => () => {},
  suspenderAtenuacaoDoWindows: vi.fn(async () => {}),
  restaurarAtenuacaoDoWindows: vi.fn(async () => {}),
}));
vi.mock("@/lib/suporte-a-chamadas", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  suportaChamadas: () => true,
}));
vi.mock("@/lib/microfone", () => ({
  abrirMicrofone: vi.fn(async () => {}),
  atualizarMicrofone: vi.fn(async () => {}),
  definirMicrofoneAberto: vi.fn(async () => {}),
  definirMicrofoneEmTeste: vi.fn(async () => {}),
  fecharMicrofone: vi.fn(async () => {}),
}));
vi.mock("@/lib/ringtone", () => ({
  tocarSom: vi.fn(),
  tocarSomDeMovido: vi.fn(),
  definirSurdoParaSons: () => {},
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
import { salaAtual, useVoice } from "@/stores/voice";
import { iniciarMedicaoDePing } from "@/stores/voice-ping";

const EU = { id: "ana", username: "ana", displayName: null, avatarUrl: null } as never;
const CANAL_A = { id: "a", guildId: "g1", name: "Canal A", type: "VOICE" as const };
const CANAL_B = { id: "b", guildId: "g1", name: "Canal B", type: "VOICE" as const };

/** Deixa as promessas pendentes andarem sem avançar relógio nenhum. */
const drenar = () => new Promise((r) => setTimeout(r, 0));

/** Solta o token do canal (a resposta de `GET /voice/:id/token`). */
function liberarToken(channelId: string) {
  const liberar = tokens.get(channelId);
  if (!liberar) throw new Error(`nenhum pedido de token para ${channelId}`);
  liberar();
}

const salasDe = (channelId: string) => SalaFalsa.criadas.filter((s) => s.token === `t-${channelId}`);

beforeEach(() => {
  SalaFalsa.zerar();
  vi.mocked(iniciarMedicaoDePing).mockClear();
  tokens.clear();
  emitidos.length = 0;
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

describe("trocar de canal com a entrada anterior ainda em voo", () => {
  it("o token de A chegando por último não traz a sala de A de volta", async () => {
    const entradaA = useVoice.getState().connect(CANAL_A);
    const entradaB = useVoice.getState().connect(CANAL_B);

    liberarToken("b");
    await entradaB;
    // só agora o token de A chega — a ordem que o servidor não garante
    liberarToken("a");
    await entradaA;
    await drenar();

    const s = useVoice.getState();
    expect(s.channelId).toBe("b");
    expect(s.status).toBe("connected");
    expect(s.erro).toBeNull();
    // a sala tocando no `AudioRemotoHost` é a de B
    const vigente = salaAtual() as unknown as InstanceType<typeof SalaFalsa> | null;
    expect(vigente?.token).toBe("t-b");
    expect(vigente?.desconectada).toBe(false);
    // e de A não sobrou conexão de pé: ou nem nasceu, ou foi derrubada
    expect(salasDe("a").every((sala) => sala.desconectada)).toBe(true);
  });

  it("a sala de A que termina o handshake depois da troca é desconectada", async () => {
    SalaFalsa.segurarConexao = true;
    const entradaA = useVoice.getState().connect(CANAL_A);
    liberarToken("a");
    await drenar();
    // A já tem `Room` e está no meio do `room.connect`
    const [salaA] = salasDe("a");
    expect(salaA).toBeDefined();

    const entradaB = useVoice.getState().connect(CANAL_B);
    liberarToken("b");
    await drenar();
    // B ainda no handshake e a rejeição de A já processada: o estado é de B
    // entrando, não a faixa vermelha de "não foi possível conectar" que a
    // entrada de A anunciaria por cima
    expect(useVoice.getState().status).toBe("connecting");
    expect(useVoice.getState().erro).toBeNull();
    const [salaB] = salasDe("b");
    salaB?.concluir?.();
    await entradaB;
    // o `connect` rejeitado de A (derrubada pela troca) não pode virar a faixa
    // vermelha de "não foi possível conectar" por cima de B
    await entradaA;
    await drenar();

    const s = useVoice.getState();
    expect(salaA?.desconectada).toBe(true);
    expect(salaAtual()).toBe(salaB as never);
    expect(s.channelId).toBe("b");
    expect(s.status).toBe("connected");
    expect(s.erro).toBeNull();
  });

  it("A concluindo o handshake mesmo depois de desconectada não assume a sala", async () => {
    // o SDK nem sempre consegue abortar a tentativa: aqui ela resolve de
    // qualquer jeito, depois de B já estar de pé
    SalaFalsa.segurarConexao = true;
    const entradaA = useVoice.getState().connect(CANAL_A);
    liberarToken("a");
    await drenar();
    const [salaA] = salasDe("a");
    // a troca desmonta A sem rejeitar o `connect` dela
    salaA!.disconnect = async () => {
      salaA!.desconectada = true;
    };

    const entradaB = useVoice.getState().connect(CANAL_B);
    liberarToken("b");
    await drenar();
    salasDe("b")[0]?.concluir?.();
    await entradaB;
    salaA?.concluir?.();
    await entradaA;
    await drenar();

    expect(salaA?.desconectada).toBe(true);
    // nada desta sala aposentada segue rodando: nem a medição de ping da barra
    // "Voz conectada", que passaria a medir a conexão errada
    expect(iniciarMedicaoDePing).not.toHaveBeenCalledWith(salaA);
    expect((salaAtual() as unknown as { token: string } | null)?.token).toBe("t-b");
    expect(useVoice.getState().channelId).toBe("b");
    expect(useVoice.getState().status).toBe("connected");
  });

  it("sair com o token ainda em voo não abre sala nenhuma depois", async () => {
    const entrada = useVoice.getState().connect(CANAL_A);
    await useVoice.getState().disconnect();

    liberarToken("a");
    await entrada;
    await drenar();

    // sem a guarda, a `Room` nascia com `channelId` nulo: ninguém a ouvia, mas
    // o microfone era publicado nela e a sala continuava me ouvindo
    expect(SalaFalsa.criadas).toHaveLength(0);
    expect(salaAtual()).toBeNull();
    expect(useVoice.getState().channelId).toBeNull();
    expect(useVoice.getState().status).toBe("idle");
  });

  it("o clique repetido no canal em que estou entrando não cancela a entrada", async () => {
    const entrada = useVoice.getState().connect(CANAL_A);
    // mesma sala, ainda `connecting`: a guarda de "já estou aqui" devolve cedo
    await useVoice.getState().connect(CANAL_A);

    liberarToken("a");
    await entrada;
    await drenar();

    expect(useVoice.getState().status).toBe("connected");
    expect((salaAtual() as unknown as { token: string } | null)?.token).toBe("t-a");
  });
});
