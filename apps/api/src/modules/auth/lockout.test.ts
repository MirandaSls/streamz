import { describe, expect, it } from "vitest";
import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILED_ATTEMPTS } from "@streamz/shared";
import {
  aposAcerto,
  aposFalha,
  estaBloqueada,
  minutosRestantes,
  semMudanca,
  type EstadoDeBloqueio,
} from "./lockout";

const AGORA = new Date("2026-08-26T12:00:00.000Z");
const limpo: EstadoDeBloqueio = { failedLogins: 0, lockedUntil: null };

function minutosDepois(minutos: number): Date {
  return new Date(AGORA.getTime() + minutos * 60_000);
}

describe("estaBloqueada", () => {
  it("é falsa sem bloqueio e quando o prazo já passou", () => {
    expect(estaBloqueada(limpo, AGORA)).toBe(false);
    expect(estaBloqueada({ failedLogins: 0, lockedUntil: minutosDepois(-1) }, AGORA)).toBe(false);
  });

  it("é verdadeira enquanto o prazo não vence", () => {
    expect(estaBloqueada({ failedLogins: 0, lockedUntil: minutosDepois(1) }, AGORA)).toBe(true);
  });
});

describe("minutosRestantes", () => {
  it("arredonda para cima e zera quando não há bloqueio", () => {
    expect(minutosRestantes({ failedLogins: 0, lockedUntil: minutosDepois(14.2) }, AGORA)).toBe(15);
    expect(minutosRestantes(limpo, AGORA)).toBe(0);
  });
});

describe("aposFalha", () => {
  it("conta as falhas até um passo antes do teto", () => {
    let estado: EstadoDeBloqueio = limpo;
    for (let i = 1; i < LOGIN_MAX_FAILED_ATTEMPTS; i += 1) {
      estado = aposFalha(estado, AGORA);
      expect(estado.failedLogins).toBe(i);
      expect(estado.lockedUntil).toBeNull();
    }
  });

  it("no teto tranca pelo prazo e zera o contador", () => {
    let estado: EstadoDeBloqueio = limpo;
    for (let i = 0; i < LOGIN_MAX_FAILED_ATTEMPTS; i += 1) estado = aposFalha(estado, AGORA);
    expect(estado.failedLogins).toBe(0);
    expect(estado.lockedUntil?.getTime()).toBe(minutosDepois(LOGIN_LOCK_MINUTES).getTime());
    expect(minutosRestantes(estado, AGORA)).toBe(LOGIN_LOCK_MINUTES);
  });

  it("tentar durante o bloqueio não estende o prazo", () => {
    const trancada: EstadoDeBloqueio = { failedLogins: 0, lockedUntil: minutosDepois(10) };
    const depois = aposFalha(trancada, AGORA);
    expect(depois).toEqual(trancada);
  });

  it("depois de vencido, o bloqueio recomeça do zero (não a cada falha)", () => {
    const vencida: EstadoDeBloqueio = { failedLogins: 0, lockedUntil: minutosDepois(-1) };
    const depois = aposFalha(vencida, AGORA);
    expect(depois).toEqual({ failedLogins: 1, lockedUntil: null });
  });

  it("respeita teto e prazo customizados", () => {
    const depois = aposFalha({ failedLogins: 1, lockedUntil: null }, AGORA, 2, 5);
    expect(depois.lockedUntil?.getTime()).toBe(minutosDepois(5).getTime());
  });
});

describe("aposAcerto", () => {
  it("zera contador e bloqueio", () => {
    expect(aposAcerto()).toEqual({ failedLogins: 0, lockedUntil: null });
  });
});

describe("semMudanca", () => {
  it("evita o UPDATE do caso comum: conta limpa que acertou a senha", () => {
    expect(semMudanca(limpo, aposAcerto())).toBe(true);
  });

  it("pede gravação quando o contador ou o prazo mudam", () => {
    expect(semMudanca({ failedLogins: 2, lockedUntil: null }, aposAcerto())).toBe(false);
    expect(semMudanca(limpo, { failedLogins: 0, lockedUntil: minutosDepois(15) })).toBe(false);
  });

  it("compara o instante do bloqueio, não a instância de Date", () => {
    const estado: EstadoDeBloqueio = { failedLogins: 0, lockedUntil: minutosDepois(15) };
    expect(semMudanca(estado, { failedLogins: 0, lockedUntil: minutosDepois(15) })).toBe(true);
  });
});
