import { describe, expect, it } from "vitest";

import {
  chaveDaAcao,
  decidirServicoDeChamada,
  textoDaChamada,
  type SituacaoDeVoz,
} from "./servico-de-chamada";

function situacao(parcial: Partial<SituacaoDeVoz> = {}): SituacaoDeVoz {
  return {
    ehAndroid: true,
    status: "connected",
    channelId: "c1",
    guildId: "g1",
    channelName: "geral",
    ...parcial,
  };
}

describe("decidirServicoDeChamada", () => {
  it("liga o serviço quando a call de servidor conecta no Android", () => {
    expect(decidirServicoDeChamada(situacao())).toEqual({
      acao: "iniciar",
      titulo: "Streamz — em chamada em #geral",
      texto: "Toque para voltar à chamada",
    });
  });

  it("não faz nada fora do Android, nem para sair", () => {
    // Desktop, iOS e navegador não têm serviço para ligar — e também não podem
    // levar um `parar` a cada mudança da store de voz.
    expect(decidirServicoDeChamada(situacao({ ehAndroid: false }))).toEqual({ acao: "nada" });
    expect(
      decidirServicoDeChamada(situacao({ ehAndroid: false, channelId: null, status: "idle" })),
    ).toEqual({ acao: "nada" });
  });

  it("para quando não há mais canal", () => {
    expect(decidirServicoDeChamada(situacao({ channelId: null, status: "idle" }))).toEqual({
      acao: "parar",
    });
  });

  it("não liga antes de conectar", () => {
    expect(decidirServicoDeChamada(situacao({ status: "connecting" }))).toEqual({ acao: "nada" });
  });

  it("não desliga numa queda de mídia com o canal ainda de pé", () => {
    // `RoomEvent.Disconnected` deixa `status: "error"` com `channelId` — a
    // reconexão está a caminho e o processo precisa continuar protegido.
    expect(decidirServicoDeChamada(situacao({ status: "error" }))).toEqual({ acao: "nada" });
  });
});

describe("textoDaChamada", () => {
  it("usa o nome do canal do servidor", () => {
    expect(textoDaChamada({ guildId: "g1", channelName: "geral" }).titulo).toBe(
      "Streamz — em chamada em #geral",
    );
  });

  it("cai em #voz quando o canal do servidor chegou sem nome", () => {
    expect(textoDaChamada({ guildId: "g1", channelName: "" }).titulo).toBe(
      "Streamz — em chamada em #voz",
    );
  });

  it("omite o #canal em DM e grupo", () => {
    // A store não guarda o título da conversa; "em #" seria pior que nada.
    expect(textoDaChamada({ guildId: null, channelName: "" }).titulo).toBe(
      "Streamz — em chamada",
    );
  });
});

describe("chaveDaAcao", () => {
  it("separa ordens diferentes e junta as iguais", () => {
    const emGeral = decidirServicoDeChamada(situacao());
    const emGeralDeNovo = decidirServicoDeChamada(situacao());
    const emOutro = decidirServicoDeChamada(situacao({ channelName: "musica" }));

    expect(chaveDaAcao(emGeral)).toBe(chaveDaAcao(emGeralDeNovo));
    // Ser movido de canal sem sair da call precisa reescrever a notificação.
    expect(chaveDaAcao(emGeral)).not.toBe(chaveDaAcao(emOutro));
    expect(chaveDaAcao({ acao: "parar" })).not.toBe(chaveDaAcao({ acao: "nada" }));
  });
});
