import { describe, expect, it } from "vitest";
import {
  MAX_MODELO,
  configuracaoPadrao,
  entradaPronta,
  idOuNulo,
  normalizarConfiguracao,
  saidaPronta,
  validarModelo,
} from "./configuracao";
import { MENSAGEM_ENTRADA_PADRAO } from "./mensagem";

describe("configuracaoPadrao", () => {
  it("nasce com tudo desligado", () => {
    const c = configuracaoPadrao();
    expect(c.entrada.ligado).toBe(false);
    expect(c.entrada.dm).toBe(false);
    expect(c.saida.ligado).toBe(false);
    expect(c.autorole.ligado).toBe(false);
    expect(entradaPronta(c)).toBe(false);
    expect(saidaPronta(c)).toBe(false);
  });
});

describe("normalizarConfiguracao", () => {
  it("lixo vira o padrão em vez de derrubar o bot", () => {
    for (const entulho of [undefined, null, 7, "{}", [], { entrada: "sim" }]) {
      const c = normalizarConfiguracao(entulho);
      expect(c.entrada.mensagem).toBe(MENSAGEM_ENTRADA_PADRAO);
      expect(c.entrada.ligado).toBe(false);
    }
  });

  it("`ligado` sem canal é desligado — a invariante do arquivo", () => {
    const c = normalizarConfiguracao({ entrada: { ligado: true, canalId: null } });
    expect(c.entrada.ligado).toBe(false);
  });

  it("`ligado` com canal continua ligado", () => {
    const c = normalizarConfiguracao({ entrada: { ligado: true, canalId: "123" } });
    expect(c.entrada.ligado).toBe(true);
    expect(entradaPronta(c)).toBe(true);
  });

  it("autorole sem cargo é desligado", () => {
    expect(normalizarConfiguracao({ autorole: { ligado: true } }).autorole.ligado).toBe(false);
    expect(
      normalizarConfiguracao({ autorole: { ligado: true, cargoId: "9" } }).autorole.ligado,
    ).toBe(true);
  });

  it("mensagem vazia volta a ser a de fábrica", () => {
    const c = normalizarConfiguracao({ entrada: { mensagem: "   " } });
    expect(c.entrada.mensagem).toBe(MENSAGEM_ENTRADA_PADRAO);
  });

  it("mensagem comprida demais é cortada, não recusada", () => {
    const c = normalizarConfiguracao({ entrada: { mensagem: "x".repeat(MAX_MODELO + 500) } });
    expect(c.entrada.mensagem.length).toBe(MAX_MODELO);
  });

  it("é idempotente: normalizar duas vezes dá o mesmo", () => {
    const uma = normalizarConfiguracao({
      entrada: { ligado: true, canalId: "10", mensagem: " oi ", dm: true },
      saida: { ligado: true, canalId: "11" },
      autorole: { ligado: true, cargoId: "12" },
    });
    expect(normalizarConfiguracao(uma)).toEqual(uma);
  });
});

describe("idOuNulo", () => {
  it("aceita só snowflake decimal", () => {
    expect(idOuNulo("1234567890")).toBe("1234567890");
    expect(idOuNulo(" 42 ")).toBe("42");
  });
  it("recusa o que viraria caminho de arquivo", () => {
    for (const mau of ["../etc/passwd", "a/b", "", "  ", 7, null, undefined, "12a"]) {
      expect(idOuNulo(mau)).toBeNull();
    }
  });
});

describe("validarModelo", () => {
  it("recusa vazio com uma frase, não com uma exceção", () => {
    const v = validarModelo("   ");
    expect(v.ok).toBe(false);
  });
  it("recusa acima do teto e diz o tamanho", () => {
    const v = validarModelo("x".repeat(MAX_MODELO + 1));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toContain(String(MAX_MODELO + 1));
  });
  it("apara as pontas do que aceita", () => {
    const v = validarModelo("  oi {nome}  ");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.texto).toBe("oi {nome}");
  });
});
