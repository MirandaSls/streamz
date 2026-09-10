import { describe, expect, it } from "vitest";
import { ordenarRanking, paginar, posicaoNoRanking } from "./ranking";
import type { UsuarioDeNiveis } from "./dados";

const u = (xp: number, mensagens = 0): UsuarioDeNiveis => ({ xp, mensagens, ultimoGanhoEm: 0 });

describe("ordenarRanking", () => {
  it("põe o maior XP em primeiro", () => {
    const r = ordenarRanking({ a: u(10), b: u(300), c: u(150) });
    expect(r.map((l) => l.usuarioId)).toEqual(["b", "c", "a"]);
    expect(r.map((l) => l.posicao)).toEqual([1, 2, 3]);
  });

  it("calcula o nível de cada linha", () => {
    const r = ordenarRanking({ a: u(255) });
    expect(r[0]!.nivel).toBe(2);
  });

  it("empate desempata pelo id, e a ordem não depende da inserção", () => {
    const umaOrdem = ordenarRanking({ zeca: u(100), ana: u(100), bia: u(100) });
    const outra = ordenarRanking({ bia: u(100), zeca: u(100), ana: u(100) });
    expect(umaOrdem.map((l) => l.usuarioId)).toEqual(["ana", "bia", "zeca"]);
    expect(outra.map((l) => l.usuarioId)).toEqual(umaOrdem.map((l) => l.usuarioId));
  });

  it("quem tem 0 XP fica de fora — o ranking não lista quem nunca pontuou", () => {
    expect(ordenarRanking({ a: u(0), b: u(5) }).map((l) => l.usuarioId)).toEqual(["b"]);
  });
});

describe("posicaoNoRanking", () => {
  it("acha a posição e devolve 0 para quem não está", () => {
    const r = ordenarRanking({ a: u(10), b: u(30) });
    expect(posicaoNoRanking(r, "b")).toBe(1);
    expect(posicaoNoRanking(r, "a")).toBe(2);
    expect(posicaoNoRanking(r, "ninguem")).toBe(0);
  });
});

describe("paginar", () => {
  const muitos = ordenarRanking(
    Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`u${String(i).padStart(2, "0")}`, u(1000 - i)])),
  );

  it("dez por página, e a última vem curta", () => {
    expect(paginar(muitos, 1).itens).toHaveLength(10);
    expect(paginar(muitos, 3).itens).toHaveLength(5);
    expect(paginar(muitos, 1).paginas).toBe(3);
    expect(paginar(muitos, 1).total).toBe(25);
  });

  it("a página 2 começa na 11ª posição", () => {
    expect(paginar(muitos, 2).itens[0]!.posicao).toBe(11);
  });

  it("grampeia número grande na última e número bobo na primeira", () => {
    expect(paginar(muitos, 99).pagina).toBe(3);
    expect(paginar(muitos, 0).pagina).toBe(1);
    expect(paginar(muitos, Number.NaN).pagina).toBe(1);
  });

  it("ranking vazio ainda tem uma página", () => {
    expect(paginar([], 1)).toMatchObject({ pagina: 1, paginas: 1, total: 0, itens: [] });
  });
});
