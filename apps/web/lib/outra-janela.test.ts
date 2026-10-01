/**
 * As checagens de realm da janela solta, sem DOM.
 *
 * O ponto de cada caso é o que o `instanceof` erraria: um nó criado noutra
 * janela tem o `Node` dela no protótipo, e só o `nodeType` é igual nas duas.
 * Os objetos falsos aqui são exatamente isso — nós "de outro realm".
 */
import { describe, expect, it } from "vitest";
import { ehElementoHtml, ehNo, janelaDe } from "@/lib/outra-janela";

const janelaSolta = { nome: "solta" } as unknown as Window;
const docSolto = { nodeType: 9, defaultView: janelaSolta } as unknown as Document;
const divSolta = {
  nodeType: 1,
  ownerDocument: docSolto,
  focus: () => {},
} as unknown as HTMLElement;
const textoSolto = { nodeType: 3, ownerDocument: docSolto } as unknown as Node;

describe("janelaDe", () => {
  it("devolve a janela dona do elemento", () => {
    expect(janelaDe(divSolta)).toBe(janelaSolta);
  });

  it("aceita o próprio documento", () => {
    expect(janelaDe(docSolto)).toBe(janelaSolta);
  });

  it("sem nó, ou com documento já sem janela, cai na principal", () => {
    expect(janelaDe(null)).toBe(window);
    expect(janelaDe(undefined)).toBe(window);
    const docFechado = { nodeType: 9, defaultView: null } as unknown as Document;
    expect(janelaDe(docFechado)).toBe(window);
  });
});

describe("ehNo / ehElementoHtml", () => {
  it("reconhece nó de outra janela pelo nodeType", () => {
    expect(ehNo(divSolta)).toBe(true);
    expect(ehNo(textoSolto)).toBe(true);
    expect(ehElementoHtml(divSolta)).toBe(true);
  });

  it("texto é nó mas não elemento", () => {
    expect(ehElementoHtml(textoSolto)).toBe(false);
  });

  it("recusa o que não é nó", () => {
    for (const x of [null, undefined, 1, "div", {}, { nodeType: "1" }]) {
      expect(ehNo(x)).toBe(false);
      expect(ehElementoHtml(x)).toBe(false);
    }
  });
});
