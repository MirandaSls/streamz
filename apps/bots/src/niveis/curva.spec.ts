import { describe, expect, it } from "vitest";
import { nivelDoXp, progressoDoXp, xpAcumuladoAte, xpDoNivel } from "./curva";

describe("xpDoNivel", () => {
  it("é 5n² + 50n + 100, conferido na mão nos primeiros níveis", () => {
    expect(xpDoNivel(0)).toBe(100);
    expect(xpDoNivel(1)).toBe(155);
    expect(xpDoNivel(2)).toBe(220);
    expect(xpDoNivel(3)).toBe(295);
    expect(xpDoNivel(10)).toBe(1100);
  });

  it("cresce sempre — uma curva que empata trava o ranking", () => {
    for (let n = 0; n < 200; n++) expect(xpDoNivel(n + 1)).toBeGreaterThan(xpDoNivel(n));
  });
});

describe("xpAcumuladoAte", () => {
  it("bate com a soma feita à mão", () => {
    expect(xpAcumuladoAte(0)).toBe(0);
    expect(xpAcumuladoAte(1)).toBe(100);
    expect(xpAcumuladoAte(2)).toBe(255);
    expect(xpAcumuladoAte(3)).toBe(475);
  });

  it("a forma fechada bate com a soma ingênua até o nível 300", () => {
    // Este é o teste que justifica a forma fechada existir: se um dia alguém
    // mexer na álgebra, é aqui que a conta errada aparece.
    let soma = 0;
    for (let n = 0; n <= 300; n++) {
      expect(xpAcumuladoAte(n)).toBe(soma);
      soma += xpDoNivel(n);
    }
  });
});

describe("nivelDoXp", () => {
  it("é 0 até faltar um XP para o primeiro nível", () => {
    expect(nivelDoXp(0)).toBe(0);
    expect(nivelDoXp(99)).toBe(0);
    expect(nivelDoXp(100)).toBe(1);
  });

  it("vira exatamente na fronteira, para cima e para baixo", () => {
    for (let n = 1; n <= 150; n++) {
      const limiar = xpAcumuladoAte(n);
      expect(nivelDoXp(limiar - 1)).toBe(n - 1);
      expect(nivelDoXp(limiar)).toBe(n);
    }
  });

  it("é o inverso de xpAcumuladoAte no meio do nível", () => {
    for (let n = 0; n <= 150; n++) {
      expect(nivelDoXp(xpAcumuladoAte(n) + Math.floor(xpDoNivel(n) / 2))).toBe(n);
    }
  });

  it("não pendura nem estoura com lixo", () => {
    expect(nivelDoXp(-5)).toBe(0);
    expect(nivelDoXp(Number.NaN)).toBe(0);
    expect(nivelDoXp(1_000_000_000)).toBeGreaterThan(0);
  });
});

describe("progressoDoXp", () => {
  it("zera bonito para quem nunca falou", () => {
    const p = progressoDoXp(0);
    expect(p).toMatchObject({ nivel: 0, xpNoNivel: 0, xpDoNivel: 100, falta: 100, fracao: 0 });
  });

  it("no limiar, o nível sobe e o progresso recomeça", () => {
    const p = progressoDoXp(100);
    expect(p.nivel).toBe(1);
    expect(p.xpNoNivel).toBe(0);
    expect(p.falta).toBe(155);
  });

  it("xpNoNivel + falta é sempre o custo do nível", () => {
    for (const xp of [0, 1, 99, 100, 254, 255, 999, 12_345, 987_654]) {
      const p = progressoDoXp(xp);
      expect(p.xpNoNivel + p.falta).toBe(p.xpDoNivel);
      expect(p.fracao).toBeGreaterThanOrEqual(0);
      expect(p.fracao).toBeLessThanOrEqual(1);
    }
  });
});
