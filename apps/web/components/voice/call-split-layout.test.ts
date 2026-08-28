import { describe, expect, it } from "vitest";
import {
  ALTURA_MIN,
  RESERVA_CHAT_MIN,
  alturaDoPalco,
  proporcaoDaAlturaAntiga,
  reservaDoChat,
  tetoDoPalco,
} from "./call-split-layout";

describe("reserva da conversa", () => {
  it("é proporcional quando há altura de sobra", () => {
    expect(reservaDoChat(1000)).toBe(280);
  });

  it("cai no piso em coluna baixa, senão o composer é esmagado", () => {
    expect(reservaDoChat(400)).toBe(RESERVA_CHAT_MIN);
  });
});

describe("altura do palco", () => {
  it("cresce junto com a coluna — é o bug que motivou tudo isto", () => {
    // mesma preferência (50%), telas diferentes: o palco tem de acompanhar
    const notebook = alturaDoPalco(0.5, 700);
    const monitor = alturaDoPalco(0.5, 1300);
    expect(monitor).toBeGreaterThan(notebook);
    expect(notebook).toBe(350);
    expect(monitor).toBe(650);
  });

  it("nunca engole a conversa", () => {
    expect(alturaDoPalco(0.99, 1000)).toBe(tetoDoPalco(1000));
    expect(tetoDoPalco(1000)).toBe(720);
  });

  it("nunca fica menor que um rosto", () => {
    expect(alturaDoPalco(0.01, 1000)).toBe(ALTURA_MIN);
  });

  it("em coluna curta o piso do palco vence a reserva do chat", () => {
    expect(tetoDoPalco(300)).toBe(ALTURA_MIN);
  });
});

describe("migração da altura salva em pixel", () => {
  it("converte a preferência antiga em fração da coluna", () => {
    expect(proporcaoDaAlturaAntiga(350, 700)).toBeCloseTo(0.5);
  });

  it("ignora valor fora da faixa sensata (janela minúscula, não preferência)", () => {
    expect(proporcaoDaAlturaAntiga(60, 1000)).toBeNull();
    expect(proporcaoDaAlturaAntiga(980, 1000)).toBeNull();
  });

  it("ignora lixo e coluna ainda não medida", () => {
    expect(proporcaoDaAlturaAntiga(Number.NaN, 1000)).toBeNull();
    expect(proporcaoDaAlturaAntiga(0, 1000)).toBeNull();
    expect(proporcaoDaAlturaAntiga(350, 0)).toBeNull();
  });
});
