import { describe, expect, it } from "vitest";
import {
  customStatusExpiry,
  customStatusOf,
  isSystemMessage,
  systemMessageText,
  type Message,
} from "@newdisc/shared";

/**
 * Lógica pura do contrato social (d-social). Fica aqui, e não numa suíte do
 * `packages/shared` (que não roda vitest), porque é a API quem grava o prazo do
 * status personalizado — e um erro aqui vira status que nunca expira.
 */

describe("customStatusExpiry", () => {
  // 2026-08-25 é uma terça-feira, 14:30 local
  const agora = new Date(2026, 7, 25, 14, 30, 0);

  it('"never" não expira', () => {
    expect(customStatusExpiry("never", agora)).toBeNull();
  });

  it('"1h" e "4h" somam a hora cheia sobre o instante', () => {
    expect(customStatusExpiry("1h", agora)?.getTime()).toBe(agora.getTime() + 3_600_000);
    expect(customStatusExpiry("4h", agora)?.getTime()).toBe(agora.getTime() + 4 * 3_600_000);
  });

  it('"today" vence na meia-noite seguinte', () => {
    const d = customStatusExpiry("today", agora)!;
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('"week" vence na meia-noite do próximo domingo', () => {
    const d = customStatusExpiry("week", agora)!;
    expect(d.getDay()).toBe(0);
    expect(d.getDate()).toBe(30);
    expect(d.getHours()).toBe(0);
  });

  it('"week" num domingo avança uma semana inteira, não expira na hora', () => {
    const domingo = new Date(2026, 7, 30, 10, 0, 0);
    const d = customStatusExpiry("week", domingo)!;
    expect(d.getTime()).toBeGreaterThan(domingo.getTime());
    expect(d.getDate()).toBe(6); // 6 de setembro, domingo seguinte
  });
});

describe("customStatusOf", () => {
  it("junta emoji e texto; ausência dos dois é null", () => {
    expect(customStatusOf({ customStatusEmoji: "🎧", customStatusText: "ouvindo" })).toBe("🎧 ouvindo");
    expect(customStatusOf({ customStatusEmoji: null, customStatusText: "ocupado" })).toBe("ocupado");
    expect(customStatusOf({ customStatusEmoji: "🌴", customStatusText: null })).toBe("🌴");
    expect(customStatusOf({ customStatusEmoji: null, customStatusText: "   " })).toBeNull();
    expect(customStatusOf({ customStatusEmoji: null, customStatusText: null })).toBeNull();
  });
});

describe("mensagens de sistema", () => {
  const base = (type: Message["type"], content: string) => ({ type, content });

  it("só as SYSTEM_* são de sistema", () => {
    expect(isSystemMessage(base("DEFAULT", "oi"))).toBe(false);
    expect(isSystemMessage(base("SYSTEM_MEMBER_ADDED", "ana"))).toBe(true);
  });

  it("monta a linha a partir do autor e do conteúdo", () => {
    expect(systemMessageText(base("SYSTEM_MEMBER_ADDED", "ana"), "bruno")).toBe(
      "bruno adicionou ana ao grupo.",
    );
    expect(systemMessageText(base("SYSTEM_MEMBER_REMOVED", "ana"), "bruno")).toBe(
      "bruno removeu ana do grupo.",
    );
    expect(systemMessageText(base("SYSTEM_MEMBER_LEFT", ""), "ana")).toBe("ana saiu do grupo.");
    expect(systemMessageText(base("SYSTEM_GROUP_RENAMED", "Time"), "ana")).toBe(
      "ana mudou o nome do grupo para Time.",
    );
    expect(systemMessageText(base("SYSTEM_GROUP_RENAMED", ""), "ana")).toBe(
      "ana removeu o nome do grupo.",
    );
    expect(systemMessageText(base("SYSTEM_GROUP_ICON", ""), "ana")).toBe(
      "ana mudou o ícone do grupo.",
    );
  });

  it("mensagem comum devolve o próprio conteúdo", () => {
    expect(systemMessageText(base("DEFAULT", "bom dia"), "ana")).toBe("bom dia");
  });
});
