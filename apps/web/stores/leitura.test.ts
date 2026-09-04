import { describe, expect, it } from "vitest";
import { canalLido, conversaLida, listaLida, temNaoLido } from "./leitura";

/**
 * O que o evento `channel.read` faz com a lista — e por que aplicar duas vezes
 * tem de dar exatamente o mesmo objeto.
 *
 * Quem originou a leitura já a aplicou de forma otimista antes de o servidor
 * responder: o eco chega depois, e se ele criasse uma lista nova o zustand
 * mandaria a coluna redesenhar à toa (a piscada). Por isso "sem mudança" aqui
 * significa **a mesma referência**, não um objeto igual.
 */

const CANAL = {
  id: "c1",
  lastMessageAt: "2026-09-03T12:00:00.000Z",
  lastReadAt: null as string | null,
  mentionCount: 3,
};

const CONVERSA = {
  id: "d1",
  lastMessageAt: "2026-09-03T12:00:00.000Z",
  lastReadAt: null as string | null,
  mentionCount: 1,
  unreadCount: 4,
};

describe("canalLido", () => {
  it("marca a leitura e zera as menções", () => {
    const depois = canalLido(CANAL, "2026-09-03T12:30:00.000Z");
    expect(depois.lastReadAt).toBe("2026-09-03T12:30:00.000Z");
    expect(depois.mentionCount).toBe(0);
  });

  it("aplicar o mesmo evento de novo devolve o mesmo objeto", () => {
    const uma = canalLido(CANAL, "2026-09-03T12:30:00.000Z");
    const duas = canalLido(uma, "2026-09-03T12:30:00.000Z");
    expect(duas).toBe(uma);
  });

  it("evento atrasado não desfaz uma leitura mais nova", () => {
    const novo = canalLido(CANAL, "2026-09-03T12:30:00.000Z");
    const atrasado = canalLido(novo, "2026-09-03T12:05:00.000Z");
    expect(atrasado).toBe(novo);
    expect(atrasado.lastReadAt).toBe("2026-09-03T12:30:00.000Z");
  });

  it("menção que sobrou de um evento antigo ainda é limpa", () => {
    const lido = { ...CANAL, lastReadAt: "2026-09-03T12:30:00.000Z", mentionCount: 2 };
    expect(canalLido(lido, "2026-09-03T12:10:00.000Z").mentionCount).toBe(0);
  });
});

describe("conversaLida", () => {
  it("zera menções e não lidas junto com a leitura", () => {
    const depois = conversaLida(CONVERSA, "2026-09-03T12:30:00.000Z");
    expect(depois).toMatchObject({
      lastReadAt: "2026-09-03T12:30:00.000Z",
      mentionCount: 0,
      unreadCount: 0,
    });
  });

  it("é idempotente", () => {
    const uma = conversaLida(CONVERSA, "2026-09-03T12:30:00.000Z");
    expect(conversaLida(uma, "2026-09-03T12:30:00.000Z")).toBe(uma);
  });

  it("a conversa que chegou depois da leitura continua não lida", () => {
    const lida = conversaLida(CONVERSA, "2026-09-03T12:30:00.000Z");
    const nova = { ...lida, lastMessageAt: "2026-09-03T13:00:00.000Z", unreadCount: 1 };
    // um evento com a leitura antiga não pode apagar o badge da mensagem nova
    expect(conversaLida(nova, "2026-09-03T12:30:00.000Z").unreadCount).toBe(0);
    // (o `lastReadAt` não anda para trás — quem conta o não lido é a mensagem)
    expect(conversaLida(nova, "2026-09-03T12:30:00.000Z").lastReadAt).toBe(
      "2026-09-03T12:30:00.000Z",
    );
  });
});

describe("listaLida", () => {
  const lista = [CANAL, { ...CANAL, id: "c2" }, { ...CANAL, id: "c3" }];

  it("mexe só nos ids do lote", () => {
    const depois = listaLida(lista, ["c2"], (c) => canalLido(c, "2026-09-03T12:30:00.000Z"));
    expect(depois[0]).toBe(lista[0]);
    expect(depois[2]).toBe(lista[2]);
    expect(depois[1].mentionCount).toBe(0);
  });

  it("sem nada a mudar devolve a mesma lista (o eco não redesenha)", () => {
    const lidos = listaLida(lista, ["c1", "c2", "c3"], (c) =>
      canalLido(c, "2026-09-03T12:30:00.000Z"),
    );
    const denovo = listaLida(lidos, ["c1", "c2", "c3"], (c) =>
      canalLido(c, "2026-09-03T12:30:00.000Z"),
    );
    expect(denovo).toBe(lidos);
  });

  it("id que não está na lista é ignorado", () => {
    expect(listaLida(lista, ["fantasma"], (c) => canalLido(c, "x"))).toBe(lista);
  });
});

describe("temNaoLido", () => {
  it("é não lido enquanto houver mensagem depois da leitura", () => {
    expect(temNaoLido([{ lastMessageAt: "2026-09-03T12:00:00.000Z", lastReadAt: null }])).toBe(true);
    expect(
      temNaoLido([
        { lastMessageAt: "2026-09-03T12:00:00.000Z", lastReadAt: "2026-09-03T12:30:00.000Z" },
      ]),
    ).toBe(false);
  });

  it("canal sem mensagem nunca é não lido", () => {
    expect(temNaoLido([{ lastMessageAt: null, lastReadAt: null }])).toBe(false);
  });
});
