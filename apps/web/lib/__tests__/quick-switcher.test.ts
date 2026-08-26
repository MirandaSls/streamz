import { describe, expect, it } from "vitest";
import { normalize, parseQuery, rank, score, type QuickItem } from "@/lib/quick-switcher";

const itens: QuickItem[] = [
  { id: "c1", kind: "channel", label: "geral" },
  { id: "c2", kind: "channel", label: "general-chat" },
  { id: "c3", kind: "channel", label: "off-topic" },
  { id: "d1", kind: "dm", label: "Gerson" },
  { id: "g1", kind: "guild", label: "Gambiarras" },
];

describe("parseQuery", () => {
  it("separa o prefixo do texto", () => {
    expect(parseQuery("#ger")).toEqual({ kind: "channel", text: "ger" });
    expect(parseQuery("@ana")).toEqual({ kind: "dm", text: "ana" });
    expect(parseQuery("*gamb")).toEqual({ kind: "guild", text: "gamb" });
  });

  it("sem prefixo busca em tudo", () => {
    expect(parseQuery("ger")).toEqual({ kind: null, text: "ger" });
  });

  it("normaliza acento e caixa", () => {
    expect(parseQuery("  Gerál ")).toEqual({ kind: null, text: "gerál".normalize("NFD").replace(/[\u0300-\u036f]/g, "") });
    expect(normalize("Ação")).toBe("acao");
  });
});

describe("score", () => {
  it("prefixo ganha de meio de palavra", () => {
    expect(score("geral", "ger")!).toBeGreaterThan(score("off-geral", "ger")!);
  });

  it("começo de palavra ganha de 'contém'", () => {
    expect(score("off-topic", "top")!).toBeGreaterThan(score("photography", "top")!);
  });

  it("subsequência casa por último", () => {
    const sub = score("geral", "gl")!;
    expect(sub).not.toBeNull();
    expect(sub).toBeLessThan(score("geral", "ger")!);
  });

  it("devolve null quando não casa", () => {
    expect(score("geral", "xyz")).toBeNull();
  });
});

describe("rank", () => {
  it("ordena por relevância — prefixo primeiro, o mais curto na frente", () => {
    expect(rank(itens, "ger").map((i) => i.id)).toEqual(["c1", "d1", "c2"]);
  });

  it("o prefixo filtra o tipo", () => {
    expect(rank(itens, "@ger").map((i) => i.id)).toEqual(["d1"]);
    expect(rank(itens, "*gam").map((i) => i.id)).toEqual(["g1"]);
  });

  it("busca vazia devolve os recentes, na ordem dada", () => {
    expect(rank(itens, "", { recentes: ["g1", "c3"] }).map((i) => i.id)).toEqual(["g1", "c3"]);
  });

  it("sem recentes, a busca vazia devolve o começo da lista", () => {
    expect(rank(itens, "", { limit: 2 }).map((i) => i.id)).toEqual(["c1", "c2"]);
  });

  it("respeita o limite", () => {
    expect(rank(itens, "ge", { limit: 1 })).toHaveLength(1);
  });

  it("desempate: canal antes de conversa antes de servidor", () => {
    const iguais: QuickItem[] = [
      { id: "g", kind: "guild", label: "eco" },
      { id: "d", kind: "dm", label: "eco" },
      { id: "c", kind: "channel", label: "eco" },
    ];
    expect(rank(iguais, "eco").map((i) => i.id)).toEqual(["c", "d", "g"]);
  });
});
