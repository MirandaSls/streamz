import { describe, expect, it } from "vitest";
import {
  isEmptySearch,
  mentionsMe,
  parseSearchQuery,
  replySnippet,
  type Message,
  type PublicUser,
} from "@newdisc/shared";

/**
 * O parser de filtros e a regra de menção por resposta são lógica pura — e são
 * onde a busca e o contador de menções erram calado (filtro virando texto,
 * menção contada duas vezes). Por isso o teste vive fora do banco.
 */

describe("parseSearchQuery", () => {
  it("separa filtros do texto livre", () => {
    const f = parseSearchQuery("from:@ana in:#geral has:image bug no login");
    expect(f.from).toBe("ana");
    expect(f.in).toBe("geral");
    expect(f.has).toEqual(["image"]);
    expect(f.text).toBe("bug no login");
  });

  it("aceita o autor sem @ e o canal sem #", () => {
    const f = parseSearchQuery("from:ana in:geral");
    expect(f.from).toBe("ana");
    expect(f.in).toBe("geral");
    expect(f.text).toBe("");
  });

  it("acumula has: sem repetir", () => {
    const f = parseSearchQuery("has:link has:file has:link");
    expect(f.has).toEqual(["link", "file"]);
  });

  it("aceita datas válidas e devolve a inválida ao texto", () => {
    const f = parseSearchQuery("before:2026-08-25 after:2026-02-31");
    expect(f.before).toBe("2026-08-25");
    expect(f.after).toBeNull();
    expect(f.text).toBe("after:2026-02-31");
  });

  it("trata valor desconhecido de has: como texto, não como filtro vazio", () => {
    const f = parseSearchQuery("has:xpto");
    expect(f.has).toEqual([]);
    expect(f.text).toBe("has:xpto");
  });

  it("não engole um dois-pontos que não é filtro", () => {
    const f = parseSearchQuery("aviso: reunião hoje");
    expect(f.text).toBe("aviso: reunião hoje");
  });

  it("token sem valor continua sendo texto", () => {
    const f = parseSearchQuery("from: algo");
    expect(f.from).toBeNull();
    expect(f.text).toBe("from: algo");
  });

  it("reconhece mentions: e a busca vazia", () => {
    expect(parseSearchQuery("mentions:@bia").mentions).toBe("bia");
    expect(isEmptySearch(parseSearchQuery("   "))).toBe(true);
    expect(isEmptySearch(parseSearchQuery("has:link"))).toBe(false);
  });
});

describe("replySnippet", () => {
  it("achata quebras de linha", () => {
    expect(replySnippet("linha 1\n\nlinha 2")).toBe("linha 1 linha 2");
  });

  it("corta no limite com reticências", () => {
    const s = replySnippet("a".repeat(200));
    expect(s).toHaveLength(100);
    expect(s.endsWith("…")).toBe(true);
  });
});

const ana: PublicUser = {
  id: "u-ana",
  username: "ana",
  displayName: null,
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
};
const bia: PublicUser = { ...ana, id: "u-bia", username: "bia" };

function msg(over: Partial<Message>): Message {
  return {
    id: "m1",
    sticker: null,
    suppressEmbeds: false,
    channelId: "c1",
    guildId: "g1",
    author: bia,
    content: "",
    createdAt: new Date().toISOString(),
    editedAt: null,
    reactions: [],
    parentId: null,
    replyCount: 0,
    attachments: [],
    type: "DEFAULT",
    replyTo: null,
    replyMention: false,
    pinned: false,
    thread: null,
    ...over,
  };
}

describe("mentionsMe", () => {
  it("conta a menção textual", () => {
    expect(mentionsMe(msg({ content: "oi @ana" }), ana)).toBe(true);
    expect(mentionsMe(msg({ content: "oi @anabela" }), ana)).toBe(false);
  });

  it("conta a resposta a mim quando o @ está ligado", () => {
    const resposta = msg({
      content: "certo",
      replyMention: true,
      replyTo: { id: "m0", author: ana, content: "pergunta", hasAttachments: false },
    });
    expect(mentionsMe(resposta, ana)).toBe(true);
  });

  it("não conta a resposta com o @ desligado", () => {
    const resposta = msg({
      content: "certo",
      replyMention: false,
      replyTo: { id: "m0", author: ana, content: "pergunta", hasAttachments: false },
    });
    expect(mentionsMe(resposta, ana)).toBe(false);
  });

  it("não conta resposta à mensagem de outra pessoa", () => {
    const resposta = msg({
      content: "certo",
      replyMention: true,
      replyTo: { id: "m0", author: bia, content: "pergunta", hasAttachments: false },
    });
    expect(mentionsMe(resposta, ana)).toBe(false);
  });

  it("a própria mensagem nunca me menciona", () => {
    expect(mentionsMe(msg({ author: ana, content: "@ana" }), ana)).toBe(false);
  });
});
