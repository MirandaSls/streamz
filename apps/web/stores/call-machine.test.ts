import { describe, expect, it } from "vitest";
import { CALL_RING_TIMEOUT_MS, type PublicUser } from "@newdisc/shared";
import {
  CHAMADA_INICIAL,
  callReducer,
  motivoDoFim,
  toqueExpirou,
  type CallAction,
  type CallState,
} from "./call-machine";

const ANA: PublicUser = {
  id: "u1",
  username: "ana",
  displayName: "Ana",
  avatarUrl: null,
  status: "ONLINE",
} as unknown as PublicUser;

/** Aplica uma sequência de ações a partir do repouso, com relógio crescente. */
function reduzir(acoes: CallAction[], inicio: CallState = CHAMADA_INICIAL): CallState {
  return acoes.reduce((s, a, i) => callReducer(s, a, 1000 + i), inicio);
}

describe("callReducer", () => {
  it("liga: repouso → chamando", () => {
    const s = reduzir([{ type: "start", channelId: "c1" }]);
    expect(s.phase).toBe("outgoing");
    expect(s.channelId).toBe("c1");
  });

  it("toca: repouso → recebendo, guardando quem ligou", () => {
    const s = reduzir([{ type: "ring", channelId: "c1", from: ANA }]);
    expect(s.phase).toBe("incoming");
    expect(s.from).toBe(ANA);
  });

  it("atender leva a ativa; recusar leva a encerrada", () => {
    const tocando: CallAction = { type: "ring", channelId: "c1", from: ANA };
    expect(reduzir([tocando, { type: "accept" }]).phase).toBe("active");
    const recusada = reduzir([tocando, { type: "decline" }]);
    expect(recusada.phase).toBe("ended");
    expect(recusada.reason).toBe("declined");
  });

  it("expira: quem ligou e ninguém atendeu acaba em encerrada por tempo", () => {
    const s = reduzir([{ type: "start", channelId: "c1" }, { type: "timeout" }]);
    expect(s.phase).toBe("ended");
    expect(s.reason).toBe("timeout");
  });

  it("chamada já ativa não morre de tempo", () => {
    const s = reduzir([
      { type: "start", channelId: "c1" },
      { type: "connected", channelId: "c1" },
      { type: "timeout" },
    ]);
    expect(s.phase).toBe("active");
  });

  it("aceitar depois de expirar não ressuscita a chamada", () => {
    // a corrida real: o outro clica em atender no instante em que o toque morre
    const s = reduzir([
      { type: "ring", channelId: "c1", from: ANA },
      { type: "timeout" },
      { type: "accept" },
    ]);
    expect(s.phase).toBe("ended");
  });

  it("evento de outro canal não move a máquina", () => {
    const s = reduzir([
      { type: "start", channelId: "c1" },
      { type: "connected", channelId: "c2" },
      { type: "ended", channelId: "c2", reason: "ended" },
    ]);
    expect(s.phase).toBe("outgoing");
    expect(s.channelId).toBe("c1");
  });

  it("toque de outra conversa não interrompe a chamada em curso", () => {
    const s = reduzir([
      { type: "start", channelId: "c1" },
      { type: "ring", channelId: "c9", from: ANA },
    ]);
    expect(s.phase).toBe("outgoing");
    expect(s.channelId).toBe("c1");
  });

  it("`connected` repetido não reinicia o cronômetro", () => {
    const primeiro = reduzir([
      { type: "start", channelId: "c1" },
      { type: "connected", channelId: "c1" },
    ]);
    const segundo = callReducer(primeiro, { type: "connected", channelId: "c1" }, 999_999);
    expect(segundo.since).toBe(primeiro.since);
  });

  it("reset volta ao repouso", () => {
    const s = reduzir([
      { type: "ring", channelId: "c1", from: ANA },
      { type: "decline" },
      { type: "reset" },
    ]);
    expect(s).toEqual(CHAMADA_INICIAL);
  });
});

describe("toqueExpirou", () => {
  it("só vale enquanto toca, e só depois do tempo", () => {
    const tocando = callReducer(CHAMADA_INICIAL, { type: "start", channelId: "c1" }, 0);
    expect(toqueExpirou(tocando, CALL_RING_TIMEOUT_MS - 1)).toBe(false);
    expect(toqueExpirou(tocando, CALL_RING_TIMEOUT_MS)).toBe(true);
    const ativa = callReducer(tocando, { type: "connected", channelId: "c1" }, 10);
    expect(toqueExpirou(ativa, CALL_RING_TIMEOUT_MS * 10)).toBe(false);
  });
});

describe("motivoDoFim", () => {
  it("traduz o desfecho, e nada quando a chamada não acabou", () => {
    expect(motivoDoFim(CHAMADA_INICIAL)).toBeNull();
    const recusada = reduzir([{ type: "ring", channelId: "c1", from: ANA }, { type: "decline" }]);
    expect(motivoDoFim(recusada)).toBe("Chamada recusada");
  });
});
