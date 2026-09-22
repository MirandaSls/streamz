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

import { folgaDaGrade, posicaoDoPalco, seloDaTransmissao, telaNoDestaque } from "./CallStage";

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

describe("posicaoDoPalco", () => {
  it("na faixa o palco é item flexível que **cabe** na altura do invólucro", () => {
    const classes = posicaoDoPalco(false).split(" ");
    // o defeito das prints `image.pbg`/`aaa.pbg`: sem `min-h-0` o mínimo
    // automático do item flexível vira o min-content do palco (destaque 16:9 +
    // tira + folga dos controles) e ele transborda por cima da conversa
    expect(classes).toContain("min-h-0");
    expect(classes).toContain("flex-1");
    expect(classes).toContain("relative");
    expect(classes).not.toContain("absolute");
  });

  it("expandido sai do fluxo e cobre a região de conteúdo", () => {
    const classes = posicaoDoPalco(true).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["absolute", "inset-0", "z-20"]));
    // `relative` prenderia o palco onde ele está; `flex-1` só vale para item
    // de flex, e posicionado ele não é mais um
    expect(classes).not.toContain("relative");
    expect(classes).not.toContain("flex-1");
  });
});

describe("folgaDaGrade", () => {
  it("na faixa não reserva altura: a grade se centraliza e a cápsula flutua", () => {
    // print `2026-09-21 às 15.04.09`: faixa de 372,5 reais com a fileira
    // centrada (~86 acima, ~93 abaixo). Com `pb-24` ela subiria 48px, e os
    // mesmos 96 numa faixa de 199 deixavam 103 de área útil para tiles que o
    // Discord desenha com 193 de altura
    expect(folgaDaGrade(false, true, false).split(" ")).not.toContain("pb-24");
  });

  it("no palco cheio e no expandido a reserva fica: embaixo mora a tira", () => {
    // a tira de miniaturas do modo foco não flutua nem se esconde — coberta
    // pela cápsula, deixa de ser clicável
    expect(folgaDaGrade(false, false, false).split(" ")).toContain("pb-24");
    expect(folgaDaGrade(false, true, true).split(" ")).toContain("pb-24");
  });

  it("a altura da faixa continua valendo em todos os modos", () => {
    for (const classes of [
      folgaDaGrade(false, true, false),
      folgaDaGrade(false, false, false),
      folgaDaGrade(true, true, false),
    ]) {
      // sem `min-h-0` o item flexível volta a se medir pelo conteúdo, que é o
      // transbordo por cima da conversa das prints `image.pbg`/`aaa.pbg`
      expect(classes.split(" ")).toEqual(expect.arrayContaining(["min-h-0", "flex-1"]));
    }
  });

  it("no celular as folgas são do `PalcoMobile`, que as tem por orientação", () => {
    const classes = folgaDaGrade(true, true, false).split(" ");
    expect(classes).not.toContain("pb-24");
    expect(classes).not.toContain("px-2");
  });
});
