import { describe, expect, it } from "vitest";
import { STATUS_DURATIONS, statusExpiry, statusUpdateSchema } from "@streamz/shared";
import { toPublicUser } from "../../common/dto";

// Lógica pura da duração do status manual; fica na API (o shared não roda vitest).
describe("statusExpiry", () => {
  const agora = new Date("2026-10-01T12:00:00.000Z");

  it("forever não expira", () => {
    expect(statusExpiry("forever", agora)).toBeNull();
  });

  it("soma o prazo exato sobre o instante", () => {
    const esperado = { "15m": 15 * 60_000, "1h": 3_600_000, "8h": 8 * 3_600_000, "24h": 86_400_000, "3d": 3 * 86_400_000 };
    for (const [d, ms] of Object.entries(esperado)) {
      expect(statusExpiry(d as keyof typeof esperado, agora)?.getTime()).toBe(agora.getTime() + ms);
    }
  });

  it("toda opção da lista tem expiração definida", () => {
    expect(STATUS_DURATIONS.map((d) => d.value)).toEqual(["15m", "1h", "8h", "24h", "3d", "forever"]);
  });
});

describe("statusUpdateSchema", () => {
  it("duration ausente vira forever (IDLE automático da web)", () => {
    expect(statusUpdateSchema.parse({ manualStatus: "IDLE" })).toEqual({ manualStatus: "IDLE", duration: "forever" });
  });
  it("aceita null e recusa valores inválidos", () => {
    expect(statusUpdateSchema.safeParse({ manualStatus: null }).success).toBe(true);
    expect(statusUpdateSchema.safeParse({ manualStatus: "X" }).success).toBe(false);
    expect(statusUpdateSchema.safeParse({ manualStatus: "DND", duration: "2h" }).success).toBe(false);
  });
});

describe("toPublicUser.manualStatusExpiresAt", () => {
  const base = { id: "u", username: "u", displayName: null, avatarUrl: null, status: "DND" as const };
  const agora = new Date("2026-10-01T12:00:00.000Z");
  it("expõe ISO quando vigente", () => {
    const f = new Date(agora.getTime() + 1000);
    expect(toPublicUser({ ...base, manualStatusExpiresAt: f }, agora).manualStatusExpiresAt).toBe(f.toISOString());
  });
  it("vencido ou ausente vira null", () => {
    expect(toPublicUser({ ...base, manualStatusExpiresAt: agora }, agora).manualStatusExpiresAt).toBeNull();
    expect(toPublicUser(base, agora).manualStatusExpiresAt).toBeNull();
  });
});
