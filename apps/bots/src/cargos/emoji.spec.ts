import { describe, expect, it } from "vitest";
import { chaveDoEmoji, lerEmojiDigitado, lerEmojiDoEvento } from "./emoji";

/**
 * A chave do emoji é o ponto de falha silenciosa do bot inteiro: se a chave que
 * sai do texto digitado não bater com a que sai do evento do gateway, o painel
 * é publicado, o bot reage nele, tudo parece certo — e reagir não dá cargo
 * nenhum, sem um erro em lugar nenhum. Por isso o teste central aqui é o de ida
 * e volta.
 */
describe("chave do emoji", () => {
  it("unicode e personalizado não se confundem", () => {
    expect(chaveDoEmoji({ id: null, name: "👍" })).toBe("u:👍");
    expect(chaveDoEmoji({ id: "1414", name: "festa" })).toBe("id:1414");
  });

  it("o personalizado é identificado pelo id, não pelo nome", () => {
    // Renomear o emoji do servidor não pode desligar o painel.
    expect(chaveDoEmoji({ id: "1414", name: "festa" })).toBe(
      chaveDoEmoji({ id: "1414", name: "festa-nova" }),
    );
  });

  it("emoji sem id e sem nome não vira chave", () => {
    expect(chaveDoEmoji({ id: null, name: null })).toBeNull();
  });
});

describe("ida e volta: o que se digita casa com o que o gateway manda", () => {
  it("unicode", () => {
    const digitado = lerEmojiDigitado("🎧")!;
    const doEvento = lerEmojiDoEvento({ id: null, name: "🎧", animated: false })!;
    expect(digitado.chave).toBe(doEvento.chave);
    expect(digitado.paraReagir).toBe("🎧");
  });

  it("personalizado, nas quatro formas em que alguém o cola", () => {
    const doEvento = lerEmojiDoEvento({ id: "1414", name: "festa", animated: false })!;
    for (const forma of ["<:festa:1414>", "<a:festa:1414>", "festa:1414", ":festa:1414"]) {
      expect(lerEmojiDigitado(forma)!.chave, forma).toBe(doEvento.chave);
    }
  });

  it("o `paraReagir` do personalizado é `nome:snowflake` (o que a rota REST aceita)", () => {
    expect(lerEmojiDigitado("<:festa:1414>")!.paraReagir).toBe("festa:1414");
    expect(lerEmojiDoEvento({ id: "1414", name: "festa" })!.paraReagir).toBe("festa:1414");
  });

  it("o animado sai como `<a:…>` no evento e como `<:…>` no digitado", () => {
    // Só o servidor sabe se o emoji é animado; escrever `<a:…>` num estático
    // mostra um quadrado vazio.
    expect(lerEmojiDoEvento({ id: "1414", name: "festa", animated: true })!.exibicao).toBe(
      "<a:festa:1414>",
    );
    expect(lerEmojiDigitado("<a:festa:1414>")!.exibicao).toBe("<:festa:1414>");
  });
});

describe("o que não é emoji é recusado na hora", () => {
  it.each(["", "   ", "banana", ":festa:", "<:festa:>", "cargo", "ABC"])("%j", (texto) => {
    expect(lerEmojiDigitado(texto)).toBeNull();
  });

  it("uma frase inteira não vira emoji", () => {
    expect(lerEmojiDigitado("dá o cargo de streamer pra mim")).toBeNull();
  });

  it("mas as formas compostas de verdade passam", () => {
    // bandeira (dois indicadores regionais), família (ZWJ) e keycap.
    for (const emoji of ["🇧🇷", "👩‍👩‍👦", "1️⃣", "❤️"]) {
      expect(lerEmojiDigitado(emoji), emoji).not.toBeNull();
    }
  });
});
