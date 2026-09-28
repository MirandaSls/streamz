import { describe, expect, it } from "vitest";
import { mixDaFaixa, ouvintesRemotos, saidaEscolhida, usarGrafoDeGanho } from "./audio-remoto";

const estado = (id: string) => ({ user: { id } });

describe("ouvintesRemotos", () => {
  it("nunca inclui a mim: o meu microfone não volta pelo alto-falante", () => {
    expect(ouvintesRemotos([estado("eu"), estado("ana")], ["eu", "ana"], "eu")).toEqual(["ana"]);
  });

  it("junta o estado de voz e a sala de mídia sem repetir ninguém", () => {
    expect(ouvintesRemotos([estado("ana"), estado("bia")], ["bia", "caio"], "eu")).toEqual([
      "ana",
      "bia",
      "caio",
    ]);
  });

  it("mantém quem está na sala de mídia mesmo sem estado de voz", () => {
    // é o caso da reconexão do socket: o estado some por um instante, a faixa
    // de áudio não — e o <audio> dela não pode desmontar nesse meio-tempo
    expect(ouvintesRemotos([], ["ana"], "eu")).toEqual(["ana"]);
  });

  it("vazio fora de chamada", () => {
    expect(ouvintesRemotos([], [], undefined)).toEqual([]);
  });
});

describe("saidaEscolhida", () => {
  it("null e \"default\" são a saída padrão", () => {
    expect(saidaEscolhida(null)).toBe(false);
    expect(saidaEscolhida("default")).toBe(false);
    expect(saidaEscolhida("abc123")).toBe(true);
  });
});

describe("usarGrafoDeGanho", () => {
  const base = {
    volume: 1.5,
    outputId: null as string | null,
    temWebAudio: true,
    contextoTemSinkId: false,
    grafoExiste: false,
    recusado: false,
  };

  it("não monta até 100%: o volume do elemento basta", () => {
    expect(usarGrafoDeGanho({ ...base, volume: 1 })).toBe(false);
  });

  it("monta acima de 100% na saída padrão, mesmo sem setSinkId no contexto", () => {
    expect(usarGrafoDeGanho(base)).toBe(true);
  });

  it("com saída escolhida, só monta se o contexto souber apontar para ela", () => {
    expect(usarGrafoDeGanho({ ...base, outputId: "fone" })).toBe(false);
    expect(usarGrafoDeGanho({ ...base, outputId: "fone", contextoTemSinkId: true })).toBe(true);
  });

  it("desmonta um grafo existente se a saída escolhida não puder ser seguida", () => {
    expect(usarGrafoDeGanho({ ...base, grafoExiste: true, outputId: "fone" })).toBe(false);
  });

  it("mantém o grafo ao voltar para ≤100%", () => {
    expect(usarGrafoDeGanho({ ...base, volume: 0.5, grafoExiste: true })).toBe(true);
  });

  it("sem Web Audio ou depois de falhar, fica no elemento", () => {
    expect(usarGrafoDeGanho({ ...base, temWebAudio: false })).toBe(false);
    expect(usarGrafoDeGanho({ ...base, recusado: true })).toBe(false);
  });
});

describe("mixDaFaixa", () => {
  it("calado cala o elemento e o ganho", () => {
    expect(mixDaFaixa({ calado: true, volume: 2, grafoTocando: true })).toEqual({
      muted: true,
      volumeDoElemento: 0,
      ganho: 0,
    });
    expect(mixDaFaixa({ calado: true, volume: 0.5, grafoTocando: false })).toEqual({
      muted: true,
      volumeDoElemento: 0,
      ganho: 0,
    });
  });

  it("com o grafo tocando, o elemento só consome e o ganho leva o volume", () => {
    expect(mixDaFaixa({ calado: false, volume: 1.8, grafoTocando: true })).toEqual({
      muted: true,
      volumeDoElemento: 0,
      ganho: 1.8,
    });
  });

  it("sem grafo tocando (ausente ou suspenso), o elemento toca limitado a 100%", () => {
    expect(mixDaFaixa({ calado: false, volume: 1.8, grafoTocando: false })).toEqual({
      muted: false,
      volumeDoElemento: 1,
      ganho: 0,
    });
    expect(mixDaFaixa({ calado: false, volume: 0.4, grafoTocando: false })).toEqual({
      muted: false,
      volumeDoElemento: 0.4,
      ganho: 0,
    });
  });

  it("volume negativo vira 0", () => {
    expect(mixDaFaixa({ calado: false, volume: -1, grafoTocando: false }).volumeDoElemento).toBe(0);
  });
});
