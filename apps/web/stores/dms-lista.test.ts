import { describe, expect, it } from "vitest";
import type { DMChannelView } from "@streamz/shared";
import { comAConversaAberta, noTopo } from "./dms-lista";

/**
 * A regra da coluna "Mensagens diretas": conversa aberta é conversa na lista.
 * O defeito que estes testes prendem é a lista do servidor (`GET /dms`)
 * substituindo a local e levando junto a conversa que está na tela — depois
 * disso ela só voltava quando chegava mensagem nova.
 */

function dm(id: string, lastMessageAt: string | null = null): DMChannelView {
  return {
    id,
    guildId: null,
    name: null,
    type: "DM",
    position: 0,
    private: false,
    readOnly: false,
    lastMessageAt,
    lastReadAt: null,
    mentionCount: 0,
    categoryId: null,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
    others: [],
    iconUrl: null,
    ownerId: null,
    unreadCount: 0,
  };
}

describe("comAConversaAberta", () => {
  it("devolve a lista do servidor quando ela já traz a conversa aberta", () => {
    const doServidor = [dm("a"), dm("b")];
    expect(comAConversaAberta(doServidor, "b", [dm("b")])).toBe(doServidor);
  });

  it("sem conversa aberta, não inventa nada", () => {
    const doServidor = [dm("a")];
    expect(comAConversaAberta(doServidor, null, [dm("z")])).toBe(doServidor);
  });

  it("põe de volta, em primeiro, a conversa aberta que o servidor não trouxe", () => {
    // é a conversa recém-aberta (ainda sem mensagem) cuja lista foi montada
    // antes de ela existir — ou a fechada que outro caminho reabriu
    const lista = comAConversaAberta([dm("a"), dm("b")], "nova", [dm("nova"), dm("a")]);
    expect(lista.map((d) => d.id)).toEqual(["nova", "a", "b"]);
  });

  it("não ressuscita uma conversa que também sumiu do lado local", () => {
    const lista = comAConversaAberta([dm("a")], "fantasma", [dm("a")]);
    expect(lista.map((d) => d.id)).toEqual(["a"]);
  });
});

describe("noTopo", () => {
  it("põe em primeiro sem duplicar", () => {
    const lista = noTopo([dm("a"), dm("b")], dm("b"));
    expect(lista.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("acrescenta quem ainda não está na lista", () => {
    expect(noTopo([dm("a")], dm("c")).map((d) => d.id)).toEqual(["c", "a"]);
  });
});
