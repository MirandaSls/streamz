import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, SPOILER_PREFIX } from "@streamz/shared";
import {
  colagemPassaDoLimite,
  ehTextoPrevisualizavel,
  LINHAS_DA_PREVIA_RECOLHIDA,
  NOME_DO_TEXTO_LONGO,
  passaDoLimite,
  recortarPrevia,
  textoComoArquivo,
} from "./texto-longo";

describe("passaDoLimite", () => {
  it("exatamente no limite não passa", () => {
    expect(passaDoLimite("x".repeat(MAX_MESSAGE_LENGTH))).toBe(false);
  });

  it("um a mais já passa", () => {
    expect(passaDoLimite("x".repeat(MAX_MESSAGE_LENGTH + 1))).toBe(true);
  });

  it("respeita um limite customizado", () => {
    expect(passaDoLimite("abcde", 5)).toBe(false);
    expect(passaDoLimite("abcdef", 5)).toBe(true);
  });
});

describe("colagemPassaDoLimite", () => {
  it("colar substituindo a seleção inteira fica dentro do limite", () => {
    // "abcXXXdef" colando "YY" no lugar de "XXX" (índices 3 a 6) -> "abcYYdef"
    expect(colagemPassaDoLimite("abcXXXdef", "YY", 3, 6, 20)).toBe(false);
  });

  it("colar um texto grande no lugar da seleção estoura o limite", () => {
    const atual = "abcXXXdef";
    const colado = "y".repeat(20);
    expect(colagemPassaDoLimite(atual, colado, 3, 6, 10)).toBe(true);
  });

  it("no limite exato não passa, um a mais passa", () => {
    const atual = "";
    const noLimite = "z".repeat(MAX_MESSAGE_LENGTH);
    const acimaDoLimite = "z".repeat(MAX_MESSAGE_LENGTH + 1);
    expect(colagemPassaDoLimite(atual, noLimite, 0, 0)).toBe(false);
    expect(colagemPassaDoLimite(atual, acimaDoLimite, 0, 0)).toBe(true);
  });
});

describe("textoComoArquivo", () => {
  it("produz nome, tipo e conteúdo certos", async () => {
    const texto = "conteúdo bem longo que virou anexo";
    const arquivo = textoComoArquivo(texto);
    expect(arquivo.name).toBe(NOME_DO_TEXTO_LONGO);
    expect(arquivo.type).toBe("text/plain;charset=utf-8");
    expect(await arquivo.text()).toBe(texto);
  });
});

describe("ehTextoPrevisualizavel", () => {
  it("extensão conhecida em minúscula", () => {
    expect(ehTextoPrevisualizavel({ filename: "log.txt", size: 10 })).toBe(true);
  });

  it("extensão em caixa alta também conta", () => {
    expect(ehTextoPrevisualizavel({ filename: "RELATORIO.MD", size: 10 })).toBe(true);
  });

  it("ignora o prefixo de spoiler para achar a extensão", () => {
    expect(
      ehTextoPrevisualizavel({ filename: `${SPOILER_PREFIX}nota.ts`, size: 10 }),
    ).toBe(true);
  });

  it("extensão desconhecida não prevê", () => {
    expect(ehTextoPrevisualizavel({ filename: "arquivo.zip", size: 10 })).toBe(false);
  });

  it("sem extensão não prevê", () => {
    expect(ehTextoPrevisualizavel({ filename: "semextensao", size: 10 })).toBe(false);
  });

  it("tamanho zero ou negativo é anexo externo — nunca prevê", () => {
    expect(ehTextoPrevisualizavel({ filename: "nota.txt", size: 0 })).toBe(false);
    expect(ehTextoPrevisualizavel({ filename: "nota.txt", size: -1 })).toBe(false);
  });
});

describe("recortarPrevia", () => {
  it("com sobra: corta nas primeiras linhas e avisa", () => {
    const texto = Array.from({ length: 10 }, (_, i) => `linha ${i}`).join("\n");
    const { trecho, cortado } = recortarPrevia(texto, LINHAS_DA_PREVIA_RECOLHIDA);
    expect(trecho).toBe(
      Array.from({ length: LINHAS_DA_PREVIA_RECOLHIDA }, (_, i) => `linha ${i}`).join("\n"),
    );
    expect(cortado).toBe(true);
  });

  it("sem sobra: texto com menos linhas que o teto volta inteiro", () => {
    const texto = "linha 0\nlinha 1";
    const { trecho, cortado } = recortarPrevia(texto, 6);
    expect(trecho).toBe(texto);
    expect(cortado).toBe(false);
  });

  it("sem sobra: exatamente no teto de linhas também não corta", () => {
    const texto = Array.from({ length: 6 }, (_, i) => `linha ${i}`).join("\n");
    const { trecho, cortado } = recortarPrevia(texto, 6);
    expect(trecho).toBe(texto);
    expect(cortado).toBe(false);
  });
});
