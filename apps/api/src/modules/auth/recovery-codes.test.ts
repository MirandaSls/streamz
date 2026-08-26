import { describe, expect, it } from "vitest";
import { RECOVERY_CODE_COUNT, RECOVERY_CODE_LENGTH } from "@newdisc/shared";
import {
  formatarCodigoDeRecuperacao,
  gerarCodigoDeRecuperacao,
  gerarCodigosDeRecuperacao,
  hashDeCodigo,
  pareceCodigoDeRecuperacao,
} from "./recovery-codes";

/** Sem 0/O, 1/I/L e S/5: o código é lido de um papel e digitado à mão. */
const AMBIGUOS = /[01OILS5]/;

describe("gerarCodigoDeRecuperacao", () => {
  it("sai no formato XXXXX-XXXXX, sem caractere ambíguo", () => {
    for (let i = 0; i < 200; i += 1) {
      const codigo = gerarCodigoDeRecuperacao();
      expect(codigo).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(AMBIGUOS.test(codigo)).toBe(false);
    }
  });

  it("gera valores distintos", () => {
    const gerados = new Set(Array.from({ length: 100 }, () => gerarCodigoDeRecuperacao()));
    expect(gerados.size).toBe(100);
  });
});

describe("gerarCodigosDeRecuperacao", () => {
  it("entrega RECOVERY_CODE_COUNT códigos únicos", () => {
    const codigos = gerarCodigosDeRecuperacao();
    expect(codigos).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codigos).size).toBe(RECOVERY_CODE_COUNT);
  });
});

describe("hashDeCodigo", () => {
  it("é estável e independe de hífen, espaço e caixa", () => {
    const canonico = hashDeCodigo("ABCDE-FGHJK");
    expect(hashDeCodigo("abcde fghjk")).toBe(canonico);
    expect(hashDeCodigo("ABCDEFGHJK")).toBe(canonico);
    expect(hashDeCodigo("abcde-fghjk")).toBe(canonico);
  });

  it("muda com o código e nunca devolve o texto original", () => {
    expect(hashDeCodigo("ABCDE-FGHJK")).not.toBe(hashDeCodigo("ABCDE-FGHJM"));
    expect(hashDeCodigo("ABCDE-FGHJK")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("pareceCodigoDeRecuperacao", () => {
  it("aceita o que tem o tamanho e uma letra (não confunde com TOTP)", () => {
    expect(pareceCodigoDeRecuperacao(gerarCodigoDeRecuperacao())).toBe(true);
    expect(pareceCodigoDeRecuperacao("abcde fghjk")).toBe(true);
  });

  it("recusa código TOTP e tamanhos errados", () => {
    expect(pareceCodigoDeRecuperacao("123456")).toBe(false);
    // 10 dígitos têm o tamanho certo, mas sem letra continuam sendo só números
    expect(pareceCodigoDeRecuperacao("1234567890")).toBe(false);
    expect(pareceCodigoDeRecuperacao("ABCDE-FGHJ")).toBe(false);
    expect(pareceCodigoDeRecuperacao("")).toBe(false);
  });
});

describe("formatarCodigoDeRecuperacao", () => {
  it("põe o hífen no meio do que o gerador produz", () => {
    const bruto = "A".repeat(RECOVERY_CODE_LENGTH);
    expect(formatarCodigoDeRecuperacao(bruto)).toBe("AAAAA-AAAAA");
  });

  it("normaliza antes de formatar (idempotente)", () => {
    expect(formatarCodigoDeRecuperacao("abcde-fghjk")).toBe("ABCDE-FGHJK");
    expect(formatarCodigoDeRecuperacao(formatarCodigoDeRecuperacao("abcdefghjk"))).toBe(
      "ABCDE-FGHJK",
    );
  });
});
