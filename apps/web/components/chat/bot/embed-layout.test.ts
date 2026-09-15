import { describe, expect, it } from "vitest";
import { FLAGS_DE_MENSAGEM, type Attachment, type Embed } from "@streamz/shared";
import {
  anexosVisiveis,
  colunasDosCampos,
  corDaBarra,
  embedsSuprimidos,
  embedsVisiveis,
  ehComponentsV2,
  estaPensando,
  hrefSeguro,
  tamanhoQueCabe,
  IMAGEM_MAXIMA,
  THUMBNAIL_MAXIMA,
} from "./embed-layout";

/**
 * ── onda 3 ── As regras de dado do embed rico (cartão 3b).
 *
 * O que estes testes protegem:
 *
 * 1. **A grade de campos do Discord**: até 3 inline por linha, 2 com thumbnail,
 *    e um campo não inline quebra a sequência.
 * 2. **As flags que escondem coisa**: v2 não tem embed nem anexo solto,
 *    "pensando" não tem embed, `SUPPRESS_EMBEDS` (flag ou coluna) não tem embed.
 * 3. **O anexo usado pelo embed não aparece duas vezes.**
 */

const inline = { inline: true };
const cheio = { inline: false };

describe("colunasDosCampos", () => {
  it("três inline dividem a linha em terços", () => {
    expect(colunasDosCampos([inline, inline, inline], false)).toEqual(["1 / 5", "5 / 9", "9 / 13"]);
  });

  it("o quarto inline abre outra linha", () => {
    expect(colunasDosCampos([inline, inline, inline, inline], false)).toEqual([
      "1 / 5",
      "5 / 9",
      "9 / 13",
      "1 / 13",
    ]);
  });

  it("com thumbnail cabem só dois por linha", () => {
    expect(colunasDosCampos([inline, inline, inline], true)).toEqual(["1 / 7", "7 / 13", "1 / 13"]);
  });

  it("campo não inline ocupa a linha e quebra a sequência", () => {
    expect(colunasDosCampos([inline, inline, cheio, inline], false)).toEqual([
      "1 / 7",
      "7 / 13",
      "1 / 13",
      "1 / 13",
    ]);
  });

  it("a semente do #bots: 3 inline + 1 não inline", () => {
    expect(colunasDosCampos([inline, inline, inline, cheio], true)).toEqual([
      "1 / 7",
      "7 / 13",
      "1 / 13",
      "1 / 13",
    ]);
  });

  it("sem campos, sem colunas", () => {
    expect(colunasDosCampos([], false)).toEqual([]);
  });
});

describe("corDaBarra", () => {
  it("inteiro RGB vira #rrggbb com zeros à esquerda", () => {
    expect(corDaBarra(0x5865f2)).toBe("#5865f2");
    expect(corDaBarra(0x00ff00)).toBe("#00ff00");
  });

  it("0 é preto, não ausência de cor", () => {
    expect(corDaBarra(0)).toBe("#000000");
  });

  it("sem cor (ou fora da faixa) cai no token padrão", () => {
    expect(corDaBarra(undefined)).toBeNull();
    expect(corDaBarra(null)).toBeNull();
    expect(corDaBarra(0x1000000)).toBeNull();
    expect(corDaBarra(-1)).toBeNull();
    expect(corDaBarra(1.5)).toBeNull();
  });
});

describe("tamanhoQueCabe", () => {
  it("imagem menor que o teto fica do tamanho dela", () => {
    expect(tamanhoQueCabe(200, 100, IMAGEM_MAXIMA)).toEqual({ largura: 200, altura: 100 });
  });

  it("imagem larga encolhe pela largura, sem distorcer", () => {
    expect(tamanhoQueCabe(1200, 630, IMAGEM_MAXIMA)).toEqual({ largura: 400, altura: 210 });
  });

  it("imagem em pé encolhe pela altura", () => {
    expect(tamanhoQueCabe(600, 1200, IMAGEM_MAXIMA)).toEqual({ largura: 150, altura: 300 });
  });

  it("thumbnail quadrada cabe no quadrado", () => {
    expect(tamanhoQueCabe(512, 512, THUMBNAIL_MAXIMA)).toEqual({ largura: 80, altura: 80 });
  });

  it("sem dimensões não inventa tamanho", () => {
    expect(tamanhoQueCabe(null, 100, IMAGEM_MAXIMA)).toBeNull();
    expect(tamanhoQueCabe(100, undefined, IMAGEM_MAXIMA)).toBeNull();
    expect(tamanhoQueCabe(0, 0, IMAGEM_MAXIMA)).toBeNull();
  });
});

const anexo = (over: Partial<Attachment> = {}): Attachment => ({
  id: "a1",
  url: "https://cdn/a1/foto.png",
  filename: "foto.png",
  contentType: "image/png",
  size: 10,
  width: 10,
  height: 10,
  ...over,
});

const embed = (over: Partial<Embed> = {}): Embed => ({ type: "rich", title: "Oi", ...over });

describe("flags da mensagem", () => {
  it("lê v2 e pensando pelos bits", () => {
    expect(ehComponentsV2({ flags: FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2 })).toBe(true);
    expect(ehComponentsV2({ flags: 0 })).toBe(false);
    expect(ehComponentsV2({})).toBe(false);
    expect(estaPensando({ flags: FLAGS_DE_MENSAGEM.LOADING })).toBe(true);
    expect(estaPensando({ flags: FLAGS_DE_MENSAGEM.SUPPRESS_NOTIFICATIONS })).toBe(false);
  });

  it("suprimir vale pela flag ou pela coluna", () => {
    expect(embedsSuprimidos({ suppressEmbeds: true, flags: 0 })).toBe(true);
    expect(embedsSuprimidos({ suppressEmbeds: false, flags: FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS })).toBe(true);
    expect(embedsSuprimidos({ suppressEmbeds: false })).toBe(false);
  });
});

describe("embedsVisiveis", () => {
  const base = { suppressEmbeds: false, flags: 0, embeds: [embed(), embed({ title: "Dois" })] };

  it("desenha todos, na ordem", () => {
    expect(embedsVisiveis(base).map((e) => e.title)).toEqual(["Oi", "Dois"]);
  });

  it("payload antigo sem `embeds` não quebra", () => {
    expect(embedsVisiveis({ suppressEmbeds: false })).toEqual([]);
  });

  it("some com SUPPRESS_EMBEDS, em v2 e pensando", () => {
    expect(embedsVisiveis({ ...base, suppressEmbeds: true })).toEqual([]);
    expect(embedsVisiveis({ ...base, flags: FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2 })).toEqual([]);
    expect(embedsVisiveis({ ...base, flags: FLAGS_DE_MENSAGEM.LOADING })).toEqual([]);
  });
});

describe("anexosVisiveis", () => {
  it("mensagem comum mostra todos os anexos", () => {
    const m = { suppressEmbeds: false, flags: 0, embeds: [], attachments: [anexo()] };
    expect(anexosVisiveis(m)).toHaveLength(1);
  });

  it("v2 não mostra anexo solto (o componente é quem desenha)", () => {
    const m = {
      suppressEmbeds: false,
      flags: FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2,
      embeds: [],
      attachments: [anexo()],
    };
    expect(anexosVisiveis(m)).toEqual([]);
  });

  it("o anexo que virou imagem do embed não aparece de novo", () => {
    const usado = anexo();
    const solto = anexo({ id: "a2", url: "https://cdn/a2/relatorio.pdf", filename: "relatorio.pdf" });
    const m = {
      suppressEmbeds: false,
      flags: 0,
      embeds: [embed({ image: { url: usado.url } })],
      attachments: [usado, solto],
    };
    expect(anexosVisiveis(m).map((a) => a.id)).toEqual(["a2"]);
  });

  it("referência ainda em attachment:// também conta", () => {
    const m = {
      suppressEmbeds: false,
      flags: 0,
      embeds: [embed({ thumbnail: { url: "attachment://foto.png" } })],
      attachments: [anexo()],
    };
    expect(anexosVisiveis(m)).toEqual([]);
  });

  it("com o embed suprimido, o anexo volta a aparecer", () => {
    const usado = anexo();
    const m = {
      suppressEmbeds: true,
      flags: 0,
      embeds: [embed({ image: { url: usado.url } })],
      attachments: [usado],
    };
    expect(anexosVisiveis(m)).toHaveLength(1);
  });
});

describe("hrefSeguro", () => {
  it("aceita http e https", () => {
    expect(hrefSeguro("https://streamz.chat/x")).toBe("https://streamz.chat/x");
    expect(hrefSeguro("http://exemplo.com")).toBe("http://exemplo.com/");
  });

  it("recusa esquema que executa ou embute, e texto que não é URL", () => {
    expect(hrefSeguro("javascript:alert(1)")).toBeNull();
    expect(hrefSeguro("data:text/html,oi")).toBeNull();
    expect(hrefSeguro("attachment://foto.png")).toBeNull();
    expect(hrefSeguro("não é url")).toBeNull();
    expect(hrefSeguro(undefined)).toBeNull();
  });
});
