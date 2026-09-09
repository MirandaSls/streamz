import { WS_EVENTS, type Message as MessageDTO } from "@streamz/shared";
import { describe, expect, it } from "vitest";
import type { RealtimeService } from "../realtime/realtime.service";
import { anunciarReacao, anunciarReacoesLimpas } from "./eventos-de-reacao";

/**
 * O par de eventos de uma reação.
 *
 * O que estes testes prendem é a assimetria que faz a coisa toda funcionar: o
 * `message.updated` (grosso, para o navegador) sai **sem** avisar os ouvintes
 * locais, e o delta (fino, para a ponte dos bots) sai **com**. Trocar um pelo
 * outro traz de volta o `MESSAGE_UPDATE` por reação — o defeito da F1 — ou
 * quebra o site e o desktop já instalado.
 */

function ambiente() {
  const comOuvintes: { canal: string; evento: string; payload: unknown }[] = [];
  const semOuvintes: { canal: string; evento: string; payload: unknown }[] = [];
  const realtime = {
    emitToChannel(canal: string, evento: string, payload: unknown) {
      comOuvintes.push({ canal, evento, payload });
    },
    emitToChannelSemOuvintes(canal: string, evento: string, payload: unknown) {
      semOuvintes.push({ canal, evento, payload });
    },
  } as unknown as RealtimeService;
  return { realtime, comOuvintes, semOuvintes };
}

const mensagem = {
  id: "m1",
  channelId: "c1",
  guildId: "g1",
} as unknown as MessageDTO;

describe("anunciarReacao", () => {
  it("o `message.updated` da reação não chega aos ouvintes locais", () => {
    const { realtime, comOuvintes, semOuvintes } = ambiente();

    anunciarReacao(realtime, "add", mensagem, "u_ana", "👍");

    expect(semOuvintes).toEqual([
      { canal: "c1", evento: WS_EVENTS.MESSAGE_UPDATED, payload: mensagem },
    ]);
    expect(comOuvintes.map((e) => e.evento)).toEqual([WS_EVENTS.REACTION_ADDED]);
  });

  it("o delta leva quem reagiu e com quê", () => {
    const { realtime, comOuvintes } = ambiente();

    anunciarReacao(realtime, "remove", mensagem, "u_ana", "<:festa:cm1x>");

    expect(comOuvintes[0]).toEqual({
      canal: "c1",
      evento: WS_EVENTS.REACTION_REMOVED,
      payload: {
        messageId: "m1",
        channelId: "c1",
        guildId: "g1",
        userId: "u_ana",
        emoji: "<:festa:cm1x>",
      },
    });
  });
});

describe("anunciarReacoesLimpas", () => {
  it("`emoji: null` é 'limparam todas'", () => {
    const { realtime, comOuvintes, semOuvintes } = ambiente();

    anunciarReacoesLimpas(realtime, mensagem, null);

    expect(semOuvintes[0].evento).toBe(WS_EVENTS.MESSAGE_UPDATED);
    expect(comOuvintes[0]).toEqual({
      canal: "c1",
      evento: WS_EVENTS.REACTIONS_CLEARED,
      payload: { messageId: "m1", channelId: "c1", guildId: "g1", emoji: null },
    });
  });

  it("com emoji, só as daquele emoji", () => {
    const { realtime, comOuvintes } = ambiente();

    anunciarReacoesLimpas(realtime, mensagem, "👍");

    expect((comOuvintes[0].payload as { emoji: string | null }).emoji).toBe("👍");
  });
});
