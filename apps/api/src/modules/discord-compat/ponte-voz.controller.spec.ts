import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { VozDoGateway } from "./gateway/voz";
import { conferirSegredoDaPonte, PonteDeVozController } from "./ponte-voz.controller";

/**
 * A rota interna da ponte (§4 do CONTRATO-F2).
 *
 * O que estes testes prendem:
 *
 * - **segredo ausente → 503**, e não "liberado". Aqui não existe a conveniência
 *   de dev que o `METRICS_TOKEN` tem: um endpoint que desconecta bots de voz
 *   aberto por comodidade seria um botão de derrubar chamada exposto.
 * - **segredo errado → 401**, sem tocar no estado de voz.
 * - **segredo certo → 204** e o bot sai da sala.
 * - a comparação é de **tempo constante** (`timingSafeEqual`) — o teste prende o
 *   comportamento; o `===` que vazaria o prefixo está proibido no código.
 */

const SEGREDO = "segredo-da-ponte-de-voz";

function ambiente() {
  const feitos: string[] = [];
  const voz = {
    async desconectarPelaPonte(bot: string, canal: string) {
      feitos.push(`desconectar:${bot}:${canal}`);
      return true;
    },
  } as unknown as VozDoGateway;
  return { controller: new PonteDeVozController(voz), feitos };
}

const CORPO = { bot: "1420000000000000000", canal: "1419000000000000000", conectado: false };

describe("conferirSegredoDaPonte", () => {
  it("distingue os três casos, e comprimento diferente nunca é 'ok'", () => {
    expect(conferirSegredoDaPonte(SEGREDO, SEGREDO)).toBe("ok");
    expect(conferirSegredoDaPonte("outro", SEGREDO)).toBe("negado");
    expect(conferirSegredoDaPonte(`${SEGREDO}x`, SEGREDO)).toBe("negado");
    expect(conferirSegredoDaPonte(undefined, SEGREDO)).toBe("negado");
    expect(conferirSegredoDaPonte(SEGREDO, undefined)).toBe("desligado");
    expect(conferirSegredoDaPonte(SEGREDO, "   ")).toBe("desligado");
  });

  it("um prefixo certo não vale mais que um prefixo errado", () => {
    // O ponto do `timingSafeEqual`: quase acertar não é acertar, e o tempo de
    // resposta não pode contar quanto faltou.
    expect(conferirSegredoDaPonte(SEGREDO.slice(0, -1) + "!", SEGREDO)).toBe("negado");
  });
});

describe("POST /api/interno/ponte-voz/estado", () => {
  beforeEach(() => {
    process.env.PONTE_VOZ_SEGREDO = SEGREDO;
  });
  afterEach(() => {
    delete process.env.PONTE_VOZ_SEGREDO;
  });

  it("com o segredo certo, tira o bot da sala", async () => {
    const { controller, feitos } = ambiente();
    await expect(controller.estado(SEGREDO, CORPO)).resolves.toBeUndefined();
    expect(feitos).toEqual([`desconectar:${CORPO.bot}:${CORPO.canal}`]);
  });

  it("com o segredo errado, 401 e nada acontece", async () => {
    const { controller, feitos } = ambiente();
    await expect(controller.estado("nao-e-esse", CORPO)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(feitos).toEqual([]);
  });

  it("sem cabeçalho nenhum, 401", async () => {
    const { controller, feitos } = ambiente();
    await expect(controller.estado(undefined, CORPO)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(feitos).toEqual([]);
  });

  it("sem PONTE_VOZ_SEGREDO na configuração, 503 — nunca liberado", async () => {
    delete process.env.PONTE_VOZ_SEGREDO;
    const { controller, feitos } = ambiente();
    await expect(controller.estado(SEGREDO, CORPO)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(feitos).toEqual([]);
  });

  it("`conectado: true` é aceito e ignorado: quem põe o bot na sala é o op 4", async () => {
    const { controller, feitos } = ambiente();
    await expect(controller.estado(SEGREDO, { ...CORPO, conectado: true })).resolves.toBeUndefined();
    expect(feitos).toEqual([]);
  });
});
