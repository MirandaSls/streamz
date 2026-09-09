import { beforeEach, describe, expect, it } from "vitest";
import type { Message, PublicUser } from "@streamz/shared";
import { contaComoNaoLida } from "./messages-core";
import { useMessages } from "./messages";

/**
 * ── j-bots ── A mensagem efêmera no cliente.
 *
 * Duas regras, e as duas custam caro se quebrarem:
 *
 * 1. **Ela não conta como não lida.** Um badge é a promessa de que há algo
 *    esperando por mim no canal; a efêmera some ao recarregar, e o contador
 *    ficaria apontando para o nada.
 * 2. **"Dispensar" é definitivo nesta sessão.** Depois de dispensada, um
 *    `message.updated` do bot não pode trazê-la de volta — a pessoa disse que
 *    não queria mais ver aquilo.
 */

const BOT: PublicUser = {
  id: "u_bot",
  username: "musicbot",
  displayName: null,
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
};

function efemera(extra: Partial<Message> = {}): Message {
  return {
    id: "e_1",
    channelId: "c1",
    guildId: "g1",
    author: BOT,
    content: "Tocando **Never Gonna Give You Up**",
    createdAt: "2026-09-09T12:00:00.000Z",
    editedAt: null,
    reactions: [],
    parentId: null,
    replyCount: 0,
    attachments: [],
    type: "DEFAULT",
    replyTo: null,
    replyMention: false,
    thread: null,
    pinned: false,
    sticker: null,
    suppressEmbeds: false,
    interacao: { id: "i_1", name: "play", user: BOT },
    efemera: true,
    ...extra,
  };
}

/** Um canal já aberto: é o que `fetchHistory` deixa na store. */
function abrirCanal() {
  useMessages.setState({
    byChannel: { c1: { items: [], hasMore: false, loading: false, loadingOlder: false } },
  });
}

const itens = () => useMessages.getState().byChannel.c1?.items ?? [];

describe("contaComoNaoLida", () => {
  it("a efêmera não conta; qualquer outra conta", () => {
    expect(contaComoNaoLida(efemera())).toBe(false);
    expect(contaComoNaoLida({ efemera: false })).toBe(true);
    // payload antigo, de antes do campo existir: mensagem normal
    expect(contaComoNaoLida({})).toBe(true);
  });
});

describe("a efêmera na timeline", () => {
  beforeEach(abrirCanal);

  it("entra na lista como qualquer mensagem, com a marca", () => {
    useMessages.getState().handleNew(efemera());

    expect(itens()).toHaveLength(1);
    expect(itens()[0]?.efemera).toBe(true);
  });

  it("`editReply()` do bot a edita no lugar, sem duplicar", () => {
    useMessages.getState().handleNew(efemera({ content: "pensando…" }));
    useMessages.getState().handleUpdated(efemera({ content: "pong" }));

    expect(itens()).toHaveLength(1);
    expect(itens()[0]?.content).toBe("pong");
  });

  it("'Dispensar mensagem' a tira da lista", () => {
    useMessages.getState().handleNew(efemera());
    useMessages.getState().dispensarEfemera("c1", "e_1");

    expect(itens()).toEqual([]);
  });

  it("dispensada é definitivo: um `message.updated` depois não a ressuscita", () => {
    useMessages.getState().handleNew(efemera());
    useMessages.getState().dispensarEfemera("c1", "e_1");
    useMessages.getState().handleUpdated(efemera({ content: "voltei" }));

    expect(itens()).toEqual([]);
  });

  it("dispensar uma não mexe nas outras mensagens do canal", () => {
    useMessages.getState().handleNew(efemera({ id: "m_1", efemera: false, interacao: null }));
    useMessages.getState().handleNew(efemera());
    useMessages.getState().dispensarEfemera("c1", "e_1");

    expect(itens().map((m) => m.id)).toEqual(["m_1"]);
  });
});
