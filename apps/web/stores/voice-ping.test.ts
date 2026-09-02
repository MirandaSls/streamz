import { describe, expect, it } from "vitest";
import {
  qualidadeDaCall,
  qualidadePeloPing,
  rotuloDoPing,
  rttDoRelatorio,
  type EstatisticaDeConexao,
} from "./voice-ping";

/** Um relatório como o Chromium entrega: `transport` aponta para o par em uso. */
const relatorioDoChromium: EstatisticaDeConexao[] = [
  { type: "candidate-pair", id: "P1", currentRoundTripTime: 0.21, nominated: false, state: "succeeded" },
  { type: "candidate-pair", id: "P2", currentRoundTripTime: 0.034, nominated: true, state: "succeeded" },
  { type: "transport", id: "T1", selectedCandidatePairId: "P2" },
  { type: "inbound-rtp", id: "I1" },
];

describe("rttDoRelatorio", () => {
  it("lê o RTT do par que o transport selecionou, em ms", () => {
    expect(rttDoRelatorio(relatorioDoChromium)).toBe(34);
  });

  it("sem transport, vale o par nomeado e em succeeded (Firefox)", () => {
    const semTransport = relatorioDoChromium.filter((s) => s.type !== "transport");
    expect(rttDoRelatorio(semTransport)).toBe(34);
  });

  it("arredonda para o inteiro mais próximo", () => {
    expect(
      rttDoRelatorio([
        { type: "transport", id: "T", selectedCandidatePairId: "P" },
        { type: "candidate-pair", id: "P", currentRoundTripTime: 0.0126 },
      ]),
    ).toBe(13);
  });

  it("null quando ainda não há medida (par sem RTT, relatório vazio, transport órfão)", () => {
    expect(rttDoRelatorio([])).toBeNull();
    expect(
      rttDoRelatorio([
        { type: "transport", id: "T", selectedCandidatePairId: "P" },
        { type: "candidate-pair", id: "P", nominated: true, state: "succeeded" },
      ]),
    ).toBeNull();
    expect(rttDoRelatorio([{ type: "transport", id: "T", selectedCandidatePairId: "nada" }])).toBeNull();
  });

  it("aceita o iterável de um RTCStatsReport (Map.values())", () => {
    const mapa = new Map(relatorioDoChromium.map((s) => [s.id, s]));
    expect(rttDoRelatorio(mapa.values())).toBe(34);
  });
});

describe("qualidade", () => {
  it("faixas de ping", () => {
    expect(qualidadePeloPing(34)).toBe("excelente");
    expect(qualidadePeloPing(100)).toBe("excelente");
    expect(qualidadePeloPing(180)).toBe("boa");
    expect(qualidadePeloPing(400)).toBe("ruim");
  });

  it("o sinal do LiveKit manda; sem ele o ping decide; sem nada, null", () => {
    expect(qualidadeDaCall(400, "excelente")).toBe("excelente");
    expect(qualidadeDaCall(400, null)).toBe("ruim");
    expect(qualidadeDaCall(null, null)).toBeNull();
  });
});

describe("rotuloDoPing", () => {
  it("mostra o ping, ou 'Medindo…' enquanto não há medida", () => {
    expect(rotuloDoPing(34)).toBe("Ping: 34 ms");
    expect(rotuloDoPing(null)).toBe("Medindo…");
  });
});
