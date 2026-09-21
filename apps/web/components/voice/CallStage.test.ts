import { describe, expect, it, vi } from "vitest";

/**
 * As duas contas puras do cabeçalho do palco: de quem é a transmissão em
 * destaque e o que o selo de qualidade pode afirmar.
 *
 * O componente em volta puxa LiveKit, socket e o mundo; aqui só se importa o
 * módulo, então as stores viram cascas — o que interessa são as funções.
 */
vi.mock("@/stores/voice", () => ({
  useVoice: Object.assign(() => undefined, { getState: () => ({}) }),
  participantesDe: () => [],
  telasDe: () => [],
}));

import { seloDaTransmissao, telaNoDestaque } from "./CallStage";

describe("telaNoDestaque", () => {
  it("separa dono e faixa da chave do tile de tela", () => {
    expect(telaNoDestaque("ana:TR_abc")).toEqual({ userId: "ana", trackSid: "TR_abc" });
  });

  it("ignora a chave de uma pessoa (sem `:`) e a grade sem destaque", () => {
    expect(telaNoDestaque("ana")).toBeNull();
    expect(telaNoDestaque(null)).toBeNull();
  });
});

describe("seloDaTransmissao", () => {
  it("junta resolução e taxa quando as duas são conhecidas (print p5)", () => {
    expect(seloDaTransmissao(720, 30)).toBe("720p 30FPS");
  });

  it("omite a taxa da tela de outra pessoa, que não trafega", () => {
    expect(seloDaTransmissao(1080, null)).toBe("1080p");
  });

  it("sem dimensão nenhuma não inventa número: só o 'Ao vivo' fica", () => {
    expect(seloDaTransmissao(undefined, null)).toBeNull();
  });
});
