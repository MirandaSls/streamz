import { afterEach, describe, expect, it, vi } from "vitest";
import { cronometroDeVoz } from "@/lib/tempos-de-voz";

/**
 * O cronômetro só precisa garantir duas coisas: que cada etapa mede o intervalo
 * **desde a anterior** (e não desde o início, que era o erro fácil) e que a
 * linha impressa é reconhecível no console de quem está depurando a demora.
 */
describe("cronometroDeVoz", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mede cada etapa desde a anterior, e o total desde o início", () => {
    const relogio = vi.spyOn(performance, "now");
    relogio.mockReturnValueOnce(1000); // criação
    const crono = cronometroDeVoz("entrarNaSala");
    const linhas: string[] = [];
    vi.spyOn(console, "debug").mockImplementation((...a: unknown[]) => void linhas.push(String(a[0])));

    relogio.mockReturnValueOnce(1200);
    crono.etapa("token");
    relogio.mockReturnValueOnce(1750);
    crono.etapa("room.connect");

    expect(linhas).toEqual([
      "[voz] entrarNaSala · token: 200ms (total 200ms)",
      "[voz] entrarNaSala · room.connect: 550ms (total 750ms)",
    ]);
  });

  it("o total não depende de nenhuma etapa ter sido marcada", () => {
    const relogio = vi.spyOn(performance, "now");
    relogio.mockReturnValueOnce(500);
    const crono = cronometroDeVoz("x");
    relogio.mockReturnValueOnce(4321);
    expect(crono.total()).toBe(3821);
  });
});
