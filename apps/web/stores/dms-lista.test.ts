import { describe, expect, it } from "vitest";
import type { DMChannelView, PreviaDeMensagem } from "@streamz/shared";
import { comAConversaAberta, noTopo, proximaPrevia } from "./dms-lista";

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
    syncedWithCategory: false,
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

/**
 * `message.updated` chega para qualquer mensagem do canal, não só para a
 * última: sem a comparação, editar uma mensagem antiga trocava a prévia da
 * coluna por ela e ainda jogava a conversa para o topo.
 */
describe("proximaPrevia", () => {
  function previa(id: string, createdAt: string, content = id): PreviaDeMensagem {
    return { id, authorId: "ana", content, createdAt, tipo: "DEFAULT" };
  }

  it("conversa sem prévia aceita a primeira mensagem", () => {
    const nova = previa("m1", "2026-09-09T10:00:00.000Z");
    expect(proximaPrevia(null, nova)).toBe(nova);
    expect(proximaPrevia(undefined, nova)).toBe(nova);
  });

  it("mensagem mais nova troca a linha", () => {
    const atual = previa("m1", "2026-09-09T10:00:00.000Z");
    const nova = previa("m2", "2026-09-09T10:05:00.000Z");
    expect(proximaPrevia(atual, nova)).toBe(nova);
  });

  it("editar a mensagem que está na linha reescreve o texto", () => {
    const atual = previa("m1", "2026-09-09T10:00:00.000Z", "oi");
    const editada = previa("m1", "2026-09-09T10:00:00.000Z", "oi, tudo bem?");
    expect(proximaPrevia(atual, editada)).toBe(editada);
  });

  it("editar uma mensagem antiga não mexe na linha", () => {
    const atual = previa("m2", "2026-09-09T10:05:00.000Z");
    const antiga = previa("m1", "2026-09-09T10:00:00.000Z");
    expect(proximaPrevia(atual, antiga)).toBeNull();
  });
});
