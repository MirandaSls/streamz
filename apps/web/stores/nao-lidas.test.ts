import { describe, expect, it } from "vitest";
import { aoChegarMensagem, rotuloDoContador, somarNaoLidas } from "./nao-lidas";

describe("rotuloDoContador", () => {
  it("mostra o número até 99", () => {
    expect(rotuloDoContador(1)).toBe("1");
    expect(rotuloDoContador(99)).toBe("99");
  });

  it("acima de 99 vira 99+, como no Discord", () => {
    expect(rotuloDoContador(100)).toBe("99+");
    expect(rotuloDoContador(1234)).toBe("99+");
  });
});

describe("somarNaoLidas", () => {
  it("soma as conversas para o badge do rail", () => {
    expect(somarNaoLidas([{ unreadCount: 3 }, { unreadCount: 0 }, { unreadCount: 7 }])).toBe(10);
  });

  it("sem conversa (ou sem não lida) a soma é zero", () => {
    expect(somarNaoLidas([])).toBe(0);
    expect(somarNaoLidas([{ unreadCount: 0 }])).toBe(0);
  });
});

describe("aoChegarMensagem", () => {
  const dm = { lastMessageAt: "2026-09-01T00:00:00.000Z", mentionCount: 0, unreadCount: 2 };

  it("mensagem de outro conta como não lida", () => {
    const depois = aoChegarMensagem(dm, "2026-09-02T00:00:00.000Z", { mention: false, propria: false });
    expect(depois.unreadCount).toBe(3);
    expect(depois.mentionCount).toBe(0);
    expect(depois.lastMessageAt).toBe("2026-09-02T00:00:00.000Z");
  });

  it("menção de outro conta nas duas somas", () => {
    const depois = aoChegarMensagem(dm, "2026-09-02T00:00:00.000Z", { mention: true, propria: false });
    expect(depois.unreadCount).toBe(3);
    expect(depois.mentionCount).toBe(1);
  });

  it("a minha mensagem só move a conversa: não é não lida para mim", () => {
    const depois = aoChegarMensagem(dm, "2026-09-02T00:00:00.000Z", { mention: false, propria: true });
    expect(depois.unreadCount).toBe(2);
    expect(depois.mentionCount).toBe(0);
    expect(depois.lastMessageAt).toBe("2026-09-02T00:00:00.000Z");
  });
});
