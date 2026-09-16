import { describe, expect, it } from "vitest";
import { migrarRuido, RUIDO_PADRAO } from "../ruido-padrao";

describe("migrarRuido", () => {
  it("o padrão novo é a supressão avançada", () => {
    expect(RUIDO_PADRAO).toBe("avancada");
  });

  it("quem estava no padrão antigo sobe para avançada", () => {
    expect(migrarRuido("padrao", false)).toEqual({ nivel: "avancada", mudou: true });
  });

  it("respeita quem desligou de propósito", () => {
    expect(migrarRuido("off", false)).toEqual({ nivel: "off", mudou: false });
  });

  it("não mexe em quem já estava em avançada", () => {
    expect(migrarRuido("avancada", false)).toEqual({ nivel: "avancada", mudou: false });
  });

  it("depois de migrado, não religa ninguém", () => {
    expect(migrarRuido("padrao", true)).toEqual({ nivel: "padrao", mudou: false });
  });
});
