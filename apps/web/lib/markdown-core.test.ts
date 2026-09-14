import { describe, expect, it } from "vitest";
import {
  destacarCodigo,
  formatarCarimbo,
  intervaloDoRelativo,
  parseBlocks,
  parseInline,
  plainText,
  soEmojis,
  type Block,
} from "./markdown-core";

/**
 * Gramática do markdown do Discord (cartão 2b-markdown). Os casos de sempre
 * (negrito, itálico, menção por username, emoji personalizado) continuam em
 * `lib/__tests__/markdown.test.ts` e `emoji-personalizado.test.ts`.
 */

describe("link mascarado e link sem prévia", () => {
  it("[texto](url) vira só o texto, com o href guardado", () => {
    expect(parseInline("[Status do servidor](https://example.com/status)")).toEqual([
      {
        t: "maskedLink",
        href: "https://example.com/status",
        c: [{ t: "text", v: "Status do servidor" }],
      },
    ]);
  });

  it("aceita a url entre <> e marcação no texto", () => {
    const [no] = parseInline("[**forte**](<https://example.com/a>)");
    expect(no).toMatchObject({ t: "maskedLink", href: "https://example.com/a" });
    if (no.t === "maskedLink") expect(no.c[0].t).toBe("bold");
  });

  it("não aninha link dentro do texto mascarado", () => {
    const [no] = parseInline("[https://a.com](https://b.com)");
    expect(no.t).toBe("maskedLink");
    if (no.t === "maskedLink") expect(no.c).toEqual([{ t: "text", v: "https://a.com" }]);
  });

  it("recusa esquema que não é http(s)", () => {
    const nos = parseInline("[clique](javascript:alert(1))");
    expect(nos.some((n) => n.t === "maskedLink")).toBe(false);
  });

  it("<https://…> é link comum, sem os sinais", () => {
    expect(parseInline("veja <https://example.com/sem-previa> ok")).toEqual([
      { t: "text", v: "veja " },
      { t: "link", href: "https://example.com/sem-previa" },
      { t: "text", v: " ok" },
    ]);
  });

  it("texto puro do link mascarado é o texto", () => {
    expect(plainText(parseInline("[aqui](https://example.com)!"))).toBe("aqui!");
  });
});

describe("menções por id", () => {
  it("<@id>, <@!id>, <@&id> e <#id>", () => {
    const nos = parseInline("<@cmtx1> <@!123> <@&cargo9> <#cmtxgczpr0027ev4745ruj6dk>");
    expect(nos.filter((n) => n.t !== "text")).toEqual([
      { t: "userMention", userId: "cmtx1" },
      { t: "userMention", userId: "123" },
      { t: "roleMention", roleId: "cargo9" },
      { t: "channelMention", channelId: "cmtxgczpr0027ev4745ruj6dk" },
    ]);
  });

  it("forma incompleta continua texto", () => {
    expect(parseInline("<@> <#> <@&>").every((n) => n.t === "text")).toBe(true);
  });
});

describe("carimbo <t:…>", () => {
  it("reconhece o estilo e usa f quando não vem nenhum", () => {
    expect(parseInline("<t:1618953630:R>")[0]).toEqual({
      t: "timestamp",
      unix: 1618953630,
      estilo: "R",
      bruto: "<t:1618953630:R>",
    });
    expect(parseInline("<t:1618953630>")[0]).toMatchObject({ t: "timestamp", estilo: "f" });
  });

  it("estilo inválido ou data fora do alcance ficam crus", () => {
    expect(parseInline("<t:1618953630:x>").every((n) => n.t === "text")).toBe(true);
    expect(parseInline("<t:99999999999999999>").every((n) => n.t === "text")).toBe(true);
  });

  // 1618953630 = 2021-04-20 21:20:30 UTC (terça-feira)
  const U = 1618953630;
  it("formata os estilos absolutos em pt-BR", () => {
    expect(formatarCarimbo(U, "t", 0, "UTC")).toBe("21:20");
    expect(formatarCarimbo(U, "T", 0, "UTC")).toBe("21:20:30");
    expect(formatarCarimbo(U, "d", 0, "UTC")).toBe("20/04/2021");
    expect(formatarCarimbo(U, "D", 0, "UTC")).toBe("20 de abril de 2021");
    expect(formatarCarimbo(U, "f", 0, "UTC")).toBe("20 de abril de 2021 21:20");
    expect(formatarCarimbo(U, "F", 0, "UTC")).toBe("terça-feira, 20 de abril de 2021 21:20");
  });

  it("usa o fuso de quem lê", () => {
    expect(formatarCarimbo(U, "t", 0, "America/Sao_Paulo")).toBe("18:20");
  });

  it("relativo para o passado e para o futuro", () => {
    expect(formatarCarimbo(U, "R", (U + 2 * 3600) * 1000)).toBe("há 2 horas");
    expect(formatarCarimbo(U, "R", (U - 5 * 60) * 1000)).toBe("em 5 minutos");
    expect(formatarCarimbo(U, "R", (U + 3 * 86_400) * 1000)).toBe("há 3 dias");
  });

  it("relativo atualiza por segundo só no primeiro minuto", () => {
    expect(intervaloDoRelativo(U, (U + 10) * 1000)).toBe(1_000);
    expect(intervaloDoRelativo(U, (U + 600) * 1000)).toBe(30_000);
  });
});

describe("blocos do Discord", () => {
  it("-# é subtexto; -#sem espaço não", () => {
    expect(parseBlocks("-# Ao participar, você concorda.")[0]).toMatchObject({ t: "sub" });
    expect(parseBlocks("-#colado")[0]).toMatchObject({ t: "p" });
  });

  it("títulos só até ###, e #canal é texto", () => {
    expect(parseBlocks("## Regras")[0]).toMatchObject({ t: "h", level: 2 });
    expect(parseBlocks("#### quatro")[0].t).toBe("p");
    expect(parseBlocks("#geral")[0].t).toBe("p");
  });

  it("linhas seguidas de > viram uma citação só", () => {
    const b = parseBlocks("> um\n> dois\nfora");
    expect(b).toHaveLength(2);
    expect(b[0].t).toBe("quote");
    if (b[0].t === "quote") expect(b[0].c).toHaveLength(2);
    expect(b[1].t).toBe("p");
  });

  it(">>> cita até o fim, e > dentro dela é texto", () => {
    const b = parseBlocks("antes\n>>> a\nb\n> c");
    expect(b).toHaveLength(2);
    const q = b[1];
    expect(q.t).toBe("quote");
    if (q.t === "quote") {
      expect(q.c.map((x) => x.t)).toEqual(["p", "p", "p"]);
      expect(plainText((q.c[2] as Extract<Block, { t: "p" }>).c)).toBe("> c");
    }
  });

  it(">texto sem espaço não é citação", () => {
    expect(parseBlocks(">colado")[0].t).toBe("p");
  });

  it("bloco de código dentro de citação", () => {
    const b = parseBlocks("> ```js\n> const a = 1;\n> ```");
    expect(b[0].t).toBe("quote");
    if (b[0].t === "quote") expect(b[0].c[0]).toEqual({ t: "codeblock", lang: "js", v: "const a = 1;" });
  });

  it("lista numerada começa no número digitado", () => {
    const b = parseBlocks("3. três\n4. quatro");
    expect(b).toEqual([
      {
        t: "list",
        ordenada: true,
        inicio: 3,
        itens: [
          { c: [{ t: "text", v: "três" }], filhos: [] },
          { c: [{ t: "text", v: "quatro" }], filhos: [] },
        ],
      },
    ]);
  });

  it("lista com recuo aninha, e trocar o marcador abre outra lista", () => {
    const b = parseBlocks("- a\n  - a1\n  - a2\n- b\n1. um");
    expect(b.map((x) => x.t)).toEqual(["list", "list"]);
    const [pontos, numeros] = b as Extract<Block, { t: "list" }>[];
    expect(pontos.ordenada).toBe(false);
    expect(pontos.itens).toHaveLength(2);
    expect(pontos.itens[0].filhos).toHaveLength(1);
    expect((pontos.itens[0].filhos[0] as Extract<Block, { t: "list" }>).itens).toHaveLength(2);
    expect(numeros.ordenada).toBe(true);
  });

  it("* com espaço é item; *itálico* não", () => {
    expect(parseBlocks("* item")[0].t).toBe("list");
    expect(parseBlocks("*itálico*")[0].t).toBe("p");
  });

  it("``` numa linha só é bloco, sem linguagem", () => {
    expect(parseBlocks("```oi```")[0]).toEqual({ t: "codeblock", lang: null, v: "oi" });
  });

  it("primeira linha que não parece linguagem é conteúdo", () => {
    expect(parseBlocks("```a = 1\nb = 2\n```")[0]).toEqual({ t: "codeblock", lang: null, v: "a = 1\nb = 2" });
  });

  it("texto depois da cerca de fechamento não some", () => {
    const b = parseBlocks("```\nx\n``` depois");
    expect(b.map((x) => x.t)).toEqual(["codeblock", "p"]);
  });

  it("mensagem com citação ou lista não é jumbo", () => {
    expect(soEmojis(parseBlocks("> 🎉"))).toBe(false);
    expect(soEmojis(parseBlocks("- 🎉"))).toBe(false);
    expect(soEmojis(parseBlocks("🎉🎉🎉"))).toBe(true);
  });

  it("a mensagem de regras da bancada", () => {
    const b = parseBlocks(
      "## Regras do servidor\n1. Seja gentil com todo mundo.\n2. Nada de spam nem autopromoção.\n3. Use o canal certo para cada assunto.\n-# Ao participar, você concorda com estas regras.",
    );
    expect(b.map((x) => x.t)).toEqual(["h", "list", "sub"]);
  });
});

describe("destaque de sintaxe", () => {
  const junta = (codigo: string, lang: string) => (destacarCodigo(codigo, lang) ?? []).map((t) => t.v).join("");
  const tipos = (codigo: string, lang: string) =>
    (destacarCodigo(codigo, lang) ?? []).filter((t) => t.tipo).map((t) => [t.tipo, t.v]);

  it("sem linguagem, ou linguagem desconhecida, não pinta", () => {
    expect(destacarCodigo("x", null)).toBeNull();
    expect(destacarCodigo("x", "brainfuck")).toBeNull();
  });

  it("nunca perde nem troca caractere", () => {
    const amostras: [string, string][] = [
      ["export function soma(a: number, b: number): number {\n  // comentário\n  return a + b;\n}", "ts"],
      ['def f(x):\n    """doc"""\n    return x  # fim', "py"],
      ['{"a": [1, 2.5e3, true, null], "b": "c\\"d"}', "json"],
      ['<div class="x" hidden>oi</div><!-- c -->', "html"],
      ["+ novo\n- velho\n@@ -1 +1 @@\n contexto", "diff"],
      ['echo "$HOME" ${USER} # c', "bash"],
      ["a { color: #fff; margin: 0 4px } /* c */", "css"],
      ["SELECT * FROM t WHERE id = 'x' -- c", "sql"],
      ["texto 'sem fim\nsegunda", "js"],
    ];
    for (const [codigo, lang] of amostras) expect(junta(codigo, lang)).toBe(codigo);
  });

  it("TypeScript: palavra-chave, título, tipo, número, string e comentário", () => {
    const t = tipos('export function soma(a: Pessoa): number { return 1 + "x"; } // c', "ts");
    expect(t).toContainEqual(["keyword", "export"]);
    expect(t).toContainEqual(["keyword", "function"]);
    expect(t).toContainEqual(["title", "soma"]);
    expect(t).toContainEqual(["type", "Pessoa"]);
    // tipo primitivo conhecido é "built_in" — e o CSS do Discord pinta os dois igual
    expect(t).toContainEqual(["built_in", "number"]);
    expect(t).toContainEqual(["number", "1"]);
    expect(t).toContainEqual(["string", '"x"']);
    expect(t).toContainEqual(["comment", "// c"]);
  });

  it("Python: def dá título e # é comentário", () => {
    const t = tipos("def soma(a):\n    return True  # ok", "python");
    expect(t).toContainEqual(["title", "soma"]);
    expect(t).toContainEqual(["literal", "True"]);
    expect(t).toContainEqual(["comment", "# ok"]);
  });

  it("JSON: chave é atributo, valor é string", () => {
    const t = tipos('{"nome": "Pixel"}', "json");
    expect(t).toEqual([
      ["attr", '"nome"'],
      ["string", '"Pixel"'],
    ]);
  });

  it("SQL ignora caixa", () => {
    expect(tipos("select 1", "sql")[0]).toEqual(["keyword", "select"]);
  });

  it("diff pinta a linha inteira", () => {
    expect(tipos("+ a\n- b", "diff")).toEqual([
      ["addition", "+ a\n"],
      ["deletion", "- b"],
    ]);
  });

  it("HTML: tag, atributo e valor", () => {
    expect(tipos('<a href="x">', "html")).toEqual([
      ["name", "a"],
      ["attr", "href"],
      ["string", '"x"'],
    ]);
  });
});
