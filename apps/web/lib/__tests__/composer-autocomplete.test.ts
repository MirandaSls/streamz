import { describe, expect, it } from "vitest";
import { aplicarEscolha, detectarGatilho, mover } from "../composer-autocomplete";
import { buscarComandos, interpretarComando, separarComando } from "../comandos-barra";
import { buscarEmojisUnicode } from "../emojis-unicode";

/** Atalho: detecta com o cursor no fim do texto (o caso normal ao digitar). */
function no(texto: string) {
  return detectarGatilho(texto, texto.length);
}

describe("detectarGatilho", () => {
  it("abre no `:` só depois de duas letras", () => {
    expect(no("oi :f")).toBeNull();
    expect(no("oi :fe")).toMatchObject({ tipo: ":", termo: "fe", inicio: 3 });
  });

  it("abre no `@` já no primeiro caractere", () => {
    expect(no("@")).toMatchObject({ tipo: "@", termo: "" });
    expect(no("fala @ana")).toMatchObject({ tipo: "@", termo: "ana", inicio: 5 });
  });

  it("abre no `#` para canal", () => {
    expect(no("vai pro #ger")).toMatchObject({ tipo: "#", termo: "ger" });
  });

  it("`/` só vale no começo da mensagem", () => {
    expect(no("/shr")).toMatchObject({ tipo: "/", termo: "shr" });
    expect(no("caminho /usr")).toBeNull();
  });

  it("não abre no meio de uma palavra", () => {
    expect(no("email@dominio")).toBeNull();
    expect(no("10:30:00")).toBeNull();
  });

  it("espaço encerra o termo", () => {
    expect(no("@ana beleza")).toBeNull();
    expect(no(":festa: e mais")).toBeNull();
  });

  it("respeita a posição do cursor, não o fim do texto", () => {
    const texto = "@an resto";
    expect(detectarGatilho(texto, 3)).toMatchObject({ tipo: "@", termo: "an" });
    expect(detectarGatilho(texto, 9)).toBeNull();
  });

  it("pega o gatilho mais recente quando há vários", () => {
    expect(no("@ana olha :fes")).toMatchObject({ tipo: ":", termo: "fes" });
  });
});

describe("aplicarEscolha", () => {
  it("troca o trecho e deixa o cursor depois do espaço", () => {
    const texto = "fala @an";
    const g = detectarGatilho(texto, texto.length)!;
    const r = aplicarEscolha(texto, g, "@ana");
    expect(r.texto).toBe("fala @ana ");
    expect(r.caret).toBe(10);
  });

  it("não duplica o espaço quando já existe um depois", () => {
    const texto = "fala @an tudo bem";
    const g = detectarGatilho(texto, 8)!;
    const r = aplicarEscolha(texto, g, "@ana");
    expect(r.texto).toBe("fala @ana tudo bem");
  });

  it("preserva o que vinha antes do gatilho", () => {
    const texto = "bom dia :fes";
    const g = detectarGatilho(texto, texto.length)!;
    expect(aplicarEscolha(texto, g, ":festa:").texto).toBe("bom dia :festa: ");
  });
});

describe("mover", () => {
  it("circula nas duas pontas", () => {
    expect(mover(0, -1, 3)).toBe(2);
    expect(mover(2, 1, 3)).toBe(0);
    expect(mover(0, 1, 0)).toBe(0);
  });
});

describe("comandos de barra", () => {
  it("separa nome e argumento", () => {
    expect(separarComando("/me dança")).toEqual({ nome: "me", argumento: "dança" });
    expect(separarComando("/shrug")).toEqual({ nome: "shrug", argumento: "" });
    expect(separarComando("oi /me")).toBeNull();
  });

  it("/shrug acrescenta o sufixo ao que foi escrito", () => {
    expect(interpretarComando("/shrug deu ruim")).toEqual({
      tipo: "enviar",
      content: "deu ruim ¯\\_(ツ)_/¯",
    });
    expect(interpretarComando("/shrug")).toEqual({ tipo: "enviar", content: "¯\\_(ツ)_/¯" });
  });

  it("/me vira itálico e /spoiler embrulha tudo", () => {
    expect(interpretarComando("/me chegou")).toEqual({ tipo: "enviar", content: "*chegou*" });
    expect(interpretarComando("/spoiler ele morre")).toEqual({
      tipo: "enviar",
      content: "||ele morre||",
    });
  });

  it("/giphy abre o seletor com o termo", () => {
    expect(interpretarComando("/giphy gato")).toEqual({ tipo: "gif", termo: "gato" });
  });

  it("texto comum não é comando", () => {
    expect(interpretarComando("bom dia")).toEqual({ tipo: "nenhum" });
    expect(interpretarComando("2/3 do total")).toEqual({ tipo: "nenhum" });
  });

  it("comando inexistente é reportado, não enviado às cegas", () => {
    expect(interpretarComando("/xyz")).toEqual({ tipo: "desconhecido", nome: "xyz" });
  });

  it("busca por prefixo", () => {
    expect(buscarComandos("s").map((c) => c.nome)).toEqual(["shrug", "spoiler"]);
    expect(buscarComandos("").length).toBeGreaterThan(4);
  });
});

describe("buscarEmojisUnicode", () => {
  it("prefixo vem antes de quem só contém o termo", () => {
    const r = buscarEmojisUnicode("fire");
    expect(r[0]?.nome).toBe("fire");
  });

  it("encontra por palavra em português", () => {
    expect(buscarEmojisUnicode("foguete").map((e) => e.nome)).toContain("rocket");
  });

  it("respeita o limite", () => {
    expect(buscarEmojisUnicode("", 3)).toHaveLength(3);
  });
});
