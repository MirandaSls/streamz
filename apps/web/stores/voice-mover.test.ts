import { describe, expect, it } from "vitest";
import { decidirMovido, podeSoltarEm, type ArrastoDeMembro } from "./voice-mover";

const arrasto: ArrastoDeMembro = { userId: "ana", deChannelId: "voz-1" };

describe("podeSoltarEm", () => {
  it("aceita outro canal de voz do mesmo servidor", () => {
    expect(podeSoltarEm(arrasto, { id: "voz-2", type: "VOICE" }, true)).toBe(true);
  });

  it("não acende no canal de onde a pessoa saiu", () => {
    expect(podeSoltarEm(arrasto, { id: "voz-1", type: "VOICE" }, true)).toBe(false);
  });

  it("canal de texto nunca aceita: a API recusaria depois do realce", () => {
    for (const type of ["TEXT", "ANNOUNCEMENT", "DM"]) {
      expect(podeSoltarEm(arrasto, { id: "geral", type }, true)).toBe(false);
    }
  });

  it("sem MOVE_MEMBERS nada acende", () => {
    expect(podeSoltarEm(arrasto, { id: "voz-2", type: "VOICE" }, false)).toBe(false);
  });

  it("sem arrasto em curso nada acende", () => {
    expect(podeSoltarEm(null, { id: "voz-2", type: "VOICE" }, true)).toBe(false);
  });
});

describe("decidirMovido", () => {
  const evento = { channelId: "voz-2", deChannelId: "voz-1" };

  it("troca de sala quando ainda estou no canal de origem", () => {
    expect(decidirMovido(evento, "voz-1")).toBe("trocar");
  });

  it("ignora se já estou no destino (o evento chegou duas vezes)", () => {
    expect(decidirMovido(evento, "voz-2")).toBe("ignorar");
  });

  it("ignora se saí da voz antes do evento chegar", () => {
    expect(decidirMovido(evento, null)).toBe("ignorar");
  });

  it("ignora se já entrei em outro canal por conta própria", () => {
    // notícia velha: refazer a sala aqui derrubaria uma conexão boa
    expect(decidirMovido(evento, "voz-9")).toBe("ignorar");
  });
});
