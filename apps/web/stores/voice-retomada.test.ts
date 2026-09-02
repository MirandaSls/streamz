import { describe, expect, it } from "vitest";
import type { VoiceStateEvent } from "@streamz/shared";
import { chamadaARetomar, esquecerSala, lembrarSala, salaLembrada } from "./voice-retomada";

function estado(userId: string, channelId: string, extra: Partial<VoiceStateEvent> = {}): VoiceStateEvent {
  return {
    channelId,
    guildId: null,
    user: {
      id: userId,
      username: userId,
      displayName: null,
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
    },
    connected: true,
    muted: false,
    deafened: false,
    video: false,
    screen: false,
    ...extra,
  };
}

const lembrada = { channelId: "dm1", guildId: null, name: "" };

describe("chamadaARetomar", () => {
  it("volta à sala que esta aba lembra quando o servidor ainda me segura nela", () => {
    // o F5 no meio da chamada: o gateway conta a carência e eu apareço como
    // reconectando na própria sala
    const states = { dm1: [estado("eu", "dm1", { reconnecting: true }), estado("ana", "dm1")] };
    expect(chamadaARetomar({ states, meuId: "eu", conectadoEm: null, lembrada })).toEqual(lembrada);
  });

  it("não entra sozinho onde esta aba não estava: seria expulsar o outro aparelho", () => {
    const states = { dm1: [estado("eu", "dm1", { reconnecting: true })] };
    expect(chamadaARetomar({ states, meuId: "eu", conectadoEm: null, lembrada: null })).toBeNull();
  });

  it("carência acabou (não estou mais na sala) ou outra conexão já voltou inteira: nada a retomar", () => {
    expect(
      chamadaARetomar({ states: { dm1: [estado("ana", "dm1")] }, meuId: "eu", conectadoEm: null, lembrada }),
    ).toBeNull();
    expect(
      chamadaARetomar({ states: { dm1: [estado("eu", "dm1")] }, meuId: "eu", conectadoEm: null, lembrada }),
    ).toBeNull();
  });

  it("já conectado em alguma sala: a retomada não se intromete", () => {
    const states = { dm1: [estado("eu", "dm1", { reconnecting: true })] };
    expect(chamadaARetomar({ states, meuId: "eu", conectadoEm: "voz-2", lembrada })).toBeNull();
  });
});

describe("sala lembrada", () => {
  function armazem(): Storage {
    const dados = new Map<string, string>();
    return {
      get length() {
        return dados.size;
      },
      clear: () => dados.clear(),
      getItem: (k: string) => dados.get(k) ?? null,
      key: () => null,
      removeItem: (k: string) => void dados.delete(k),
      setItem: (k: string, v: string) => void dados.set(k, v),
    };
  }

  it("lembra, lê e esquece", () => {
    const s = armazem();
    expect(salaLembrada(s)).toBeNull();
    lembrarSala({ channelId: "voz-1", guildId: "g1", name: "Geral" }, s);
    expect(salaLembrada(s)).toEqual({ channelId: "voz-1", guildId: "g1", name: "Geral" });
    esquecerSala(s);
    expect(salaLembrada(s)).toBeNull();
  });

  it("sem storage (servidor, storage bloqueado) nada quebra", () => {
    expect(() => lembrarSala(lembrada, null)).not.toThrow();
    expect(salaLembrada(null)).toBeNull();
    expect(() => esquecerSala(null)).not.toThrow();
  });

  it("lixo gravado não vira sala", () => {
    const s = armazem();
    s.setItem("voz:salaAtual", "{nada");
    expect(salaLembrada(s)).toBeNull();
    s.setItem("voz:salaAtual", JSON.stringify({ guildId: "g1" }));
    expect(salaLembrada(s)).toBeNull();
  });
});
