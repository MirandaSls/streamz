import { describe, expect, it } from "vitest";
import { MAX_SLOWMODE_SECONDS, slowmodeLabel, slowmodeRemaining } from "@streamz/shared";

/**
 * O cálculo do modo lento é a única lógica pura da feature e vive no contrato
 * compartilhado justamente porque os dois lados dependem dele: a API recusa o
 * envio com o mesmo número que o cliente mostra na contagem regressiva.
 */
describe("slowmodeRemaining", () => {
  const agora = new Date("2026-08-25T12:00:00.000Z");

  it("devolve 0 quando o modo lento está desligado", () => {
    expect(slowmodeRemaining(0, new Date("2026-08-25T11:59:59.000Z"), agora)).toBe(0);
  });

  it("devolve 0 quando o autor ainda não escreveu no canal", () => {
    expect(slowmodeRemaining(30, null, agora)).toBe(0);
  });

  it("devolve o que falta quando a última mensagem é recente", () => {
    expect(slowmodeRemaining(30, new Date("2026-08-25T11:59:50.000Z"), agora)).toBe(20);
  });

  it("arredonda para cima — nunca promete um envio que a API recusaria", () => {
    // faltam 20,5s: 20 deixaria o cliente tentar meio segundo cedo demais
    expect(slowmodeRemaining(30, new Date("2026-08-25T11:59:50.500Z"), agora)).toBe(21);
  });

  it("devolve 0 quando o intervalo já passou (inclusive na borda exata)", () => {
    expect(slowmodeRemaining(30, new Date("2026-08-25T11:59:30.000Z"), agora)).toBe(0);
    expect(slowmodeRemaining(30, new Date("2026-08-25T11:00:00.000Z"), agora)).toBe(0);
  });

  it("aceita data em texto (é assim que o DTO chega ao cliente)", () => {
    expect(slowmodeRemaining(10, "2026-08-25T11:59:55.000Z", agora)).toBe(5);
  });

  it("não trava com data inválida", () => {
    expect(slowmodeRemaining(10, "não é data", agora)).toBe(0);
  });
});

describe("slowmodeLabel", () => {
  it("rotula o teto e os presets como o Discord", () => {
    expect(slowmodeLabel(0)).toBe("Desligado");
    expect(slowmodeLabel(5)).toBe("5s");
    expect(slowmodeLabel(60)).toBe("1min");
    expect(slowmodeLabel(300)).toBe("5min");
    expect(slowmodeLabel(3600)).toBe("1h");
    expect(slowmodeLabel(MAX_SLOWMODE_SECONDS)).toBe("6h");
  });
});
