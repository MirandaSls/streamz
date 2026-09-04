import { describe, expect, it } from "vitest";
import { microfoneAbrindo } from "@/components/voice/estado-do-microfone";

/**
 * O rótulo "Ativando microfone…" da barra de controles.
 *
 * O caso que dá nome ao teste é o último: sem a conta da mídia, uma instalação
 * sem LiveKit ficaria com o botão de microfone preso em "abrindo" para sempre —
 * ali não há faixa nenhuma para subir, e a sala continua valendo.
 */
describe("microfoneAbrindo", () => {
  it("fora de chamada não há microfone subindo", () => {
    expect(
      microfoneAbrindo({ status: "idle", midiaDisponivel: false, microfonePronto: false }),
    ).toBe(false);
  });

  it("enquanto a sala conecta, sim", () => {
    expect(
      microfoneAbrindo({ status: "connecting", midiaDisponivel: false, microfonePronto: false }),
    ).toBe(true);
  });

  it("na sala, com mídia e sem faixa ainda: é a janela do #144", () => {
    expect(
      microfoneAbrindo({ status: "connected", midiaDisponivel: true, microfonePronto: false }),
    ).toBe(true);
  });

  it("faixa publicada encerra a janela", () => {
    expect(
      microfoneAbrindo({ status: "connected", midiaDisponivel: true, microfonePronto: true }),
    ).toBe(false);
  });

  it("sala sem LiveKit não fica 'abrindo' para sempre", () => {
    expect(
      microfoneAbrindo({ status: "connected", midiaDisponivel: false, microfonePronto: false }),
    ).toBe(false);
  });

  it("queda de mídia não deixa o rótulo aceso", () => {
    expect(
      microfoneAbrindo({ status: "error", midiaDisponivel: false, microfonePronto: false }),
    ).toBe(false);
  });
});
