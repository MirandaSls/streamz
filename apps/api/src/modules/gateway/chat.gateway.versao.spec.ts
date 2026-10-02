import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import { ChatGateway } from "./chat.gateway";

/**
 * Testa o ramo de versão do `handleConnection` na classe real. As dependências
 * são falsas só no que o connect toca; `markOnline` é espionado porque o que
 * importa aqui é se foi chamado, não a presença em si.
 */
function montar() {
  const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: "u1", username: "ana" }) };
  const contas = {
    estado: vi.fn().mockResolvedValue({ existe: true, excluida: false, desativada: false }),
  };
  const guilds = { visibleChannelsForUser: vi.fn().mockResolvedValue([{ id: "c1" }]) };
  const prisma = { guildMember: { findMany: vi.fn().mockResolvedValue([{ guildId: "g1" }]) } };
  const gw = new ChatGateway(
    jwt as never,
    {} as never,
    prisma as never,
    guilds as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    contas as never,
    {} as never,
  );
  const markOnline = vi.fn().mockResolvedValue(undefined);
  (gw as unknown as { markOnline: typeof markOnline }).markOnline = markOnline;
  return { gw, markOnline };
}

function socketFalso(cliente?: string) {
  return {
    id: "s1",
    data: {} as Record<string, unknown>,
    handshake: {
      auth: { token: "t", ...(cliente ? { cliente } : {}) },
      query: {},
      headers: {},
    },
    emit: vi.fn(),
    join: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("ChatGateway.handleConnection: versão do cliente", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("MIN_CLIENT_VERSION", "");
    vi.stubEnv("WARN_CLIENT_VERSION", "");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("bloqueia cliente abaixo da mínima: avisa, não entra em sala e desconecta após 250 ms", async () => {
    vi.stubEnv("MIN_CLIENT_VERSION", "1.3.18");
    const { gw, markOnline } = montar();
    const s = socketFalso("desktop/1.3.9");
    await gw.handleConnection(s as never);

    expect(s.emit).toHaveBeenCalledWith(
      WS_EVENTS.CLIENT_OUTDATED,
      expect.objectContaining({ nivel: "bloqueado" }),
    );
    expect(s.join).not.toHaveBeenCalled();
    expect(markOnline).not.toHaveBeenCalled();
    expect(s.data.user).toBeUndefined();

    // Adiado para o evento ter tempo de ser escrito antes do transporte fechar.
    vi.advanceTimersByTime(249);
    expect(s.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.disconnect).toHaveBeenCalledWith(true);
  });

  it("só avisa quando está abaixo da recomendada: emite e o connect segue", async () => {
    vi.stubEnv("WARN_CLIENT_VERSION", "1.3.18");
    const { gw, markOnline } = montar();
    const s = socketFalso("desktop/1.3.9");
    await gw.handleConnection(s as never);

    expect(s.emit).toHaveBeenCalledWith(
      WS_EVENTS.CLIENT_OUTDATED,
      expect.objectContaining({ nivel: "aviso" }),
    );
    expect(s.join).toHaveBeenCalled();
    expect(markOnline).toHaveBeenCalledWith("u1");
    expect(s.data.user).toEqual({ id: "u1", username: "ana" });
    vi.advanceTimersByTime(1000);
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it.each(["desktop/1.3.18", "desktop/2.0.0"])("cliente em dia (%s) não recebe aviso", async (c) => {
    vi.stubEnv("MIN_CLIENT_VERSION", "1.3.18");
    vi.stubEnv("WARN_CLIENT_VERSION", "1.3.18");
    const { gw } = montar();
    const s = socketFalso(c);
    await gw.handleConnection(s as never);

    expect(s.emit).not.toHaveBeenCalled();
    expect(s.join).toHaveBeenCalled();
  });

  it("navegador (sem auth.cliente) nunca é barrado, mesmo com mínima alta", async () => {
    vi.stubEnv("MIN_CLIENT_VERSION", "99.0.0");
    const { gw, markOnline } = montar();
    const s = socketFalso();
    await gw.handleConnection(s as never);

    expect(s.emit).not.toHaveBeenCalled();
    expect(s.join).toHaveBeenCalled();
    expect(markOnline).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it("sem política (envs vazias) nada acontece, nem com desktop/0.0.1", async () => {
    const { gw } = montar();
    const s = socketFalso("desktop/0.0.1");
    await gw.handleConnection(s as never);

    expect(s.emit).not.toHaveBeenCalled();
    expect(s.join).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(s.disconnect).not.toHaveBeenCalled();
  });
});
