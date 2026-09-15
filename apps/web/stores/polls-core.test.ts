import { describe, expect, it } from "vitest";
import type { Poll } from "@streamz/shared";
import { aplicarVoto, mesclarContagem, reconciliarLote } from "@/stores/polls-core";

function enquete(over: Partial<Poll> = {}): Poll {
  return {
    messageId: "m1",
    question: "Qual dia?",
    options: [
      { index: 0, text: "Sexta", votes: 2, me: false },
      { index: 1, text: "Sábado", votes: 1, me: false },
      { index: 2, text: "Domingo", votes: 0, me: false },
    ],
    multi: false,
    expiresAt: null,
    closedAt: null,
    totalVotes: 3,
    ...over,
  };
}

describe("voto otimista", () => {
  it("marca a opção e soma um voto", () => {
    const p = aplicarVoto(enquete(), 1);
    expect(p.options[1]).toMatchObject({ me: true, votes: 2 });
    expect(p.totalVotes).toBe(4);
  });

  it("clicar de novo na mesma opção desvota", () => {
    const votado = aplicarVoto(enquete(), 1);
    const p = aplicarVoto(votado, 1);
    expect(p.options[1]).toMatchObject({ me: false, votes: 1 });
    expect(p.totalVotes).toBe(3);
  });

  it("em escolha única, votar noutra opção move o meu voto", () => {
    const p = aplicarVoto(aplicarVoto(enquete(), 0), 2);
    expect(p.options.map((o) => o.me)).toEqual([false, false, true]);
    expect(p.options[0].votes).toBe(2); // voltou ao que era
    expect(p.options[2].votes).toBe(1);
    expect(p.totalVotes).toBe(4);
  });

  it("em múltipla escolha, os dois votos ficam", () => {
    const p = aplicarVoto(aplicarVoto(enquete({ multi: true }), 0), 2);
    expect(p.options.map((o) => o.me)).toEqual([true, false, true]);
    expect(p.totalVotes).toBe(5);
  });

  it("nunca deixa a contagem ficar negativa", () => {
    const zerada = enquete({
      options: [{ index: 0, text: "Sexta", votes: 0, me: true }],
      totalVotes: 0,
    });
    expect(aplicarVoto(zerada, 0).options[0].votes).toBe(0);
  });

  it("índice inexistente não altera nada além de não marcar ninguém", () => {
    const p = aplicarVoto(enquete(), 9);
    expect(p.options.every((o) => !o.me)).toBe(true);
    expect(p.totalVotes).toBe(3);
  });
});

describe("contagem vinda do gateway", () => {
  it("preserva a minha marcação — o broadcast não sabe quem sou eu", () => {
    const meu = aplicarVoto(enquete(), 1);
    const doServidor = enquete({
      options: [
        { index: 0, text: "Sexta", votes: 5, me: false },
        { index: 1, text: "Sábado", votes: 9, me: false },
        { index: 2, text: "Domingo", votes: 0, me: false },
      ],
      totalVotes: 14,
    });
    const p = mesclarContagem(meu, doServidor);
    expect(p.options.map((o) => o.me)).toEqual([false, true, false]);
    expect(p.options.map((o) => o.votes)).toEqual([5, 9, 0]);
    expect(p.totalVotes).toBe(14);
  });

  it("sem versão anterior, ninguém fica marcado", () => {
    const p = mesclarContagem(undefined, enquete());
    expect(p.options.every((o) => !o.me)).toBe(true);
  });

  it("traz o encerramento do servidor", () => {
    const fechada = enquete({ closedAt: "2026-08-25T12:00:00.000Z" });
    expect(mesclarContagem(enquete(), fechada).closedAt).toBe("2026-08-25T12:00:00.000Z");
  });
});

describe("voto recusado pelo servidor (ack)", () => {
  it("sem nenhum voto aceito, volta exatamente ao que era", () => {
    const base = enquete();
    const p = reconciliarLote(base, [{ indice: 1, ok: false }]);
    expect(p.options.map((o) => [o.votes, o.me])).toEqual([
      [2, false],
      [1, false],
      [0, false],
    ]);
    expect(p.totalVotes).toBe(3);
  });

  it("refaz só os aceitos, na ordem, e a marca de escolha única fica certa", () => {
    // A foi recusado, B aceito: a marca fica só em B, e A não perde voto
    const p = reconciliarLote(enquete(), [
      { indice: 0, ok: false },
      { indice: 2, ok: true },
    ]);
    expect(p.options.map((o) => o.me)).toEqual([false, false, true]);
    expect(p.options.map((o) => o.votes)).toEqual([2, 1, 1]);
  });

  it("com poll.updated no meio, a contagem é a do servidor e a marca é a refeita", () => {
    const servidor = enquete({
      options: [
        { index: 0, text: "Sexta", votes: 5, me: false },
        { index: 1, text: "Sábado", votes: 4, me: false },
        { index: 2, text: "Domingo", votes: 1, me: false },
      ],
      totalVotes: 10,
    });
    const p = reconciliarLote(
      enquete({ multi: true }),
      [
        { indice: 1, ok: true },
        { indice: 2, ok: false },
      ],
      servidor,
    );
    expect(p.options.map((o) => o.votes)).toEqual([5, 4, 1]);
    expect(p.options.map((o) => o.me)).toEqual([false, true, false]);
    expect(p.totalVotes).toBe(10);
  });
});
