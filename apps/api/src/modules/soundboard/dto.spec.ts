import { describe, expect, it } from "vitest";
import { volumeDoEnvio } from "./dto";

describe("volumeDoEnvio", () => {
  it("vale 1 quando o campo não veio (cliente antigo, padrão da coluna)", () => {
    expect(volumeDoEnvio(undefined)).toBe(1);
    expect(volumeDoEnvio(null)).toBe(1);
    expect(volumeDoEnvio("")).toBe(1);
    expect(volumeDoEnvio("   ")).toBe(1);
  });

  it("converte o texto do multipart em número", () => {
    expect(volumeDoEnvio("0.5")).toBe(0.5);
    expect(volumeDoEnvio("0,25")).toBe(0.25);
    expect(volumeDoEnvio("0")).toBe(0);
    expect(volumeDoEnvio("1")).toBe(1);
    expect(volumeDoEnvio(0.75)).toBe(0.75);
  });

  it("recusa fora de 0..1 e o que não é número", () => {
    expect(volumeDoEnvio("1.01")).toBeNull();
    expect(volumeDoEnvio("-0.1")).toBeNull();
    expect(volumeDoEnvio("abc")).toBeNull();
    expect(volumeDoEnvio("0.5abc")).toBeNull();
    expect(volumeDoEnvio("NaN")).toBeNull();
    expect(volumeDoEnvio("Infinity")).toBeNull();
    expect(volumeDoEnvio(["0.5"])).toBeNull();
    expect(volumeDoEnvio(2)).toBeNull();
  });
});
