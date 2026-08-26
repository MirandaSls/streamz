import { describe, expect, it } from "vitest";
import type { Message, PublicUser } from "@streamz/shared";
import {
  applyDelete,
  applyUpdate,
  bumpReplyCount,
  dropByNonce,
  markFailed,
  optimisticMessage,
  prependOlder,
  reconcile,
  trim,
  RETENTION_LIMIT,
  type ChatMessage,
} from "./messages-core";

const author: PublicUser = {
  id: "u1",
  username: "arthur",
  displayName: null,
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
};

function message(id: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    channelId: "c1",
    guildId: null,
    author,
    content: `msg ${id}`,
    createdAt: "2026-08-25T12:00:00.000Z",
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
    ...extra,
  };
}

describe("reconcile", () => {
  it("troca a mensagem otimista pela real, no mesmo lugar", () => {
    const pending = optimisticMessage({
      nonce: "n1",
      channelId: "c1",
      author,
      content: "oi",
    });
    const items: ChatMessage[] = [message("a"), pending];

    const next = reconcile(items, message("real", { nonce: "n1" }));

    expect(next).toHaveLength(2);
    expect(next[1].id).toBe("real");
    expect(next[1].pending).toBeUndefined();
  });

  it("não duplica quando o mesmo id chega duas vezes", () => {
    const items: ChatMessage[] = [message("a")];
    const next = reconcile(reconcile(items, message("b")), message("b"));
    expect(next.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("ignora o nonce de outra pessoa e apenas acrescenta", () => {
    const items: ChatMessage[] = [message("a")];
    const next = reconcile(items, message("b", { nonce: "de-outro-cliente" }));
    expect(next.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("segura o array no teto de retenção, cortando pelo topo", () => {
    let items: ChatMessage[] = Array.from({ length: RETENTION_LIMIT }, (_, i) =>
      message(`m${i}`),
    );
    items = reconcile(items, message("novo"));
    expect(items).toHaveLength(RETENTION_LIMIT);
    expect(items[0].id).toBe("m1"); // a mais antiga saiu
    expect(items[items.length - 1].id).toBe("novo");
  });
});

describe("trim", () => {
  it("não mexe no array quando cabe no limite", () => {
    const items: ChatMessage[] = [message("a")];
    expect(trim(items)).toBe(items);
  });
});

describe("prependOlder", () => {
  it("junta a página antiga no topo sem repetir o que já existe", () => {
    const items: ChatMessage[] = [message("b"), message("c")];
    const next = prependOlder(items, [message("a"), message("b")]);
    expect(next.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("devolve o mesmo array quando não há nada novo", () => {
    const items: ChatMessage[] = [message("a")];
    expect(prependOlder(items, [message("a")])).toBe(items);
  });
});

describe("applyUpdate", () => {
  it("preserva o contador de respostas local, que a edição não conhece", () => {
    const items: ChatMessage[] = [message("a", { replyCount: 3 })];
    const next = applyUpdate(items, message("a", { content: "editado", replyCount: 0 }));
    expect(next[0].content).toBe("editado");
    expect(next[0].replyCount).toBe(3);
  });

  it("devolve o mesmo array quando a mensagem não está na lista", () => {
    const items: ChatMessage[] = [message("a")];
    expect(applyUpdate(items, message("z"))).toBe(items);
  });
});

describe("applyDelete", () => {
  it("remove a resposta e devolve o contador da raiz", () => {
    const items: ChatMessage[] = [message("raiz", { replyCount: 2 }), message("resp")];
    const next = applyDelete(items, "resp", "raiz");
    expect(next.map((m) => m.id)).toEqual(["raiz"]);
    expect(next[0].replyCount).toBe(1);
  });

  it("nunca deixa o contador negativo", () => {
    const items: ChatMessage[] = [message("raiz", { replyCount: 0 })];
    expect(applyDelete(items, "resp", "raiz")[0].replyCount).toBe(0);
  });
});

describe("bumpReplyCount / markFailed / dropByNonce", () => {
  it("soma no contador da raiz", () => {
    const items: ChatMessage[] = [message("raiz", { replyCount: 1 })];
    expect(bumpReplyCount(items, "raiz", 1)[0].replyCount).toBe(2);
  });

  it("marca como falha só a mensagem pendente daquele nonce", () => {
    const items: ChatMessage[] = [
      message("a"),
      optimisticMessage({ nonce: "n1", channelId: "c1", author, content: "oi" }),
    ];
    const next = markFailed(items, "n1");
    expect(next[1].pending).toBe(false);
    expect(next[1].failed).toBe(true);
    expect(next[0].failed).toBeUndefined();
  });

  it("descarta a otimista pelo nonce", () => {
    const items: ChatMessage[] = [
      message("a"),
      optimisticMessage({ nonce: "n1", channelId: "c1", author, content: "oi" }),
    ];
    expect(dropByNonce(items, "n1").map((m) => m.id)).toEqual(["a"]);
  });
});
