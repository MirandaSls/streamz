import { describe, expect, it } from "vitest";
import type { LinhaDeEmojiPersonalizado } from "../tipos";
import { emojiParaDiscord, lerEmojiDaRota, tokenDoPersonalizado } from "./emoji";

/**
 * A tradução do emoji, nos dois sentidos.
 *
 * O que estes testes prendem é o que quebra bot de "reaction roles": o `id`
 * `null` que diz "isto é unicode", o snowflake que diz "isto é um emoji do
 * servidor", e o fato de o token interno (`<:nome:cuid>`) **nunca** vazar para
 * o bot — nem como nome, nem como id.
 */

const festa: LinhaDeEmojiPersonalizado = {
  id: "cm1xemoji000000000000000",
  snowflake: 141414141414141414n,
  name: "festa",
  animated: true,
};

describe("emojiParaDiscord", () => {
  it("unicode sai com `id: null` e o caractere no `name`", () => {
    expect(emojiParaDiscord("👍", null)).toEqual({ id: null, name: "👍", animated: false });
  });

  it("personalizado sai com o snowflake, o nome e o `animated` da linha", () => {
    expect(emojiParaDiscord("<:festa:cm1xemoji000000000000000>", festa)).toEqual({
      id: "141414141414141414",
      name: "festa",
      animated: true,
    });
  });

  it("o cuid nunca vaza: nem no `id`, nem no `name`", () => {
    const saida = emojiParaDiscord("<:festa:cm1xemoji000000000000000>", festa);
    expect(JSON.stringify(saida)).not.toContain("cm1xemoji");
  });

  it("emoji personalizado já apagado sai só com o nome (o Discord faz igual)", () => {
    expect(emojiParaDiscord("<:sumiu:cm1xemoji000000000000000>", null)).toEqual({
      id: null,
      name: "sumiu",
      animated: false,
    });
  });
});

describe("lerEmojiDaRota", () => {
  it("unicode vem percent-encoded", () => {
    expect(lerEmojiDaRota("%F0%9F%91%8D")).toEqual({ tipo: "unicode", token: "👍" });
  });

  it("unicode já decodificado pelo Express passa igual", () => {
    expect(lerEmojiDaRota("👍")).toEqual({ tipo: "unicode", token: "👍" });
  });

  it("personalizado vem como `nome:snowflake`", () => {
    expect(lerEmojiDaRota("festa%3A141414141414141414")).toEqual({
      tipo: "personalizado",
      nome: "festa",
      snowflake: "141414141414141414",
    });
  });

  it("aceita as formas `<:nome:id>` e `<a:nome:id>` que algumas libs mandam", () => {
    expect(lerEmojiDaRota("<:festa:141414141414141414>")).toEqual({
      tipo: "personalizado",
      nome: "festa",
      snowflake: "141414141414141414",
    });
    expect(lerEmojiDaRota("<a:festa:141414141414141414>")).toEqual({
      tipo: "personalizado",
      nome: "festa",
      snowflake: "141414141414141414",
    });
  });

  it("percent-encoding quebrado não derruba a rota", () => {
    expect(lerEmojiDaRota("%E0%A4%A")).toEqual({ tipo: "unicode", token: "%E0%A4%A" });
  });
});

describe("tokenDoPersonalizado", () => {
  it("monta o token interno com o cuid, não com o snowflake", () => {
    expect(tokenDoPersonalizado(festa)).toBe("<:festa:cm1xemoji000000000000000>");
  });
});
