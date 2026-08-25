import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline, plainText } from "../markdown-core";

describe("markdown inline", () => {
  it("negrito, itálico, sublinhado, riscado e spoiler", () => {
    const n = parseInline("**a** *b* __c__ ~~d~~ ||e||");
    expect(n.map((x) => x.t)).toEqual([
      "bold", "text", "italic", "text", "underline", "text", "strike", "text", "spoiler",
    ]);
    expect(plainText(n)).toBe("a b c d e");
  });

  it("aninha marcas", () => {
    const n = parseInline("**negrito com *itálico***");
    expect(n[0].t).toBe("bold");
    expect(plainText(n)).toBe("negrito com itálico");
  });

  it("não vira itálico com espaço colado ao asterisco (2 * 3 * 4)", () => {
    const n = parseInline("2 * 3 * 4");
    expect(n).toEqual([{ t: "text", v: "2 * 3 * 4" }]);
  });

  it("código inline não interpreta marcas", () => {
    const n = parseInline("use `**x**` aqui");
    expect(n[1]).toEqual({ t: "code", v: "**x**" });
  });

  it("link e menção", () => {
    const n = parseInline("veja https://exemplo.com/a?b=1 e fale com @ana.silva!");
    expect(n.find((x) => x.t === "link")).toEqual({ t: "link", href: "https://exemplo.com/a?b=1" });
    expect(n.find((x) => x.t === "mention")).toEqual({ t: "mention", username: "ana.silva" });
  });

  it("e-mail não vira menção", () => {
    const n = parseInline("mande para joao@exemplo.com");
    expect(n.some((x) => x.t === "mention")).toBe(false);
  });

  it("escape imprime o caractere", () => {
    expect(plainText(parseInline("\\*não é itálico\\*"))).toBe("*não é itálico*");
  });
});

describe("markdown blocos", () => {
  it("bloco de código com linguagem, citação e título", () => {
    const b = parseBlocks("# Título\n> citação\n```ts\nconst a = 1;\n```\ntexto");
    expect(b[0]).toMatchObject({ t: "h", level: 1 });
    expect(b[1]).toMatchObject({ t: "quote" });
    expect(b[2]).toEqual({ t: "codeblock", lang: "ts", v: "const a = 1;" });
    expect(b[3]).toMatchObject({ t: "p" });
  });

  it("bloco de código sem fechamento vira texto", () => {
    const b = parseBlocks("```\nsem fim");
    expect(b.every((x) => x.t === "p")).toBe(true);
  });
});
