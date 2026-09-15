import { describe, expect, it } from "vitest";
import {
  isEmptySearch,
  mentionsMe,
  parseSearchQuery,
  replySnippet,
  type Message,
  type PublicUser,
} from "@streamz/shared";

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

  // ── prefixos em português ──
  // O Discord em pt-BR mostra `de:`, `em:`, `tem:` e `menciona:` no popout
  // "Filtros" e aceita `antes:`, `depois:` e `durante:` (PREFIXOS_DE_BUSCA em
  // packages/shared/src/mensagens.ts). Os casos abaixo prendem os sinônimos e
  // as bordas em que um filtro viraria texto — ou texto viraria filtro — calado.

  it("de:, em: e tem: em português, juntos com o texto livre", () => {
    const f = parseSearchQuery("de:@ana em:#geral tem:imagem bug no login");
    expect(f.from).toBe("ana");
    expect(f.in).toBe("geral");
    expect(f.has).toEqual(["image"]);
    expect(f.text).toBe("bug no login");
  });

  it("texto livre entre filtros em português fica na ordem digitada", () => {
    const f = parseSearchQuery("bug de:ana no em:geral login");
    expect(f.from).toBe("ana");
    expect(f.in).toBe("geral");
    expect(f.text).toBe("bug no login");
  });

  it("reconhece menciona:, com e sem @", () => {
    expect(parseSearchQuery("menciona:@bia").mentions).toBe("bia");
    const f = parseSearchQuery("menciona:bia prazo");
    expect(f.mentions).toBe("bia");
    expect(f.text).toBe("prazo");
  });

  it("tem:arquivo e tem:anexo são o mesmo `file`; tem:link é `link`", () => {
    expect(parseSearchQuery("tem:arquivo").has).toEqual(["file"]);
    expect(parseSearchQuery("tem:anexo").has).toEqual(["file"]);
    expect(parseSearchQuery("tem:link").has).toEqual(["link"]);
    // arquivo e anexo juntos não repetem o `file`
    const f = parseSearchQuery("tem:arquivo tem:link tem:anexo");
    expect(f.has).toEqual(["file", "link"]);
    expect(f.text).toBe("");
  });

  it("antes: e depois: com datas válidas", () => {
    const f = parseSearchQuery("antes:2026-08-25 depois:2026-08-01 reunião");
    expect(f.before).toBe("2026-08-25");
    expect(f.after).toBe("2026-08-01");
    expect(f.text).toBe("reunião");
  });

  it("depois: com data que não existe volta ao texto", () => {
    const f = parseSearchQuery("depois:2026-02-30");
    expect(f.after).toBeNull();
    expect(f.text).toBe("depois:2026-02-30");
  });

  it("durante: vira o par depois: (dia anterior) + antes: (dia seguinte)", () => {
    const f = parseSearchQuery("durante:2026-08-15");
    expect(f.after).toBe("2026-08-14");
    expect(f.before).toBe("2026-08-16");
    expect(f.text).toBe("");
    expect(isEmptySearch(f)).toBe(false);
  });

  it("durante: atravessa a virada de mês e de ano no calendário", () => {
    const marco = parseSearchQuery("durante:2026-03-01");
    expect(marco.after).toBe("2026-02-28");
    expect(marco.before).toBe("2026-03-02");
    const reveillon = parseSearchQuery("durante:2026-12-31");
    expect(reveillon.after).toBe("2026-12-30");
    expect(reveillon.before).toBe("2027-01-01");
  });

  it("durante:2026-02-31 não existe: é texto, e não mexe em antes/depois", () => {
    const f = parseSearchQuery("durante:2026-02-31");
    expect(f.before).toBeNull();
    expect(f.after).toBeNull();
    expect(f.text).toBe("durante:2026-02-31");
  });

  it("durante: fora do formato AAAA-MM-DD também é texto", () => {
    const f = parseSearchQuery("durante:ontem");
    expect(f.before).toBeNull();
    expect(f.after).toBeNull();
    expect(f.text).toBe("durante:ontem");
  });

  it("tem:constructor é texto (não acha o do Object.prototype)", () => {
    const f = parseSearchQuery("tem:constructor");
    expect(f.has).toEqual([]);
    expect(f.text).toBe("tem:constructor");
    // e o mesmo para outras chaves herdadas
    expect(parseSearchQuery("tem:toString").text).toBe("tem:toString");
    expect(parseSearchQuery("has:__proto__").has).toEqual([]);
  });

  it("prefixo e valor de tem: sem diferença de caixa; o valor de De: fica como veio", () => {
    const f = parseSearchQuery("De:@Ana EM:#Geral TEM:Link");
    expect(f.from).toBe("Ana");
    expect(f.in).toBe("Geral");
    expect(f.has).toEqual(["link"]);
    expect(f.text).toBe("");
  });

  it("during: em inglês continua valendo, igual ao durante:", () => {
    const f = parseSearchQuery("during:2026-08-15");
    expect(f.after).toBe("2026-08-14");
    expect(f.before).toBe("2026-08-16");
    expect(f.text).toBe("");
    expect(parseSearchQuery("during:2026-02-31").text).toBe("during:2026-02-31");
  });

  it("português e inglês misturados na mesma consulta", () => {
    const f = parseSearchQuery("from:ana tem:arquivo has:link em:geral");
    expect(f.from).toBe("ana");
    expect(f.in).toBe("geral");
    expect(f.has).toEqual(["file", "link"]);
    expect(f.text).toBe("");
  });

  it("prefixo em português sem valor continua sendo texto", () => {
    const f = parseSearchQuery("de: alguém");
    expect(f.from).toBeNull();
    expect(f.text).toBe("de: alguém");
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
