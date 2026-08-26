import { describe, expect, it } from "vitest";
import { MAX_TIMEOUT_MINUTES, isTimedOut } from "@streamz/shared";
import { calcularFim, motivoDeBloqueio } from "./timeout";

const AGORA = new Date("2026-08-25T12:00:00.000Z").getTime();
const MINUTO = 60_000;

describe("castigo — quando ele bloqueia", () => {
  it("bloqueia enquanto a data está no futuro", () => {
    const fim = new Date(AGORA + 10 * MINUTO);
    expect(motivoDeBloqueio(fim, AGORA)).toMatch(/de castigo até/);
    expect(isTimedOut(fim.toISOString(), AGORA)).toBe(true);
  });

  it("não bloqueia quando a data já passou — histórico não é castigo", () => {
    const fim = new Date(AGORA - MINUTO);
    expect(motivoDeBloqueio(fim, AGORA)).toBeNull();
    expect(isTimedOut(fim.toISOString(), AGORA)).toBe(false);
  });

  it("não bloqueia sem data nenhuma", () => {
    expect(motivoDeBloqueio(null, AGORA)).toBeNull();
    expect(motivoDeBloqueio(undefined, AGORA)).toBeNull();
  });

  it("aceita a data em texto (ISO), como vem do banco pelo DTO", () => {
    const fim = new Date(AGORA + MINUTO).toISOString();
    expect(motivoDeBloqueio(fim, AGORA)).not.toBeNull();
  });

  it("diz até quando, e não só que está de castigo", () => {
    const fim = new Date(AGORA + 60 * MINUTO);
    const esperado = `${String(fim.getDate()).padStart(2, "0")}/${String(fim.getMonth() + 1).padStart(2, "0")}`;
    expect(motivoDeBloqueio(fim, AGORA)).toContain(esperado);
  });
});

describe("castigo — cálculo do fim", () => {
  it("soma os minutos do preset ao agora", () => {
    const r = calcularFim({ minutes: 5 }, AGORA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.until.getTime()).toBe(AGORA + 5 * MINUTO);
  });

  it("aceita uma data explícita no futuro", () => {
    const alvo = new Date(AGORA + 3 * MINUTO).toISOString();
    const r = calcularFim({ until: alvo }, AGORA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.until.toISOString()).toBe(alvo);
  });

  it("recusa duração zero, negativa ou ausente", () => {
    expect(calcularFim({ minutes: 0 }, AGORA).ok).toBe(false);
    expect(calcularFim({ minutes: -5 }, AGORA).ok).toBe(false);
    expect(calcularFim({}, AGORA).ok).toBe(false);
  });

  it("recusa data no passado e data inválida", () => {
    expect(calcularFim({ until: new Date(AGORA - MINUTO).toISOString() }, AGORA).ok).toBe(false);
    expect(calcularFim({ until: "ontem" }, AGORA).ok).toBe(false);
  });

  it("para no teto de 28 dias, pelos dois caminhos", () => {
    expect(calcularFim({ minutes: MAX_TIMEOUT_MINUTES }, AGORA).ok).toBe(true);
    expect(calcularFim({ minutes: MAX_TIMEOUT_MINUTES + 1 }, AGORA).ok).toBe(false);
    const longe = new Date(AGORA + (MAX_TIMEOUT_MINUTES + 1) * MINUTO).toISOString();
    expect(calcularFim({ until: longe }, AGORA).ok).toBe(false);
  });
});
