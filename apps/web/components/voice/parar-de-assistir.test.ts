import { describe, expect, it } from "vitest";
import { podePararDeAssistir } from "./parar-de-assistir";

describe("podePararDeAssistir", () => {
  it("não deixa quando não é uma tela", () => {
    expect(podePararDeAssistir({ tela: false, assistindo: true, sou: false })).toBe(false);
  });

  it("não deixa quando eu ainda não escolhi assistir", () => {
    expect(podePararDeAssistir({ tela: true, assistindo: false, sou: false })).toBe(false);
  });

  it("não deixa na minha própria transmissão", () => {
    expect(podePararDeAssistir({ tela: true, assistindo: true, sou: true })).toBe(false);
  });

  it("não deixa na minha tela nativa (essa sai por 'Ocultar prévia')", () => {
    expect(
      podePararDeAssistir({ tela: true, assistindo: true, sou: false, minhaTelaNativa: true }),
    ).toBe(false);
  });

  it("deixa numa tela alheia que eu escolhi assistir", () => {
    expect(podePararDeAssistir({ tela: true, assistindo: true, sou: false })).toBe(true);
  });
});
