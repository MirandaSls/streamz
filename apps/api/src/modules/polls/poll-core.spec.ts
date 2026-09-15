import { describe, expect, it } from "vitest";
import { ehEmojiDeResposta, isPollClosed, pollOptionEmojisSchema, pollPercent } from "@streamz/shared";
import { normalizarEmojisDasOpcoes, tallyPoll, type PollRow } from "./poll-core";

const AGORA = new Date("2026-08-25T12:00:00.000Z").getTime();

const enquete: PollRow = {
  messageId: "m1",
  question: "Qual o melhor dia?",
  options: ["Sexta", "Sábado", "Domingo"],
  multi: false,
  expiresAt: null,
  closedAt: null,
};

describe("contagem da enquete", () => {
  it("conta os votos por opção e soma o total", () => {
    const poll = tallyPoll(enquete, [
      { optionIndex: 0, userId: "u1" },
      { optionIndex: 1, userId: "u2" },
      { optionIndex: 1, userId: "u3" },
    ]);
    expect(poll.options.map((o) => o.votes)).toEqual([1, 2, 0]);
    expect(poll.totalVotes).toBe(3);
  });

  it("devolve zero em enquete sem voto nenhum", () => {
    const poll = tallyPoll(enquete, []);
    expect(poll.totalVotes).toBe(0);
    expect(poll.options.every((o) => o.votes === 0 && !o.me)).toBe(true);
  });

  it("marca as opções do espectador, e só as dele", () => {
    const poll = tallyPoll(
      { ...enquete, multi: true },
      [
        { optionIndex: 0, userId: "eu" },
        { optionIndex: 2, userId: "eu" },
        { optionIndex: 1, userId: "outro" },
      ],
      "eu",
    );
    expect(poll.options.map((o) => o.me)).toEqual([true, false, true]);
  });

  it("sem espectador ninguém é marcado — é o caso do broadcast", () => {
    const poll = tallyPoll(enquete, [{ optionIndex: 0, userId: "u1" }]);
    expect(poll.options.every((o) => !o.me)).toBe(true);
  });

  it("ignora voto em índice que não existe, em vez de quebrar", () => {
    const poll = tallyPoll(enquete, [
      { optionIndex: 9, userId: "u1" },
      { optionIndex: -1, userId: "u2" },
      { optionIndex: 0, userId: "u3" },
    ]);
    expect(poll.totalVotes).toBe(1);
    expect(poll.options[0].votes).toBe(1);
  });

  it("preserva a ordem e o texto das opções", () => {
    const poll = tallyPoll(enquete, []);
    expect(poll.options.map((o) => [o.index, o.text])).toEqual([
      [0, "Sexta"],
      [1, "Sábado"],
      [2, "Domingo"],
    ]);
  });
});

describe("porcentagem das barras", () => {
  it("é zero quando ninguém votou (nada de divisão por zero)", () => {
    expect(pollPercent(0, 0)).toBe(0);
  });

  it("arredonda para baixo, para a soma nunca passar de 100", () => {
    expect(pollPercent(1, 3)).toBe(33);
    expect(pollPercent(2, 3)).toBe(66);
    expect(pollPercent(1, 3) + pollPercent(2, 3)).toBeLessThanOrEqual(100);
  });

  it("chega a 100 com voto único", () => {
    expect(pollPercent(4, 4)).toBe(100);
  });
});

describe("enquete encerrada", () => {
  it("está aberta sem prazo e sem encerramento", () => {
    expect(isPollClosed({ expiresAt: null, closedAt: null }, AGORA)).toBe(false);
  });

  it("fecha quando o prazo venceu", () => {
    const vencida = new Date(AGORA - 1000).toISOString();
    expect(isPollClosed({ expiresAt: vencida, closedAt: null }, AGORA)).toBe(true);
  });

  it("continua aberta enquanto o prazo não chega", () => {
    const futuro = new Date(AGORA + 1000).toISOString();
    expect(isPollClosed({ expiresAt: futuro, closedAt: null }, AGORA)).toBe(false);
  });

  it("encerramento à mão vence o prazo em aberto", () => {
    const futuro = new Date(AGORA + 60_000).toISOString();
    const fechada = new Date(AGORA - 60_000).toISOString();
    expect(isPollClosed({ expiresAt: futuro, closedAt: fechada }, AGORA)).toBe(true);
  });
});

describe("emoji por resposta", () => {
  it("sai no DTO na posição da opção, e null onde não há", () => {
    const poll = tallyPoll({ ...enquete, optionEmojis: ["🍕", "", "<:festa:abc123>"] }, []);
    expect(poll.options.map((o) => o.emoji)).toEqual(["🍕", null, "<:festa:abc123>"]);
  });

  it("enquete antiga, sem a coluna preenchida, sai sem emoji nenhum", () => {
    expect(tallyPoll(enquete, []).options.every((o) => o.emoji === null)).toBe(true);
    expect(tallyPoll({ ...enquete, optionEmojis: [] }, []).options.every((o) => o.emoji === null)).toBe(
      true,
    );
  });

  it("alinha o array com as opções: completa com vazio e corta o excesso", () => {
    expect(normalizarEmojisDasOpcoes(3, ["🍕"])).toEqual(["🍕", "", ""]);
    expect(normalizarEmojisDasOpcoes(2, ["🍕", "🎉", "🔥"])).toEqual(["🍕", "🎉"]);
    expect(normalizarEmojisDasOpcoes(3, [null, " 🎉 ", undefined])).toEqual(["", "🎉", ""]);
  });

  it("sem nenhum emoji grava array vazio, igual às enquetes antigas", () => {
    expect(normalizarEmojisDasOpcoes(3, undefined)).toEqual([]);
    expect(normalizarEmojisDasOpcoes(3, [null, "", "  "])).toEqual([]);
  });

  it("aceita unicode (inclusive sequências) e a forma <:nome:id>", () => {
    for (const e of ["🍕", "👍🏽", "👩‍💻", "🇧🇷", "1️⃣", "❤️", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "<:festa:abc123>"]) {
      expect(ehEmojiDeResposta(e), e).toBe(true);
    }
  });

  it("recusa texto comum no lugar do emoji", () => {
    for (const e of ["", "a", "sim", "12", "🍕 pizza", ":festa:", "<:Festa:abc>", "<a:festa:abc>"]) {
      expect(ehEmojiDeResposta(e), e).toBe(false);
    }
  });

  it("o schema do poll.create aceita null e vazio, e recusa texto", () => {
    expect(pollOptionEmojisSchema.safeParse({ optionEmojis: ["🍕", null, ""] }).success).toBe(true);
    expect(pollOptionEmojisSchema.safeParse({}).success).toBe(true);
    expect(pollOptionEmojisSchema.safeParse({ optionEmojis: ["pizza"] }).success).toBe(false);
  });
});
