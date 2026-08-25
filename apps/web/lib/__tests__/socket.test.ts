import { beforeEach, describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@newdisc/shared";

/** Socket de mentira: guarda handlers registrados e emissões, para o teste
 *  disparar `connect`/`connect_error` na mão. */
const dublê = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const emissoes: Array<{ evento: string; carga: unknown }> = [];
  const socket = {
    connected: false,
    on(evento: string, handler: (...args: unknown[]) => void) {
      handlers.set(evento, handler);
      return socket;
    },
    emit(evento: string, carga?: unknown) {
      emissoes.push({ evento, carga });
      return socket;
    },
    connect: vi.fn(() => socket),
    disconnect: vi.fn(() => socket),
    removeAllListeners: vi.fn(() => {
      handlers.clear();
      return socket;
    }),
  };
  const io = vi.fn(() => socket);
  return { handlers, emissoes, socket, io };
});

vi.mock("socket.io-client", () => ({ io: dublê.io }));
vi.mock("../session", () => ({
  getAccessToken: vi.fn(async () => "access-token"),
  renovarTokens: vi.fn(async () => ({ accessToken: "a", refreshToken: "r" })),
}));

async function carregarSocket() {
  vi.resetModules();
  return import("../socket");
}

/** Dispara um handler do socket como o Socket.IO faria. */
function disparar(evento: string, ...args: unknown[]) {
  const handler = dublê.handlers.get(evento);
  if (!handler) throw new Error(`nenhum handler para ${evento}`);
  handler(...args);
}

const juntadas = () =>
  dublê.emissoes.filter((e) => e.evento === WS_EVENTS.CHANNEL_JOIN).map((e) => e.carga);

beforeEach(() => {
  // o mock de `../session` sobrevive ao resetModules: limpar tudo evita que a
  // renovação chamada num teste anterior vaze para o seguinte
  vi.clearAllMocks();
  dublê.handlers.clear();
  dublê.emissoes.length = 0;
  dublê.socket.connected = false;
  dublê.io.mockClear();
  dublê.socket.connect.mockClear();
  dublê.socket.disconnect.mockClear();
});

describe("registro de salas", () => {
  it("reentra em todos os canais acompanhados a cada connect", async () => {
    const { joinChannel } = await carregarSocket();
    joinChannel("c1");
    joinChannel("c2");
    // desconectado: nada é emitido até o socket subir
    expect(juntadas()).toEqual([]);

    dublê.socket.connected = true;
    disparar("connect");
    expect(juntadas()).toEqual(["c1", "c2"]);

    // queda e volta: as salas precisam ser refeitas, o servidor as perdeu
    dublê.emissoes.length = 0;
    disparar("connect");
    expect(juntadas()).toEqual(["c1", "c2"]);
  });

  it("emite na hora quando já está conectado", async () => {
    const { joinChannel } = await carregarSocket();
    dublê.socket.connected = true;
    joinChannel("c1");
    expect(juntadas()).toEqual(["c1"]);
  });

  it("canal deixado não volta na reconexão", async () => {
    const { joinChannel, leaveChannel } = await carregarSocket();
    dublê.socket.connected = true;
    joinChannel("c1");
    joinChannel("c2");
    leaveChannel("c1");

    expect(dublê.emissoes.at(-1)).toEqual({
      evento: WS_EVENTS.CHANNEL_LEAVE,
      carga: "c1",
    });

    dublê.emissoes.length = 0;
    disparar("connect");
    expect(juntadas()).toEqual(["c2"]);
  });
});

describe("onReconnect", () => {
  it("avisa nas reconexões, não na primeira conexão", async () => {
    const { getSocket, onReconnect } = await carregarSocket();
    getSocket();
    const ouvinte = vi.fn();
    onReconnect(ouvinte);

    disparar("connect");
    expect(ouvinte).not.toHaveBeenCalled();

    disparar("connect");
    expect(ouvinte).toHaveBeenCalledOnce();
  });

  it("cancela o registro pela função devolvida", async () => {
    const { getSocket, onReconnect } = await carregarSocket();
    getSocket();
    const ouvinte = vi.fn();
    const cancelar = onReconnect(ouvinte);

    disparar("connect");
    cancelar();
    disparar("connect");
    expect(ouvinte).not.toHaveBeenCalled();
  });
});

describe("token expirado", () => {
  it("renova e reconecta uma única vez por ciclo", async () => {
    const { getSocket } = await carregarSocket();
    const { renovarTokens } = await import("../session");
    getSocket();

    disparar("connect_error", new Error("Unauthorized"));
    await vi.waitFor(() => expect(dublê.socket.connect).toHaveBeenCalledOnce());
    expect(renovarTokens).toHaveBeenCalledOnce();

    // segunda falha no mesmo ciclo não deve virar laço de refresh
    disparar("connect_error", new Error("Unauthorized"));
    await Promise.resolve();
    expect(renovarTokens).toHaveBeenCalledOnce();
  });

  it("desconexão iniciada pelo servidor também dispara a renovação", async () => {
    const { getSocket } = await carregarSocket();
    const { renovarTokens } = await import("../session");
    getSocket();

    disparar("disconnect", "transport close");
    await Promise.resolve();
    expect(renovarTokens).not.toHaveBeenCalled();

    disparar("disconnect", "io server disconnect");
    await vi.waitFor(() => expect(renovarTokens).toHaveBeenCalledOnce());
  });
});

describe("disconnectSocket", () => {
  it("destrói o singleton e esquece as salas", async () => {
    const { joinChannel, getSocket, disconnectSocket } = await carregarSocket();
    dublê.socket.connected = true;
    joinChannel("c1");
    disconnectSocket();

    expect(dublê.socket.disconnect).toHaveBeenCalledOnce();
    expect(dublê.socket.removeAllListeners).toHaveBeenCalled();

    dublê.emissoes.length = 0;
    getSocket();
    expect(dublê.io).toHaveBeenCalledTimes(2);
    disparar("connect");
    expect(juntadas()).toEqual([]);
  });
});
