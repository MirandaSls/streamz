import { describe, expect, it } from "vitest";
import {
  ALTURA_MIN,
  ALTURA_PADRAO,
  LARGURA_MIN,
  LARGURA_PADRAO,
  PALCO_MIN,
  RESERVA_CHAT_MIN,
  alturaDoPalco,
  larguraDoChat,
  larguraGuardavel,
  orientacaoDaChamada,
  proporcaoDaAlturaAntiga,
  proporcaoPadrao,
  reservaDoChat,
  tetoDoChat,
  tetoDoPalco,
} from "./call-split-layout";

describe("orientação da chamada", () => {
  it("conversa direta e grupo: faixa em cima", () => {
    expect(orientacaoDaChamada(null)).toBe("vertical");
    expect(orientacaoDaChamada(undefined)).toBe("vertical");
  });

  it("canal de voz de servidor: coluna à direita", () => {
    expect(orientacaoDaChamada("guild-1")).toBe("horizontal");
  });

  it("é a regressão do #108: DM não pode cair no leiaute de servidor", () => {
    expect(orientacaoDaChamada(null)).not.toBe(orientacaoDaChamada("guild-1"));
  });
});

describe("reserva da conversa", () => {
  it("é proporcional quando há altura de sobra", () => {
    expect(reservaDoChat(1000)).toBe(280);
  });

  it("cai no piso em coluna baixa, senão o composer é esmagado", () => {
    expect(reservaDoChat(400)).toBe(RESERVA_CHAT_MIN);
  });
});

describe("altura do palco", () => {
  it("a faixa abre com a altura medida na print, não com uma fração da coluna", () => {
    // é o que os quatro prints de DM mostram: 199px em janelas de 714 a 914
    expect(ALTURA_PADRAO).toBe(199);
    expect(alturaDoPalco(proporcaoPadrao(714), 714)).toBeCloseTo(ALTURA_PADRAO, 5);
    expect(alturaDoPalco(proporcaoPadrao(914), 914)).toBeCloseTo(ALTURA_PADRAO, 5);
  });

  it("cresce junto com a coluna quando a preferência é proporção", () => {
    // mesma preferência (50%), telas diferentes: o palco tem de acompanhar
    expect(alturaDoPalco(0.5, 700)).toBe(350);
    expect(alturaDoPalco(0.5, 1300)).toBe(650);
  });

  it("nunca engole a conversa", () => {
    expect(alturaDoPalco(0.99, 1000)).toBe(tetoDoPalco(1000));
    expect(tetoDoPalco(1000)).toBe(720);
  });

  it("nunca fica menor que a faixa medida", () => {
    expect(alturaDoPalco(0.01, 1000)).toBe(ALTURA_MIN);
    expect(ALTURA_MIN).toBe(ALTURA_PADRAO);
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

describe("largura da conversa (canal de voz)", () => {
  it("deixa o palco com o piso dele", () => {
    expect(tetoDoChat(1600)).toBe(1600 - PALCO_MIN);
  });

  it("em coluna curta o piso da conversa vence o do palco", () => {
    expect(tetoDoChat(500)).toBe(LARGURA_MIN);
  });

  it("respeita a preferência quando cabe", () => {
    expect(larguraDoChat(LARGURA_PADRAO, 1900)).toBe(LARGURA_PADRAO);
  });

  it("não engole o palco nem some de vez", () => {
    expect(larguraDoChat(1800, 1900)).toBe(1900 - PALCO_MIN);
    expect(larguraDoChat(40, 1900)).toBe(LARGURA_MIN);
  });

  it("sem medida ainda, devolve o padrão medido na print", () => {
    expect(larguraDoChat(999, 0)).toBe(LARGURA_PADRAO);
  });

  it("largura guardável ignora lixo e extremos", () => {
    expect(larguraGuardavel(520)).toBe(520);
    expect(larguraGuardavel(Number.NaN)).toBeNull();
    expect(larguraGuardavel(12)).toBeNull();
    expect(larguraGuardavel(4000)).toBeNull();
  });
});
