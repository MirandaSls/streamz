/**
 * As regras das entradas do canal no celular que não aparecem olhando a tela:
 * a pilha que o voltar desfaz uma camada por vez, a consulta com que a busca
 * nasce e a dedução do erro de uma busca que a store não expõe.
 */
import { describe, expect, it } from "vitest";
import {
  ABAS_DO_CANAL,
  consultaInicialDaBusca,
  desempilharEntrada,
  desfechoDaBusca,
  empilharEntrada,
  filtrosDaBusca,
  inserirFiltro,
  rotuloDoTipoDeCanal,
} from "./navegacao";

describe("empilharEntrada", () => {
  it("empilha por cima", () => {
    expect(empilharEntrada([], "detalhes")).toEqual(["detalhes"]);
    expect(empilharEntrada(["detalhes"], "busca")).toEqual(["detalhes", "busca"]);
  });

  it("repetir o topo não empilha de novo", () => {
    expect(empilharEntrada(["busca"], "busca")).toEqual(["busca"]);
  });

  it("pedir uma entrada que já está embaixo volta até ela, sem laço", () => {
    expect(empilharEntrada(["detalhes", "busca"], "detalhes")).toEqual(["detalhes"]);
  });

  it("não muda a pilha recebida", () => {
    const pilha = Object.freeze(["detalhes"]) as readonly ("detalhes" | "busca")[];
    empilharEntrada(pilha, "busca");
    expect(pilha).toEqual(["detalhes"]);
  });
});

describe("desempilharEntrada", () => {
  it("desfaz só a camada de cima", () => {
    expect(desempilharEntrada(["detalhes", "busca"])).toEqual(["detalhes"]);
    expect(desempilharEntrada(["detalhes"])).toEqual([]);
  });

  it("pilha vazia continua vazia", () => {
    expect(desempilharEntrada([])).toEqual([]);
  });
});

describe("consultaInicialDaBusca", () => {
  it("num canal de servidor nasce com o filtro do canal colado ao prefixo", () => {
    expect(consultaInicialDaBusca("geral", true)).toBe("em:geral ");
  });

  it("numa conversa direta nasce vazia", () => {
    expect(consultaInicialDaBusca("Pati", false)).toBe("");
  });

  it("nome vazio ou com espaço não vira filtro quebrado", () => {
    expect(consultaInicialDaBusca(null, true)).toBe("");
    expect(consultaInicialDaBusca("   ", true)).toBe("");
    expect(consultaInicialDaBusca("sala de estar", true)).toBe("");
  });
});

describe("inserirFiltro", () => {
  it("campo vazio recebe só o prefixo", () => {
    expect(inserirFiltro("", "de:")).toBe("de:");
  });

  it("texto existente ganha um espaço antes e nenhum depois", () => {
    expect(inserirFiltro("em:geral ", "tem:")).toBe("em:geral tem:");
    expect(inserirFiltro("bolo", "antes:")).toBe("bolo antes:");
  });
});

describe("filtrosDaBusca", () => {
  it("segue a ordem do celular: pessoa, menção, dado, canal e as datas", () => {
    expect(filtrosDaBusca(true).map((f) => f.prefixo)).toEqual([
      "de:",
      "menciona:",
      "tem:",
      "em:",
      "durante:",
      "antes:",
      "depois:",
    ]);
  });

  it("sem servidor não oferece o filtro de canal", () => {
    expect(filtrosDaBusca(false).some((f) => f.prefixo === "em:")).toBe(false);
  });
});

describe("desfechoDaBusca", () => {
  const velhos = [{ id: "1" }];

  it("resultados novos são sucesso, mesmo vazios", () => {
    expect(desfechoDaBusca({ searching: false, searchResults: null }, { searching: false, searchResults: [] })).toBe("ok");
    expect(
      desfechoDaBusca({ searching: false, searchResults: velhos }, { searching: false, searchResults: [{ id: "2" }] }),
    ).toBe("ok");
  });

  it("resultados com a mesma identidade de antes são erro", () => {
    expect(desfechoDaBusca({ searching: false, searchResults: null }, { searching: false, searchResults: null })).toBe(
      "erro",
    );
    expect(
      desfechoDaBusca({ searching: false, searchResults: velhos }, { searching: false, searchResults: velhos }),
    ).toBe("erro");
  });

  it("outra busca ainda em voo decide por esta", () => {
    expect(desfechoDaBusca({ searching: false, searchResults: null }, { searching: true, searchResults: null })).toBe(
      "substituida",
    );
  });
});

describe("rotuloDoTipoDeCanal", () => {
  it("nomeia o tipo como a segunda linha do cartão do canal", () => {
    expect(rotuloDoTipoDeCanal({ type: "TEXT" })).toBe("Canal de texto");
    expect(rotuloDoTipoDeCanal({ type: "VOICE" })).toBe("Canal de voz");
    expect(rotuloDoTipoDeCanal({ type: "ANNOUNCEMENT" })).toBe("Canal de anúncios");
    expect(rotuloDoTipoDeCanal({ type: "TEXT", readOnly: true })).toBe("Canal de anúncios");
  });
});

describe("ABAS_DO_CANAL", () => {
  it("só as abas que o Streamz sabe preencher, na ordem do Discord", () => {
    expect(ABAS_DO_CANAL.map((a) => a.valor)).toEqual(["membros", "fixadas", "threads"]);
  });
});
