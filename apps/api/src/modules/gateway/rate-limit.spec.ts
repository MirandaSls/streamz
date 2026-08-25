import { describe, expect, it } from "vitest";
import { newBucket, takeToken, type BucketLimit } from "./rate-limit";

const limite: BucketLimit = { capacity: 3, refillPerSecond: 1 };

describe("takeToken", () => {
  it("deixa passar a rajada até a capacidade e barra a seguinte", () => {
    const t0 = 1_000_000;
    const balde = newBucket(limite, t0);
    expect(takeToken(balde, limite, t0)).toBe(true);
    expect(takeToken(balde, limite, t0)).toBe(true);
    expect(takeToken(balde, limite, t0)).toBe(true);
    expect(takeToken(balde, limite, t0)).toBe(false);
  });

  it("repõe com o tempo, na taxa configurada", () => {
    const t0 = 1_000_000;
    const balde = newBucket(limite, t0);
    for (let i = 0; i < 3; i++) takeToken(balde, limite, t0);

    // meio segundo não rende um token inteiro
    expect(takeToken(balde, limite, t0 + 500)).toBe(false);
    // um segundo depois do último consumo, rende exatamente um
    expect(takeToken(balde, limite, t0 + 1500)).toBe(true);
    expect(takeToken(balde, limite, t0 + 1500)).toBe(false);
  });

  it("não acumula acima da capacidade por muito tempo parado", () => {
    const t0 = 1_000_000;
    const balde = newBucket(limite, t0);
    takeToken(balde, limite, t0);

    // uma hora parado: o balde enche, mas não passa da capacidade
    const depois = t0 + 3_600_000;
    expect(takeToken(balde, limite, depois)).toBe(true);
    expect(takeToken(balde, limite, depois)).toBe(true);
    expect(takeToken(balde, limite, depois)).toBe(true);
    expect(takeToken(balde, limite, depois)).toBe(false);
  });

  it("aguenta relógio andando para trás sem liberar token extra", () => {
    const t0 = 1_000_000;
    const balde = newBucket(limite, t0);
    for (let i = 0; i < 3; i++) takeToken(balde, limite, t0);
    expect(takeToken(balde, limite, t0 - 10_000)).toBe(false);
  });
});
