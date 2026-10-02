import { describe, expect, it } from "vitest";
import { desdeDoServidor, iniciaisDoServidor, rotuloDeMembros } from "./convite-cartao";

describe("cartão de convite", () => {
  it("iniciais mantêm a caixa e limitam a 4", () => {
    expect(iniciaisDoServidor("Servidor de Md")).toBe("SdM");
    expect(iniciaisDoServidor("  Um  Dois Tres Quatro Cinco ")).toBe("UDTQ");
    expect(iniciaisDoServidor("")).toBe("");
  });
  it("singular e plural de membros", () => {
    expect(rotuloDeMembros(1)).toBe("1 membro");
    expect(rotuloDeMembros(2)).toBe("2 membros");
    expect(rotuloDeMembros(0)).toBe("0 membros");
  });
  it("desde: mês abreviado e ano", () => {
    expect(desdeDoServidor("2026-10-02T12:00:00.000Z")).toBe("Desde out. de 2026");
    expect(desdeDoServidor("2025-06-15T12:00:00.000Z")).toBe("Desde jun. de 2025");
    expect(desdeDoServidor("lixo")).toBe("");
  });
});
