import { describe, expect, it } from "vitest";
import { ouvintesRemotos } from "./audio-remoto";

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
