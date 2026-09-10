import { describe, expect, it } from "vitest";
import {
  LARGURA_DA_BARRA,
  analisarAlvo,
  barraDeProgresso,
  escaparMarkdown,
  formatarNumero,
  medalha,
  mencaoDoUsuario,
  textoDaSubida,
  truncar,
} from "./formatar";

describe("barraDeProgresso", () => {
  it("tem sempre a largura pedida, fração qualquer", () => {
    for (const f of [-1, 0, 0.01, 0.5, 0.99, 1, 2, Number.NaN]) {
      expect([...barraDeProgresso(f, 12)].length).toBe(12);
    }
  });

  it("vazia e cheia são reconhecíveis", () => {
    expect(barraDeProgresso(0, 4)).toBe("▱▱▱▱");
    expect(barraDeProgresso(1, 4)).toBe("▰▰▰▰");
    expect(barraDeProgresso(0.5, 4)).toBe("▰▰▱▱");
  });

  it("a largura padrão é a documentada", () => {
    expect([...barraDeProgresso(0.5)].length).toBe(LARGURA_DA_BARRA);
  });
});

describe("formatarNumero", () => {
  it("separa o milhar", () => {
    expect(formatarNumero(1204)).toBe("1.204");
    expect(formatarNumero(999)).toBe("999");
    expect(formatarNumero(1_234_567)).toBe("1.234.567");
  });
  it("lixo vira zero em vez de NaN na tela", () => {
    expect(formatarNumero(Number.NaN)).toBe("0");
  });
});

describe("medalha", () => {
  it("dá medalha ao pódio e número ao resto", () => {
    expect(medalha(1)).toBe("🥇");
    expect(medalha(3)).toBe("🥉");
    expect(medalha(4)).toContain("#");
  });
});

describe("escaparMarkdown", () => {
  it("desarma negrito e link de um apelido escolhido pela pessoa", () => {
    expect(escaparMarkdown("**mods**")).toBe("\\*\\*mods\\*\\*");
    expect(escaparMarkdown("[clique](http://x)")).toBe("\\[clique\\]\\(http://x\\)");
  });
});

describe("truncar", () => {
  it("corta no tamanho pedido, contando caracteres", () => {
    expect(truncar("abcdefghij", 5)).toBe("abcd…");
    expect([...truncar("ãéíõúçãéíõú", 5)].length).toBe(5);
  });
});

describe("analisarAlvo", () => {
  it("entende as menções do Discord", () => {
    expect(analisarAlvo("<@123456789>")).toEqual({ tipo: "id", valor: "123456789" });
    expect(analisarAlvo("<@!123456789>")).toEqual({ tipo: "id", valor: "123456789" });
    expect(analisarAlvo("<@&987654321>")).toEqual({ tipo: "id", valor: "987654321" });
    expect(analisarAlvo("<#111112222>")).toEqual({ tipo: "id", valor: "111112222" });
  });

  it("entende o snowflake e o cuid crus", () => {
    expect(analisarAlvo("400090000000000123")).toEqual({ tipo: "id", valor: "400090000000000123" });
    expect(analisarAlvo("ckx9v0z1a0000qwertyuiop12")).toMatchObject({ tipo: "id" });
  });

  it("o que não é id é nome, com o @ e o # jogados fora", () => {
    expect(analisarAlvo("@fulano")).toEqual({ tipo: "nome", valor: "fulano" });
    expect(analisarAlvo("Nível 5")).toEqual({ tipo: "nome", valor: "Nível 5" });
    expect(analisarAlvo("#geral")).toEqual({ tipo: "nome", valor: "geral" });
  });

  it("vazio é vazio", () => {
    expect(analisarAlvo(null)).toBe(null);
    expect(analisarAlvo("   ")).toBe(null);
    expect(analisarAlvo("@")).toBe(null);
  });

  it("um número curto é nome, não id — gente se chama `12345`", () => {
    expect(analisarAlvo("1234")).toEqual({ tipo: "nome", valor: "1234" });
  });
});

describe("textoDaSubida", () => {
  it("diz o nível e não grita com o canal", () => {
    const t = textoDaSubida("**ana**", 5);
    expect(t).toContain("nível 5");
    expect(t).not.toContain("@everyone");
    expect(t).not.toContain("@here");
  });
});

describe("mencaoDoUsuario", () => {
  it("usa o formato do Streamz (`@usuario`), não o `<@id>` do Discord", () => {
    // É `mentionsUser` do @streamz/shared que decide quem foi mencionado, e ele
    // procura `@username` em texto puro. Um `<@snowflake>` sairia cru na tela.
    expect(mencaoDoUsuario("ana.souza")).toBe("@ana.souza");
    expect(mencaoDoUsuario("ana")).not.toContain("<@");
  });
});
