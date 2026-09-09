import { describe, expect, it } from "vitest";
import {
  MAX_PREVIA_DM,
  linhaDaPrevia,
  previaDaMensagem,
  textoDaPrevia,
  type Message,
  type MessageType,
  type PreviaDeMensagem,
} from "@streamz/shared";

/**
 * A linha de prévia da coluna "Mensagens" (`autor: texto` embaixo do nome).
 *
 * As funções são do contrato porque as duas pontas as usam: a API preenche
 * `DMChannelView.ultimaMensagem` e o cliente refaz a prévia quando chega
 * `message.new`. Se aparassem diferente, a linha piscaria com outro texto a
 * cada mensagem — é esse desencontro que estes testes prendem.
 */

function texto(content: string): string {
  return textoDaPrevia({ content, type: "DEFAULT" });
}

describe("textoDaPrevia — marcação", () => {
  it("tira negrito, itálico, sublinhado e riscado", () => {
    expect(texto("**bom** *dia* __gente__ ~~não~~")).toBe("bom dia gente não");
  });

  it("mostra o conteúdo do código e revela o spoiler", () => {
    expect(texto("roda `pnpm build` e ||pronto||")).toBe("roda pnpm build e pronto");
  });

  it("bloco de código não vira parede de texto", () => {
    expect(texto("olha\n```ts\nconst a = 1;\n```\nisso")).toBe("olha isso");
  });

  it("some com a citação e com o título", () => {
    expect(texto("> alguém disse\n# Título\ntexto")).toBe("alguém disse Título texto");
  });

  it("respeita o escape: `\\*` é um asterisco de verdade", () => {
    expect(texto("2 \\* 3")).toBe("2 * 3");
  });

  it("emoji personalizado vira `:nome:` e menção a cargo vira @cargo", () => {
    expect(texto("<:festa:abc123> <@&ckxyz> bora")).toBe(":festa: @cargo bora");
  });

  it("achata quebras de linha em uma linha só", () => {
    expect(texto("linha um\n\nlinha dois")).toBe("linha um linha dois");
  });
});

describe("textoDaPrevia — aparar", () => {
  it("não mexe no que já cabe", () => {
    expect(texto("curto")).toBe("curto");
  });

  it("corta em MAX_PREVIA_DM com reticências", () => {
    const t = texto("a".repeat(200));
    expect(t).toHaveLength(MAX_PREVIA_DM);
    expect(t.endsWith("…")).toBe(true);
  });

  it("o limite é ~80 caracteres", () => {
    expect(MAX_PREVIA_DM).toBe(80);
  });
});

describe("textoDaPrevia — mensagem sem texto", () => {
  it("anexo sem texto vira 'Enviou um anexo'", () => {
    expect(
      textoDaPrevia({
        content: "",
        type: "DEFAULT",
        attachments: [{ contentType: "image/png" }],
      }),
    ).toBe("Enviou um anexo");
  });

  it("GIF tem linha própria", () => {
    expect(
      textoDaPrevia({
        content: "",
        type: "DEFAULT",
        attachments: [{ contentType: "image/gif" }],
      }),
    ).toBe("Enviou um GIF");
  });

  it("figurinha também", () => {
    expect(textoDaPrevia({ content: "", type: "DEFAULT", temFigurinha: true })).toBe(
      "Enviou uma figurinha",
    );
  });

  it("o texto ganha do anexo (é ele que diz o que aconteceu)", () => {
    expect(
      textoDaPrevia({
        content: "olha isso",
        type: "DEFAULT",
        attachments: [{ contentType: "image/gif" }],
      }),
    ).toBe("olha isso");
  });

  it("nada a mostrar devolve vazio, não um rótulo inventado", () => {
    expect(textoDaPrevia({ content: "   ", type: "DEFAULT" })).toBe("");
  });
});

function mensagem(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    channelId: "c1",
    guildId: null,
    author: {
      id: "ana",
      username: "ana",
      displayName: "Ana",
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
      bot: false,
    },
    content: "oi",
    createdAt: "2026-09-09T10:00:00.000Z",
    editedAt: null,
    reactions: [],
    parentId: null,
    replyCount: 0,
    attachments: [],
    sticker: null,
    suppressEmbeds: false,
    type: "DEFAULT",
    replyTo: null,
    replyMention: false,
    thread: null,
    pinned: false,
    ...over,
  };
}

describe("previaDaMensagem", () => {
  it("guarda id, autor, instante e tipo — e o texto já aparado", () => {
    const p = previaDaMensagem(mensagem({ content: "**oi**" }));
    expect(p).toEqual({
      id: "m1",
      authorId: "ana",
      content: "oi",
      createdAt: "2026-09-09T10:00:00.000Z",
      tipo: "DEFAULT",
    });
  });

  it("mensagem só de figurinha não vira linha vazia", () => {
    const p = previaDaMensagem(
      mensagem({ content: "", sticker: { id: "s1", guildId: "g", name: "oi", tags: "", url: "u", createdById: "ana" } }),
    );
    expect(p.content).toBe("Enviou uma figurinha");
  });
});

function previa(over: Partial<PreviaDeMensagem> = {}): PreviaDeMensagem {
  return {
    id: "m1",
    authorId: "ana",
    content: "bora hoje",
    createdAt: "2026-09-09T10:00:00.000Z",
    tipo: "DEFAULT" as MessageType,
    ...over,
  };
}

describe("linhaDaPrevia", () => {
  it("mensagem comum vira 'autor: texto'", () => {
    expect(linhaDaPrevia(previa(), { autor: "Ana" })).toBe("Ana: bora hoje");
  });

  it("a minha mensagem é 'Você:' (quem chama resolve o nome)", () => {
    expect(linhaDaPrevia(previa(), { autor: "Você" })).toBe("Você: bora hoje");
  });

  it("narração do sistema é a frase inteira, sem o prefixo do autor", () => {
    const linha = linhaDaPrevia(previa({ tipo: "SYSTEM_MEMBER_ADDED", content: "beto" }), {
      autor: "Ana",
    });
    expect(linha).toBe("Ana adicionou beto ao grupo.");
  });

  it("chamada em curso ganha de qualquer mensagem", () => {
    expect(linhaDaPrevia(previa(), { autor: "Ana", emChamada: true })).toBe("Chamada de voz");
  });

  it("conversa sem mensagem não tem linha", () => {
    expect(linhaDaPrevia(null, { autor: "" })).toBe("");
    expect(linhaDaPrevia(previa({ content: "" }), { autor: "Ana" })).toBe("");
  });
});
