import { describe, expect, it } from "vitest";
import type { CustomEmoji } from "@streamz/shared";
import { parseBlocks, parseInline, plainText, soEmojis } from "../markdown-core";
import { aplicarEmojisPersonalizados } from "@/stores/emojis";

function emoji(name: string, id: string): CustomEmoji {
  return { id, guildId: "g1", name, animated: false, url: `/api/emojis/${id}/image`, createdById: "u1" };
}

const CATALOGO = [emoji("festa", "abc123"), emoji("gato_feliz", "def456")];

describe("token de emoji personalizado", () => {
  it("reconhece <:nome:id> no meio do texto", () => {
    const n = parseInline("oi <:festa:abc123> tchau");
    expect(n.map((x) => x.t)).toEqual(["text", "emoji", "text"]);
    expect(n[1]).toEqual({ t: "emoji", name: "festa", id: "abc123" });
  });

  it("no texto puro volta como :nome: (prévias e notificações)", () => {
    expect(plainText(parseInline("<:festa:abc123>!"))).toBe(":festa:!");
  });

  it("não confunde com um `<` solto nem com maiúsculas no nome", () => {
    expect(parseInline("2 < 3").every((n) => n.t === "text")).toBe(true);
    expect(parseInline("<:Festa:abc123>").every((n) => n.t === "text")).toBe(true);
  });

  it("emoji dentro de negrito continua sendo emoji", () => {
    const n = parseInline("**<:festa:abc123>**");
    expect(n[0].t).toBe("bold");
    if (n[0].t === "bold") expect(n[0].c[0].t).toBe("emoji");
  });
});

describe("aplicarEmojisPersonalizados", () => {
  it("troca :nome: pela forma interna quando o emoji existe", () => {
    expect(aplicarEmojisPersonalizados("bom dia :festa:", CATALOGO)).toBe(
      "bom dia <:festa:abc123>",
    );
  });

  it("deixa :nome: desconhecido como está", () => {
    expect(aplicarEmojisPersonalizados("são :dez: horas", CATALOGO)).toBe("são :dez: horas");
  });

  it("não estraga hora nem caminho com dois-pontos", () => {
    expect(aplicarEmojisPersonalizados("às 10:30:00", CATALOGO)).toBe("às 10:30:00");
  });

  it("troca várias ocorrências", () => {
    expect(aplicarEmojisPersonalizados(":festa: :gato_feliz: :festa:", CATALOGO)).toBe(
      "<:festa:abc123> <:gato_feliz:def456> <:festa:abc123>",
    );
  });

  it("sem catálogo devolve o texto intocado", () => {
    expect(aplicarEmojisPersonalizados(":festa:", [])).toBe(":festa:");
  });
});

describe("soEmojis (jumbo)", () => {
  it("mensagem só com emoji personalizado", () => {
    expect(soEmojis(parseBlocks("<:festa:abc123>"))).toBe(true);
  });

  it("mensagem só com emoji unicode, inclusive sequência com ZWJ", () => {
    expect(soEmojis(parseBlocks("🎉"))).toBe(true);
    expect(soEmojis(parseBlocks("🎉 🎂 🥳"))).toBe(true);
    expect(soEmojis(parseBlocks("👨‍👩‍👧"))).toBe(true);
  });

  it("emoji com texto junto não é jumbo", () => {
    expect(soEmojis(parseBlocks("parabéns 🎉"))).toBe(false);
    expect(soEmojis(parseBlocks("<:festa:abc123> oi"))).toBe(false);
  });

  it("mensagem vazia ou só texto não é jumbo", () => {
    expect(soEmojis(parseBlocks(""))).toBe(false);
    expect(soEmojis(parseBlocks("oi"))).toBe(false);
  });

  it("acima do teto de emojis volta ao tamanho normal", () => {
    expect(soEmojis(parseBlocks("🎉".repeat(28)))).toBe(false);
  });
});
