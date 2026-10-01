import { describe, expect, it } from "vitest";
import {
  MemoriaDeBloqueio,
  PREFIXOS_ALTERNATIVOS,
  consultasAlternativas,
  ehFonteAlternativa,
  limparTitulo,
} from "./fontes-alternativas";

describe("consultasAlternativas sem duplicar autor", () => {
  it("não repete o autor quando o título já o contém e tira o ruído", () => {
    const consultas = consultasAlternativas({
      title: "Trapt - Headstrong (Official Music Video)",
      author: "Trapt",
    });
    expect(consultas).toEqual(["scsearch:Trapt - Headstrong", "jssearch:Trapt - Headstrong"]);
    expect(consultas.some((c) => c.includes("Trapt Trapt"))).toBe(false);
  });

  it("limparTitulo remove ruído", () => {
    expect(limparTitulo("Song (Official Video) [4K]")).toBe("Song");
  });
});

describe("consultasAlternativas", () => {
  it("gera uma consulta por prefixo", () => {
    const consultas = consultasAlternativas({ title: "Song", author: "Band" });
    expect(consultas.slice(0, 2)).toEqual(PREFIXOS_ALTERNATIVOS.map((p) => `${p}:Band Song`));
    // variante só com o título, depois das completas
    expect(consultas.slice(2)).toEqual(PREFIXOS_ALTERNATIVOS.map((p) => `${p}:Song`));
  });

  it("tira (Official Video) e (Official 4K Video)", () => {
    expect(consultasAlternativas({ title: "Song (Official Video)", author: "Band" })[0]).toBe(
      "scsearch:Band Song",
    );
    expect(consultasAlternativas({ title: "Song (Official 4K Video)", author: "Band" })[0]).toBe(
      "scsearch:Band Song",
    );
  });

  it("tira [Official Audio] e (Lyrics)", () => {
    expect(consultasAlternativas({ title: "Song [Official Audio]", author: "Band" })[0]).toBe(
      "scsearch:Band Song",
    );
    expect(consultasAlternativas({ title: "Song (Lyrics)", author: "Band" })[0]).toBe(
      "scsearch:Band Song",
    );
  });

  it("mantém ft./feat. e colapsa espaços", () => {
    expect(
      consultasAlternativas({ title: "  Song   ft. Other  (HD) ", author: " Band " })[1],
    ).toBe("jssearch:Band Song ft. Other");
  });

  it("sem título não há consulta", () => {
    expect(consultasAlternativas({ title: "", author: "Band" })).toEqual([]);
    expect(consultasAlternativas({ title: null })).toEqual([]);
    expect(consultasAlternativas({ title: "(Official Video)" })).toEqual([]);
  });

  it("sem autor usa só o título", () => {
    expect(consultasAlternativas({ title: "Song" })[0]).toBe("scsearch:Song");
  });
});

describe("MemoriaDeBloqueio", () => {
  it("começa inativa", () => {
    expect(new MemoriaDeBloqueio().ativo(0)).toBe(false);
  });

  it("fica ativa até marcar + ttl e depois expira", () => {
    const m = new MemoriaDeBloqueio(100);
    m.marcar(1000);
    expect(m.ativo(1000)).toBe(true);
    expect(m.ativo(1100)).toBe(true);
    expect(m.ativo(1101)).toBe(false);
  });

  it("o ttl padrão é de 10 minutos", () => {
    const m = new MemoriaDeBloqueio();
    m.marcar(0);
    expect(m.ativo(10 * 60_000)).toBe(true);
    expect(m.ativo(10 * 60_000 + 1)).toBe(false);
  });
});

describe("ehFonteAlternativa", () => {
  it("reconhece soundcloud e jiosaavn sem diferenciar caixa", () => {
    expect(ehFonteAlternativa("soundcloud")).toBe(true);
    expect(ehFonteAlternativa("JioSaavn")).toBe(true);
  });

  it("recusa youtube e vazio", () => {
    expect(ehFonteAlternativa("youtube")).toBe(false);
    expect(ehFonteAlternativa(undefined)).toBe(false);
    expect(ehFonteAlternativa(null)).toBe(false);
  });
});
