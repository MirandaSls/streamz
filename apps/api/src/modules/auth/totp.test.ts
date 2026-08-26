import { describe, expect, it } from "vitest";
import { TOTP_DIGITS, TOTP_STEP_SECONDS } from "@streamz/shared";
import {
  deBase32,
  gerarCodigoTotp,
  gerarSegredoTotp,
  igualEmTempoConstante,
  otpauthUrl,
  paraBase32,
  segredoLegivel,
  validarCodigoTotp,
} from "./totp";

/**
 * O TOTP é implementado aqui em vez de vir de biblioteca; estes testes são o
 * que garante que ele continua sendo o mesmo algoritmo que o Google
 * Authenticator espera. Os vetores de `hotp` vêm do apêndice D do RFC 4226
 * (segredo ASCII `12345678901234567890`).
 */

/** `12345678901234567890` em base32 — o segredo dos vetores do RFC. */
const SEGREDO_RFC = paraBase32(Buffer.from("12345678901234567890", "ascii"));

describe("base32", () => {
  it("ida e volta preserva os bytes", () => {
    const bytes = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff, 0x42]);
    expect(deBase32(paraBase32(bytes)).equals(bytes)).toBe(true);
  });

  it("aceita espaços, hífens e padding na decodificação", () => {
    const base = paraBase32(Buffer.from("streamz", "ascii"));
    const sujo = `${segredoLegivel(base)}=`.replace(/ /g, " - ");
    expect(deBase32(sujo).toString("ascii")).toBe("streamz");
  });

  it("recusa caractere fora do alfabeto", () => {
    expect(() => deBase32("ABC1")).toThrow(/base32/i);
  });
});

describe("gerarCodigoTotp", () => {
  // RFC 6238, tabela do apêndice B (coluna SHA1), truncada para 6 dígitos
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("segundo %i gera %s", (segundos, esperado) => {
    expect(gerarCodigoTotp(SEGREDO_RFC, segundos * 1000)).toBe(esperado);
  });

  it("tem sempre TOTP_DIGITS dígitos, inclusive com zero à esquerda", () => {
    const codigo = gerarCodigoTotp(SEGREDO_RFC, 1234567890 * 1000);
    expect(codigo).toHaveLength(TOTP_DIGITS);
    expect(codigo.startsWith("0")).toBe(true);
  });
});

describe("validarCodigoTotp", () => {
  const agora = 1_700_000_000_000;
  const passo = TOTP_STEP_SECONDS * 1000;

  it("aceita o código do passo atual", () => {
    expect(validarCodigoTotp(SEGREDO_RFC, gerarCodigoTotp(SEGREDO_RFC, agora), agora)).toBe(true);
  });

  it("aceita um passo de folga para cada lado (relógio do celular)", () => {
    for (const delta of [-passo, passo]) {
      const codigo = gerarCodigoTotp(SEGREDO_RFC, agora + delta);
      expect(validarCodigoTotp(SEGREDO_RFC, codigo, agora)).toBe(true);
    }
  });

  it("recusa fora da janela", () => {
    const codigo = gerarCodigoTotp(SEGREDO_RFC, agora + 2 * passo);
    expect(validarCodigoTotp(SEGREDO_RFC, codigo, agora)).toBe(false);
  });

  it("ignora espaços do que o usuário digita", () => {
    const codigo = gerarCodigoTotp(SEGREDO_RFC, agora);
    const digitado = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;
    expect(validarCodigoTotp(SEGREDO_RFC, digitado, agora)).toBe(true);
  });

  it("recusa o que não tem cara de código, sem estourar", () => {
    for (const lixo of ["", "12345", "1234567", "abcdef", "  "]) {
      expect(validarCodigoTotp(SEGREDO_RFC, lixo, agora)).toBe(false);
    }
  });

  it("recusa código de outro segredo", () => {
    const outro = gerarSegredoTotp();
    expect(validarCodigoTotp(SEGREDO_RFC, gerarCodigoTotp(outro, agora), agora)).toBe(false);
  });
});

describe("gerarSegredoTotp", () => {
  it("gera base32 decodificável de 20 bytes e nunca repete", () => {
    const a = gerarSegredoTotp();
    const b = gerarSegredoTotp();
    expect(a).not.toBe(b);
    expect(deBase32(a)).toHaveLength(20);
    expect(a).toMatch(/^[A-Z2-7]+$/);
  });
});

describe("otpauthUrl", () => {
  it("carrega segredo, emissor e os parâmetros que os apps leem", () => {
    const url = new URL(otpauthUrl("Streamz", "ana@exemplo.com", SEGREDO_RFC));
    expect(url.protocol).toBe("otpauth:");
    expect(decodeURIComponent(url.pathname)).toContain("Streamz:ana@exemplo.com");
    expect(url.searchParams.get("secret")).toBe(SEGREDO_RFC);
    expect(url.searchParams.get("issuer")).toBe("Streamz");
    expect(url.searchParams.get("digits")).toBe(String(TOTP_DIGITS));
    expect(url.searchParams.get("period")).toBe(String(TOTP_STEP_SECONDS));
  });

  it("escapa o rótulo (`:` separa emissor de conta)", () => {
    const url = otpauthUrl("New:Disc", "a:b", SEGREDO_RFC);
    expect(url).toContain("New%3ADisc:a%3Ab");
  });
});

describe("segredoLegivel", () => {
  it("agrupa de quatro em quatro sem sobrar espaço", () => {
    expect(segredoLegivel("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
  });
});

describe("igualEmTempoConstante", () => {
  it("compara conteúdo e trata tamanhos diferentes sem estourar", () => {
    expect(igualEmTempoConstante("123456", "123456")).toBe(true);
    expect(igualEmTempoConstante("123456", "123457")).toBe(false);
    expect(igualEmTempoConstante("123456", "12345")).toBe(false);
  });
});
