import { describe, expect, it } from "vitest";
import { achatarEmbeds } from "./embed";

/**
 * O achatamento do embed. Puro, e a razão de ele existir está no arquivo: no
 * Discord uma mensagem só com `embeds` é válida, e o Streamz não tem embed
 * rico — se não achatarmos, o humano do outro lado vê uma linha em branco.
 */
describe("achatarEmbeds", () => {
  it("põe título, descrição, campos e rodapé na ordem em que o Discord desenha", () => {
    expect(
      achatarEmbeds([
        {
          title: "Nível 5",
          description: "Parabéns!",
          fields: [
            { name: "XP", value: "1200" },
            { name: "Posição", value: "3º" },
          ],
          footer: { text: "bot de níveis" },
        },
      ]),
    ).toBe("**Nível 5**\nParabéns!\n**XP**: 1200\n**Posição**: 3º\nbot de níveis");
  });

  it("título com `url` vira link markdown — o composer do Streamz já o entende", () => {
    expect(achatarEmbeds([{ title: "Ouvir", url: "https://exemplo.invalido/x" }])).toBe(
      "[Ouvir](https://exemplo.invalido/x)",
    );
  });

  it("a imagem sai como URL, para o preview de link mostrá-la", () => {
    expect(achatarEmbeds([{ image: { url: "https://exemplo.invalido/a.png" } }])).toBe(
      "https://exemplo.invalido/a.png",
    );
  });

  it("embed vazio, nulo ou que não é objeto não vira texto nenhum", () => {
    expect(achatarEmbeds([{}, null, "isto não é embed", 7])).toBe("");
  });

  it("corta no teto da mensagem em vez de deixar o banco recusar", () => {
    const gigante = achatarEmbeds([{ description: "a".repeat(5000) }]);
    expect(gigante.length).toBe(2000);
  });
});
