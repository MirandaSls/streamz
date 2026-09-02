import { describe, expect, it } from "vitest";
import type { VoiceStateEvent } from "@streamz/shared";
import { estadosAposReconexao } from "./voice-reconexao";

function estado(userId: string, channelId: string, guildId: string | null = null): VoiceStateEvent {
  return {
    channelId,
    guildId,
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
  };
}

const quem = (states: Record<string, VoiceStateEvent[]>) =>
  Object.fromEntries(Object.entries(states).map(([c, l]) => [c, l.map((e) => e.user.id)]));

describe("estadosAposReconexao", () => {
  it("a chamada em conversa continua com todo mundo depois da queda", () => {
    // o defeito: zerar `states` e recarregar só o servidor deixava a DM vazia
    const atual = { dm1: [estado("eu", "dm1"), estado("ana", "dm1")] };
    const proximo = estadosAposReconexao(atual, [
      { escopo: "servidor", guildId: "g1", estados: [] },
      { escopo: "sala", channelId: "dm1", estados: [estado("eu", "dm1"), estado("ana", "dm1")] },
    ]);
    expect(quem(proximo)).toEqual({ dm1: ["eu", "ana"] });
  });

  it("a resposta do servidor é a verdade dele: quem saiu durante a queda some, quem entrou aparece", () => {
    const atual = { voz1: [estado("ana", "voz1", "g1")], voz2: [estado("bia", "voz2", "g1")] };
    const proximo = estadosAposReconexao(atual, [
      { escopo: "servidor", guildId: "g1", estados: [estado("caio", "voz1", "g1")] },
    ]);
    expect(quem(proximo)).toEqual({ voz1: ["caio"] });
  });

  it("o que não foi recarregado some, como o zerar fazia — só que depois da resposta", () => {
    const atual = { voz9: [estado("ana", "voz9", "g-outro")] };
    const proximo = estadosAposReconexao(atual, [
      { escopo: "servidor", guildId: "g1", estados: [] },
    ]);
    expect(proximo).toEqual({});
  });

  it("recarga que falhou preserva o escopo dela em vez de esvaziar o palco", () => {
    const atual = { dm1: [estado("eu", "dm1"), estado("ana", "dm1")], voz1: [estado("bia", "voz1", "g1")] };
    const proximo = estadosAposReconexao(atual, [
      { escopo: "servidor", guildId: "g1", estados: [] },
      { escopo: "sala", channelId: "dm1", estados: null },
    ]);
    expect(quem(proximo)).toEqual({ dm1: ["eu", "ana"] });
  });

  it("sem nada a recarregar, sem nada na store", () => {
    expect(estadosAposReconexao({ dm1: [estado("ana", "dm1")] }, [])).toEqual({});
  });
});
