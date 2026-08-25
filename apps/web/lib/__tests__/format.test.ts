import { describe, expect, it } from "vitest";
import { continuaAnterior, diasAtras, horaCompleta, mesmoDia, rotuloDoDia } from "../format";

const agora = new Date(2026, 7, 25, 15, 0, 0); // 25/08/2026 15:00 local
const iso = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe("datas no formato do Discord", () => {
  it("hoje, ontem e data completa", () => {
    expect(horaCompleta(iso(2026, 8, 25, 14, 3), agora)).toBe("Hoje às 14:03");
    expect(horaCompleta(iso(2026, 8, 24, 9, 12), agora)).toBe("Ontem às 09:12");
    expect(horaCompleta(iso(2026, 8, 12, 14, 3), agora)).toBe("12/08/2026 14:03");
  });

  it("rótulo do divisor", () => {
    expect(rotuloDoDia(iso(2026, 8, 25), agora)).toBe("Hoje");
    expect(rotuloDoDia(iso(2026, 8, 24), agora)).toBe("Ontem");
    expect(rotuloDoDia(iso(2026, 8, 12), agora)).toMatch(/12 de agosto de 2026/);
  });

  it("dias atrás conta por dia civil, não por 24h", () => {
    expect(diasAtras(iso(2026, 8, 24, 23, 59), agora)).toBe(1);
    expect(mesmoDia(iso(2026, 8, 25, 0, 1), iso(2026, 8, 25, 23, 59))).toBe(true);
  });
});

describe("agrupamento de mensagens", () => {
  const base = { author: { id: "a" }, parentId: null };
  it("agrupa o mesmo autor dentro de 7 minutos", () => {
    const anterior = { ...base, createdAt: iso(2026, 8, 25, 14, 0) };
    expect(continuaAnterior(anterior, { ...base, createdAt: iso(2026, 8, 25, 14, 6) })).toBe(true);
    expect(continuaAnterior(anterior, { ...base, createdAt: iso(2026, 8, 25, 14, 8) })).toBe(false);
  });
  it("não agrupa autor diferente, dia diferente nem thread diferente", () => {
    const anterior = { ...base, createdAt: iso(2026, 8, 25, 23, 58) };
    expect(
      continuaAnterior(anterior, { author: { id: "b" }, parentId: null, createdAt: iso(2026, 8, 25, 23, 59) }),
    ).toBe(false);
    expect(continuaAnterior(anterior, { ...base, createdAt: iso(2026, 8, 26, 0, 1) })).toBe(false);
    expect(continuaAnterior(anterior, { ...base, parentId: "p", createdAt: iso(2026, 8, 25, 23, 59) })).toBe(false);
    expect(continuaAnterior(undefined, anterior)).toBe(false);
  });
});
