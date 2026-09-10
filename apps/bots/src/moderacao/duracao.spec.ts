import { describe, expect, it } from "vitest";
import { MAXIMO_MS, analisarDuracao, escreverDuracao, explicarDuracao } from "./duracao";

describe("analisarDuracao", () => {
  it("lê as quatro unidades do enunciado", () => {
    expect(analisarDuracao("60s")).toEqual({ ok: true, ms: 60_000 });
    expect(analisarDuracao("10m")).toEqual({ ok: true, ms: 600_000 });
    expect(analisarDuracao("1h")).toEqual({ ok: true, ms: 3_600_000 });
    expect(analisarDuracao("1d")).toEqual({ ok: true, ms: 86_400_000 });
    expect(analisarDuracao("7d")).toEqual({ ok: true, ms: 604_800_000 });
  });

  it("soma as partes, com ou sem espaço", () => {
    expect(analisarDuracao("1h30m")).toEqual({ ok: true, ms: 5_400_000 });
    expect(analisarDuracao("1h 30m")).toEqual({ ok: true, ms: 5_400_000 });
    expect(analisarDuracao("1d 12h")).toEqual({ ok: true, ms: 129_600_000 });
  });

  it("aceita maiúsculas, plural e vírgula decimal", () => {
    expect(analisarDuracao("10M")).toEqual({ ok: true, ms: 600_000 });
    expect(analisarDuracao("2 horas")).toEqual({ ok: true, ms: 7_200_000 });
    expect(analisarDuracao("1,5h")).toEqual({ ok: true, ms: 5_400_000 });
  });

  it("recusa número sem unidade — adivinhar é o defeito que este módulo evita", () => {
    // `10` poderia ser dez segundos ou dez minutos. Silenciar alguém pelo
    // tempo errado não falha em lugar nenhum: só aparece como reclamação.
    expect(analisarDuracao("10")).toEqual({ ok: false, motivo: "formato" });
  });

  it("recusa lixo depois da duração em vez de engolir em silêncio", () => {
    // O caso real: `!silenciar fulano 10m spam` com o motivo caindo na opção
    // errada. Aceitar `10m spam` como dez minutos esconderia o erro.
    expect(analisarDuracao("10m spam")).toEqual({ ok: false, motivo: "formato" });
    expect(analisarDuracao("abc")).toEqual({ ok: false, motivo: "formato" });
  });

  it("respeita o piso e o teto de 28 dias do silenciamento", () => {
    expect(analisarDuracao("500ms" as string)).toEqual({ ok: false, motivo: "formato" });
    expect(analisarDuracao("29d")).toEqual({ ok: false, motivo: "longa" });
    expect(analisarDuracao("28d")).toEqual({ ok: true, ms: MAXIMO_MS });
    expect(analisarDuracao("1s")).toEqual({ ok: true, ms: 1000 });
  });

  it("vazio é vazio, e a frase pede o formato", () => {
    expect(analisarDuracao("")).toEqual({ ok: false, motivo: "vazia" });
    expect(analisarDuracao(null)).toEqual({ ok: false, motivo: "vazia" });
    expect(explicarDuracao("vazia")).toMatch(/10m/);
    expect(explicarDuracao("longa")).toMatch(/28 dias/);
  });
});

describe("escreverDuracao", () => {
  it("escreve no máximo as duas maiores unidades", () => {
    expect(escreverDuracao(604_800_000)).toBe("7 d");
    expect(escreverDuracao(5_400_000)).toBe("1 h 30 min");
    expect(escreverDuracao(60_000)).toBe("1 min");
    expect(escreverDuracao(90_000)).toBe("1 min 30 s");
  });

  it("é o inverso do parser nas durações do enunciado", () => {
    for (const texto of ["60s", "10m", "1h", "1d", "7d"]) {
      const lida = analisarDuracao(texto);
      expect(lida.ok).toBe(true);
      if (lida.ok) expect(analisarDuracao(escreverDuracao(lida.ms).replace(/ /g, "")).ok).toBe(true);
    }
  });
});
