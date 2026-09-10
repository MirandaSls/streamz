import { describe, expect, it } from "vitest";
import {
  MOTIVO_PADRAO,
  analisarAlvo,
  carimbo,
  chaveDeNome,
  embedDoRegistro,
  embedDosAvisos,
  escaparMarkdown,
  limparMotivo,
  linhaDoRegistro,
  plural,
  textoDoRegistro,
  textoDosAvisos,
  rotuloDaAcao,
  truncar,
  type AcaoDeModeracao,
  type AvisoGuardado,
} from "./formatar";

describe("analisarAlvo", () => {
  it("lê a menção do Discord", () => {
    expect(analisarAlvo("<@123456789012345678>")).toEqual({ tipo: "id", id: "123456789012345678" });
    expect(analisarAlvo("<@!123456789012345678>")).toEqual({ tipo: "id", id: "123456789012345678" });
  });

  it("lê o snowflake colado à mão", () => {
    expect(analisarAlvo("123456789012345678")).toEqual({ tipo: "id", id: "123456789012345678" });
  });

  it("lê o `@fulano` do composer do Streamz, que chega como texto", () => {
    // `traducao/mensagem.ts`: "a F1 não resolve as menções: elas ficam no
    // `content` (`@fulano` em texto puro, não `<@id>`)". Um parser que só
    // entendesse o formato do Discord pareceria certo e nunca acharia ninguém.
    expect(analisarAlvo("@fulano")).toEqual({ tipo: "nome", nome: "fulano" });
    expect(analisarAlvo("fulano")).toEqual({ tipo: "nome", nome: "fulano" });
    expect(analisarAlvo("  @@fulano  ")).toEqual({ tipo: "nome", nome: "fulano" });
  });

  it("um número curto é nome, não id — ninguém tem snowflake de três dígitos", () => {
    expect(analisarAlvo("123")).toEqual({ tipo: "nome", nome: "123" });
  });

  it("vazio é vazio", () => {
    expect(analisarAlvo("")).toEqual({ tipo: "vazio" });
    expect(analisarAlvo(null)).toEqual({ tipo: "vazio" });
    expect(analisarAlvo("@")).toEqual({ tipo: "vazio" });
  });
});

describe("chaveDeNome", () => {
  it("ignora acento e caixa", () => {
    // `/aviso @André` tem de achar o `andre` da lista de membros.
    expect(chaveDeNome("André")).toBe(chaveDeNome("andre"));
    expect(chaveDeNome("  JOÃO ")).toBe("joao");
  });
});

describe("escaparMarkdown", () => {
  it("não deixa um nome virar link dentro do registro", () => {
    const escapado = escaparMarkdown("[clique](http://x)");
    expect(escapado).not.toMatch(/\]\(/);
    expect(escaparMarkdown("**negrito**")).toBe("\\*\\*negrito\\*\\*");
  });
});

describe("limparMotivo", () => {
  it("motivo vazio vira o padrão, e não string vazia no registro", () => {
    expect(limparMotivo("")).toBe(MOTIVO_PADRAO);
    expect(limparMotivo(null)).toBe(MOTIVO_PADRAO);
    expect(limparMotivo("  spam  ")).toBe("spam");
  });
  it("corta o motivo comprido sem estourar o campo do embed", () => {
    expect(limparMotivo("a".repeat(500)).length).toBe(400);
  });
});

const ACAO: AcaoDeModeracao = {
  tipo: "banir",
  moderador: { id: "111", nome: "moderadora" },
  alvo: { id: "222", nome: "encrenqueiro" },
  motivo: "spam repetido",
  detalhe: "mensagens dos últimos 7 dias apagadas",
  quando: 1_757_000_000_000,
};

describe("o registro de moderação", () => {
  it("a linha do log tem os quatro dados de uma auditoria", () => {
    const linha = linhaDoRegistro(ACAO);
    expect(linha).toContain("Banimento");
    expect(linha).toContain("encrenqueiro (222)");
    expect(linha).toContain("moderadora (111)");
    expect(linha).toContain("spam repetido");
  });

  it("o embed traz quem, em quem, quando e por quê — nessa ordem", () => {
    const embed = embedDoRegistro(ACAO);
    expect(embed.fields?.map((f) => f.name)).toEqual(["Quem", "Em quem", "Quando", "Motivo"]);
    // O id fica junto do nome: apelido muda, id não. Seis meses depois, o nome
    // no registro pode não existir mais.
    expect(embed.fields?.[1]?.value).toContain("222");
    expect(embed.title).toBe(rotuloDaAcao("banir"));
  });

  it("o motivo entra escapado — o registro é a peça que precisa ser confiável", () => {
    const embed = embedDoRegistro({ ...ACAO, motivo: "[link](http://mau)" });
    expect(embed.fields?.[3]?.value).not.toMatch(/\]\(/);
  });

  it("o texto em markdown diz tudo o que o embed diz — a API descarta embeds", () => {
    // `interactions.service.ts`: "embeds descartados (N): F5". Uma resposta que
    // vivesse só no embed chegaria vazia ao canal — foi o que a primeira
    // execução da prova mostrou.
    const texto = textoDoRegistro(ACAO);
    for (const pedaco of ["Banimento", "moderadora", "111", "encrenqueiro", "222", "spam repetido"]) {
      expect(texto).toContain(pedaco);
    }
    expect(texto).toContain("<t:1757000000:f>");
  });

  it("o carimbo é o do Discord, para cada um ver no seu fuso", () => {
    expect(carimbo(1_757_000_000_000)).toBe("<t:1757000000:f>");
    expect(carimbo(1_757_000_000_000, "R")).toBe("<t:1757000000:R>");
  });
});

describe("embedDosAvisos", () => {
  const aviso = (id: number, quando: number): AvisoGuardado => ({
    id,
    moderadorId: "111",
    moderadorNome: "moderadora",
    motivo: `motivo ${id}`,
    quando,
  });

  it("sem aviso, diz que não há", () => {
    const e = embedDosAvisos({ id: "222", nome: "fulano" }, []);
    expect(e.description).toMatch(/nenhum aviso/i);
  });

  it("lista do mais recente para o mais antigo", () => {
    const e = embedDosAvisos({ id: "222", nome: "fulano" }, [aviso(1, 1000), aviso(2, 9000)]);
    expect(e.description?.indexOf("#2")).toBeLessThan(e.description!.indexOf("#1"));
  });

  it("resume o excesso em vez de estourar o embed", () => {
    const muitos = Array.from({ length: 25 }, (_, i) => aviso(i + 1, i * 1000));
    const e = embedDosAvisos({ id: "222", nome: "fulano" }, muitos);
    expect(e.description).toMatch(/e mais 15 avisos mais antigo/);
    expect(e.footer?.text).toContain("25 aviso(s)");
    expect(e.description!.length).toBeLessThanOrEqual(3900);
  });
});

describe("textoDosAvisos", () => {
  const aviso = (id: number, quando: number): AvisoGuardado => ({
    id,
    moderadorId: "111",
    moderadorNome: "moderadora",
    motivo: `motivo ${id}`,
    quando,
  });

  it("sem aviso, diz que não há", () => {
    expect(textoDosAvisos({ id: "222", nome: "fulano" }, [])).toMatch(/nenhum aviso/i);
  });

  it("lista do mais recente para o mais antigo e cabe numa mensagem", () => {
    const muitos = Array.from({ length: 25 }, (_, i) => aviso(i + 1, i * 1000));
    const texto = textoDosAvisos({ id: "222", nome: "fulano" }, muitos);
    expect(texto.indexOf("#25")).toBeLessThan(texto.indexOf("#16"));
    expect(texto).toMatch(/e mais 15 avisos mais antigo/);
    expect(texto.length).toBeLessThanOrEqual(1900);
  });
});

describe("miudezas", () => {
  it("truncar corta em caracteres, não em bytes", () => {
    expect(truncar("ação", 10)).toBe("ação");
    expect(truncar("abcdef", 4)).toBe("abc…");
  });
  it("plural", () => {
    expect(plural(1, "mensagem", "mensagens")).toBe("1 mensagem");
    expect(plural(0, "mensagem", "mensagens")).toBe("0 mensagens");
  });
});
