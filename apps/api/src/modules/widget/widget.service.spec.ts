import { describe, expect, it } from "vitest";
import { Permission } from "@streamz/shared";
import { canaisVisiveisAoEveryone, escolherConviteValido } from "./widget.service";

const canal = (id: string, position: number, overrides: { roleId: string | null; deny: number }[] = []) => ({
  id,
  name: id,
  position,
  overrides: overrides.map((o) => ({ ...o, userId: null })),
});

describe("canaisVisiveisAoEveryone", () => {
  it("esconde canal com deny de VIEW para o @everyone", () => {
    const r = canaisVisiveisAoEveryone(
      [canal("a", 1), canal("b", 0, [{ roleId: "ev", deny: Permission.VIEW_CHANNEL }])],
      "ev",
      Permission.VIEW_CHANNEL,
    );
    expect(r.map((c) => c.id)).toEqual(["a"]);
  });
  it("deny de outro cargo não esconde", () => {
    const r = canaisVisiveisAoEveryone(
      [canal("a", 0, [{ roleId: "outro", deny: Permission.VIEW_CHANNEL }])],
      "ev",
      Permission.VIEW_CHANNEL,
    );
    expect(r).toHaveLength(1);
  });
  it("sem VIEW no @everyone, nada aparece", () => {
    expect(canaisVisiveisAoEveryone([canal("a", 0)], "ev", 0)).toEqual([]);
  });
  it("ordena por position", () => {
    const r = canaisVisiveisAoEveryone([canal("b", 2), canal("a", 1)], "ev", Permission.VIEW_CHANNEL);
    expect(r.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("escolherConviteValido", () => {
  const base = { temporary: false, expiresAt: null, maxUses: null, uses: 0 };
  it("pula expirado, esgotado e temporário", () => {
    const r = escolherConviteValido(
      [
        { ...base, code: "exp", expiresAt: new Date(1000) },
        { ...base, code: "esg", maxUses: 1, uses: 1 },
        { ...base, code: "tmp", temporary: true },
        { ...base, code: "ok" },
      ],
      5000,
    );
    expect(r).toBe("ok");
  });
  it("null quando não há convite válido", () => {
    expect(escolherConviteValido([])).toBeNull();
  });
});
