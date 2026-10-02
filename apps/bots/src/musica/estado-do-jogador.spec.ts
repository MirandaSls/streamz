import { describe, expect, it, vi } from "vitest";
import {
  esperarAte,
  estaOcioso,
  estaSendoDestruido,
  zerarJogadorOcioso,
  type JogadorReiniciavel,
} from "./estado-do-jogador";

function falso(parcial: Partial<JogadorReiniciavel> = {}): JogadorReiniciavel {
  const dados = new Map<string, unknown>();
  return {
    paused: true,
    playing: true,
    repeatMode: "track",
    lastPosition: 91_000,
    lastPositionChange: 123,
    queue: { current: null, tracks: [], previous: ["a", "b"] },
    getData: (c) => dados.get(c),
    setData: (c, v) => dados.set(c, v),
    ...parcial,
  };
}

describe("estaOcioso", () => {
  it("é ocioso sem faixa atual e sem fila", () => {
    expect(estaOcioso(falso())).toBe(true);
  });
  it("não é ocioso com faixa tocando ou na fila", () => {
    expect(estaOcioso(falso({ queue: { current: {}, tracks: [], previous: [] } }))).toBe(false);
    expect(estaOcioso(falso({ queue: { current: null, tracks: [{}], previous: [] } }))).toBe(false);
  });
});

describe("zerarJogadorOcioso", () => {
  it("zera pausa, repetição, posição e histórico", () => {
    const j = falso();
    zerarJogadorOcioso(j);
    expect(j.paused).toBe(false);
    expect(j.playing).toBe(false);
    expect(j.repeatMode).toBe("off");
    expect(j.lastPosition).toBe(0);
    expect(j.lastPositionChange).toBeNull();
    expect(j.queue.previous).toEqual([]);
  });

  it("cancela o timer de fila vazia", () => {
    vi.useFakeTimers();
    try {
      const j = falso();
      const aoDisparar = vi.fn();
      j.setData("internal_queueempty", setTimeout(aoDisparar, 30_000));
      zerarJogadorOcioso(j);
      vi.advanceTimersByTime(60_000);
      expect(aoDisparar).not.toHaveBeenCalled();
      expect(j.getData("internal_queueempty")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("estaSendoDestruido", () => {
  it("lê a marca interna da lib", () => {
    const j = falso();
    expect(estaSendoDestruido(j)).toBe(false);
    j.setData("internal_destroystatus", true);
    expect(estaSendoDestruido(j)).toBe(true);
  });
});

describe("esperarAte", () => {
  it("devolve true assim que a condição vale", async () => {
    let n = 0;
    expect(await esperarAte(() => ++n >= 3, 1_000, 5)).toBe(true);
  });
  it("devolve false no estouro do limite", async () => {
    expect(await esperarAte(() => false, 30, 5)).toBe(false);
  });
});
