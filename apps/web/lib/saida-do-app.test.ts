import { beforeEach, describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@streamz/shared";

/**
 * Sair do app é **declarado**; fechar a aba, não.
 *
 * O gateway espera `VOICE_RECONNECT_GRACE_MS` (45 s) antes de tirar da voz quem
 * some, porque no fio uma queda de rede é igual a um programa fechado. No app de
 * desktop dá para não adivinhar: o Rust avisa antes de morrer, então o cliente
 * **diz** `voice.leave` e sai na hora. No navegador não dá — o único evento de
 * saída (`pagehide`) dispara igual num F5, e sair na hora ali derrubaria da
 * chamada quem só recarregou a página (em conversa direta, encerrando a chamada
 * para os dois lados, porque `removerDaVoz` chama `calls.onDisconnect`).
 */

/** Chamadas feitas no socket, na ordem — é a ordem que prova a intenção. */
const chamadas: string[] = [];
/** Ouvintes de evento do socket registrados por `getSocket`. */
const ouvintesDoSocket = new Map<string, (...args: unknown[]) => void>();
/** O que `ouvirSaidaDoApp` recebeu: o Rust chamando isto é "o app vai fechar". */
let sairDoApp: (() => void) | null = null;
/** Ouvintes que o módulo pendurou na janela (nenhum, é o que o teste exige). */
const ouvintesDaJanela: string[] = [];

const socketFalso = {
  connected: true,
  on(evento: string, ouvinte: (...args: unknown[]) => void) {
    ouvintesDoSocket.set(evento, ouvinte);
    return this;
  },
  emit(evento: string) {
    chamadas.push(`emit:${evento}`);
    return this;
  },
  disconnect() {
    chamadas.push("disconnect");
    return this;
  },
  connect() {
    return this;
  },
  removeAllListeners() {
    return this;
  },
};

vi.mock("socket.io-client", () => ({ io: () => socketFalso }));
vi.mock("./session", () => ({
  getAccessToken: async () => "token",
  renovarTokens: async () => ({}),
}));
vi.mock("@/lib/desktop", () => ({
  ouvirSaidaDoApp: (ouvinte: () => void) => {
    sairDoApp = ouvinte;
    return () => {};
  },
}));

async function abrirSocket() {
  vi.resetModules();
  chamadas.length = 0;
  ouvintesDoSocket.clear();
  ouvintesDaJanela.length = 0;
  sairDoApp = null;
  vi.stubGlobal("window", {
    addEventListener: (evento: string) => void ouvintesDaJanela.push(evento),
  });
  const mod = await import("./socket");
  mod.getSocket();
  return mod;
}

describe("saída do app × queda de socket", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("fechar o app declara a saída da voz antes de fechar o socket", async () => {
    await abrirSocket();
    expect(sairDoApp).toBeTypeOf("function");

    sairDoApp!();

    // a ordem é o ponto: o `voice.leave` precisa sair **pelo socket que ainda
    // está aberto**, senão a declaração não chega e sobra a carência
    expect(chamadas).toEqual([`emit:${WS_EVENTS.VOICE_LEAVE}`, "disconnect"]);
  });

  it("recarregar a página não é sair: nada é pendurado em `pagehide`", async () => {
    await abrirSocket();
    // o ouvinte existiu e foi removido de propósito — `pagehide` dispara igual
    // num F5 (`persisted === false` nos dois casos), e desconectar ali tirava
    // da chamada quem só recarregou
    expect(ouvintesDaJanela).not.toContain("pagehide");
  });

  it("queda de socket não declara nada: quem cai fica com a carência", async () => {
    await abrirSocket();
    ouvintesDoSocket.get("disconnect")?.("transport close");
    expect(chamadas).toEqual([]);
  });
});
