import { describe, expect, it } from "vitest";
import { chamadaPerdida, duracaoDaChamada, textoDaChamada } from "@streamz/shared";
import type { Message, MessageCall, PublicUser } from "@streamz/shared";

const autor = { id: "u-nagai" } as unknown as PublicUser;
const espectador = "u-outro";

function mensagem(call: MessageCall | null): Pick<Message, "author" | "call"> {
  return { author: autor, call };
}

describe("duracaoDaChamada", () => {
  it("10s vira 'alguns segundos'", () => {
    expect(duracaoDaChamada(10 * 1000)).toBe("alguns segundos");
  });

  it("60s vira 'um minuto'", () => {
    expect(duracaoDaChamada(60 * 1000)).toBe("um minuto");
  });

  it("5min vira '5 minutos'", () => {
    expect(duracaoDaChamada(5 * 60 * 1000)).toBe("5 minutos");
  });

  it("60min vira 'uma hora'", () => {
    expect(duracaoDaChamada(60 * 60 * 1000)).toBe("uma hora");
  });

  it("5h vira '5 horas'", () => {
    expect(duracaoDaChamada(5 * 60 * 60 * 1000)).toBe("5 horas");
  });

  it("30h vira 'um dia'", () => {
    expect(duracaoDaChamada(30 * 60 * 60 * 1000)).toBe("um dia");
  });

  it("3 dias vira '3 dias'", () => {
    expect(duracaoDaChamada(3 * 24 * 60 * 60 * 1000)).toBe("3 dias");
  });

  it("duração negativa (relógio torto) trata como 0", () => {
    expect(duracaoDaChamada(-1000)).toBe("alguns segundos");
  });
});

describe("textoDaChamada", () => {
  it("chamada em andamento (endedAt null)", () => {
    const m = mensagem({ startedAt: "2026-01-01T10:00:00.000Z", endedAt: null, participantIds: ["u-nagai"] });
    expect(textoDaChamada(m, "nagai", espectador)).toBe("nagai iniciou uma chamada.");
  });

  it("sem m.call também é tratado como em andamento", () => {
    const m = mensagem(null);
    expect(textoDaChamada(m, "nagai", espectador)).toBe("nagai iniciou uma chamada.");
  });

  it("espectador que participou vê a duração, não a perda", () => {
    const m = mensagem({
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T15:00:00.000Z",
      participantIds: ["u-nagai", espectador],
    });
    expect(textoDaChamada(m, "nagai", espectador)).toBe(
      "nagai iniciou uma chamada que durou 5 horas.",
    );
  });

  it("espectador fora da chamada vê que perdeu", () => {
    const m = mensagem({
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T10:00:00.010Z",
      participantIds: ["u-nagai"],
    });
    expect(textoDaChamada(m, "nagai", espectador)).toBe(
      "Você perdeu uma chamada de nagai que durou alguns segundos.",
    );
    expect(chamadaPerdida(m, espectador)).toBe(true);
  });

  it("o autor nunca 'perde' a própria chamada", () => {
    const m = mensagem({
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T10:00:00.010Z",
      participantIds: ["u-nagai"],
    });
    expect(chamadaPerdida(m, "u-nagai")).toBe(false);
    expect(textoDaChamada(m, "nagai", "u-nagai")).toBe(
      "nagai iniciou uma chamada que durou alguns segundos.",
    );
  });

  it("sem espectadorId (prévia sem quem lê) nunca marca como perdida", () => {
    const m = mensagem({
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T10:00:00.010Z",
      participantIds: ["u-nagai"],
    });
    expect(chamadaPerdida(m, undefined)).toBe(false);
    expect(textoDaChamada(m, "nagai", undefined)).toBe(
      "nagai iniciou uma chamada que durou alguns segundos.",
    );
  });
});
