import { describe, expect, it } from "vitest";
import { corDoAvatar } from "./avatar-cores";

/** Ids no formato que o Prisma gera: prefixo de tempo e fingerprint em comum. */
function idsRealistas(quantos: number): string[] {
  const base36 = "0123456789abcdefghijklmnopqrstuvwxyz";
  let semente = 12345;
  const proximo = () => (semente = (semente * 1103515245 + 12345) % 2147483648);
  return Array.from({ length: quantos }, () => {
    let cauda = "";
    for (let i = 0; i < 8; i++) cauda += base36[proximo() % 36];
    return `cmtd9dvbd0000vbft${cauda}`;
  });
}

describe("cor do avatar sem foto", () => {
  it("é estável: a mesma pessoa não muda de cor entre telas", () => {
    const id = "cmtd9dvbd0000vbft9qwtedq1";
    expect(corDoAvatar(id)).toBe(corDoAvatar(id));
  });

  it("dá cores diferentes para pessoas diferentes", () => {
    const cores = new Set(idsRealistas(50).map(corDoAvatar));
    expect(cores.size).toBeGreaterThan(1);
  });

  it("usa a paleta inteira — era o bug: com 5 cores, 4 de 5 usuários repetiam", () => {
    const cores = new Set(idsRealistas(400).map(corDoAvatar));
    expect(cores.size).toBe(12);
  });

  it("distribui sem cor dominante", () => {
    const ids = idsRealistas(2400);
    const contagem = new Map<string, number>();
    for (const id of ids) {
      const c = corDoAvatar(id);
      contagem.set(c, (contagem.get(c) ?? 0) + 1);
    }
    // ideal = 1/12 (8,3%); o dobro disso já seria concentração visível
    const maior = Math.max(...contagem.values()) / ids.length;
    expect(maior).toBeLessThan(2 / 12);
  });

  it("devolve sempre um hex de 6 dígitos", () => {
    for (const id of idsRealistas(20)) {
      expect(corDoAvatar(id)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
