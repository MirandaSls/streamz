import { VideoQuality } from "livekit-client";
import { beforeEach, describe, expect, it } from "vitest";
import { donoDaIdentidade, identidadeDeTela } from "@streamz/shared";
import {
  aplicarAssinaturas,
  assinaturaDaTela,
  chaveDoTileDeTela,
  type EstadoDeAssistir,
  type ParticipanteDeTela,
  usePreviaDaMinhaTela,
} from "./assinaturas-de-tela";

/**
 * As duas histórias que este arquivo prende sobre **a minha própria tela no
 * desktop**, que entra na sala como um participante separado
 * (`<userId>#tela`) e por isso é *remota* para o meu cliente:
 *
 * - **0.0.18:** a regra desassinava a minha tela e o tile ficava **preto**,
 *   fingindo ter vídeo. O tile agora mostra o aviso "Você está compartilhando
 *   sua tela" e não depende da faixa.
 * - **1.2.1:** a correção daquela regressão assinava a minha tela sempre, em
 *   HIGH — 1440p30 devolvidos pelo SFU e decodificados na mesma máquina que
 *   captura e codifica. Agora ela só se assina quando eu peço, e em LOW.
 */

/** Uma publicação de tela de mentira, que anota o que pediram a ela. */
function faixa(trackSid: string, isSubscribed = true) {
  const chamadas = { assinaturas: [] as boolean[], qualidades: [] as VideoQuality[] };
  return {
    trackSid,
    get isSubscribed() {
      return isSubscribed;
    },
    setSubscribed(assinar: boolean) {
      isSubscribed = assinar;
      chamadas.assinaturas.push(assinar);
    },
    setVideoQuality(q: VideoQuality) {
      chamadas.qualidades.push(q);
    },
    chamadas,
  };
}

/**
 * Um participante da sala a partir da **identidade do LiveKit** — com ou sem o
 * sufixo `#tela`. É de propósito: o dono passa por `donoDaIdentidade`, que é a
 * tradução que faltava valer para mim mesmo.
 */
function participante(identity: string, telas: ReturnType<typeof faixa>[]): ParticipanteDeTela {
  return { dono: donoDaIdentidade(identity), telas, audios: [] };
}

const EU = "md";
const OUTRA = "ana";

function estado(patch: Partial<EstadoDeAssistir> = {}): EstadoDeAssistir {
  return { meuId: EU, assistindo: new Set(), previa: null, focado: null, ...patch };
}

beforeEach(() => usePreviaDaMinhaTela.setState({ chave: null }));

describe("assinaturaDaTela", () => {
  it("não assina a minha própria tela por padrão", () => {
    const chave = chaveDoTileDeTela(EU, "TR_1");
    expect(assinaturaDaTela(EU, chave, estado())).toEqual({ assinar: false, qualidade: null });
  });

  it("com a prévia pedida no tile, assina a minha tela em LOW", () => {
    const chave = chaveDoTileDeTela(EU, "TR_1");
    expect(assinaturaDaTela(EU, chave, estado({ previaDaMinhaTela: chave }))).toEqual({
      assinar: true,
      qualidade: VideoQuality.LOW,
    });
  });

  it("a prévia de uma transmissão anterior (outro trackSid) não assina a nova", () => {
    const antiga = chaveDoTileDeTela(EU, "TR_VELHA");
    const nova = chaveDoTileDeTela(EU, "TR_NOVA");
    expect(assinaturaDaTela(EU, nova, estado({ previaDaMinhaTela: antiga })).assinar).toBe(false);
  });

  it("a minha tela no destaque (clique) assina, mas continua em LOW", () => {
    const chave = chaveDoTileDeTela(EU, "TR_1");
    expect(assinaturaDaTela(EU, chave, estado({ focado: chave }))).toEqual({
      assinar: true,
      qualidade: VideoQuality.LOW,
    });
  });

  it("a miniatura do hover da minha tela assina em LOW", () => {
    const chave = chaveDoTileDeTela(EU, "TR_1");
    expect(assinaturaDaTela(EU, chave, estado({ previa: EU }))).toEqual({
      assinar: true,
      qualidade: VideoQuality.LOW,
    });
  });

  it("'assistindo' não liga a minha tela (o conjunto sobrevive ao fim da transmissão)", () => {
    const chave = chaveDoTileDeTela(EU, "TR_1");
    expect(assinaturaDaTela(EU, chave, estado({ assistindo: new Set([EU]) })).assinar).toBe(false);
  });

  it("focar outro tile não assina a minha tela", () => {
    const minha = chaveDoTileDeTela(EU, "TR_1");
    const dela = chaveDoTileDeTela(OUTRA, "TR_2");
    expect(assinaturaDaTela(EU, minha, estado({ focado: dela })).assinar).toBe(false);
  });

  it("não assina a tela de outra pessoa enquanto ninguém a abriu", () => {
    const chave = chaveDoTileDeTela(OUTRA, "TR_2");
    expect(assinaturaDaTela(OUTRA, chave, estado())).toEqual({ assinar: false, qualidade: null });
  });

  it("assina a tela escolhida, em alta", () => {
    const chave = chaveDoTileDeTela(OUTRA, "TR_2");
    expect(assinaturaDaTela(OUTRA, chave, estado({ assistindo: new Set([OUTRA]) }))).toEqual({
      assinar: true,
      qualidade: VideoQuality.HIGH,
    });
  });

  it("a miniatura do hover assina em baixa, e só ela", () => {
    const chave = chaveDoTileDeTela(OUTRA, "TR_2");
    expect(assinaturaDaTela(OUTRA, chave, estado({ previa: OUTRA }))).toEqual({
      assinar: true,
      qualidade: VideoQuality.LOW,
    });
  });

  it("no destaque do palco é alta; na faixa embaixo dele, baixa", () => {
    const dela = chaveDoTileDeTela(OUTRA, "TR_2");
    const doBia = chaveDoTileDeTela("bia", "TR_3");
    const assistindo = new Set([OUTRA, "bia"]);
    // a dela está no destaque, a da Bia desceu para a faixa de 188×106
    expect(assinaturaDaTela(OUTRA, dela, estado({ assistindo, focado: dela })).qualidade).toBe(
      VideoQuality.HIGH,
    );
    expect(assinaturaDaTela("bia", doBia, estado({ assistindo, focado: dela })).qualidade).toBe(
      VideoQuality.LOW,
    );
  });

  it("focar o tile da pessoa (a câmera) deixa as telas na faixa, em baixa", () => {
    const dela = chaveDoTileDeTela(OUTRA, "TR_2");
    // a chave do tile de pessoa é o `userId` cru, sem o `:sid`
    const assistindo = new Set([OUTRA]);
    expect(assinaturaDaTela(OUTRA, dela, estado({ assistindo, focado: OUTRA })).qualidade).toBe(
      VideoQuality.LOW,
    );
  });

  it("sem sala (meuId nulo) ninguém vira 'minha tela'", () => {
    const chave = chaveDoTileDeTela(EU, "TR_1");
    expect(assinaturaDaTela(EU, chave, estado({ meuId: null })).assinar).toBe(false);
  });
});

describe("aplicarAssinaturas", () => {
  it("desassina a minha tela nativa (`md#tela`) e a de outra pessoa que ninguém abriu", () => {
    const minha = faixa("TR_1");
    const dela = faixa("TR_2");
    aplicarAssinaturas(
      [
        participante(EU, []),
        participante(identidadeDeTela(EU), [minha]),
        participante(OUTRA, []),
        participante(identidadeDeTela(OUTRA), [dela]),
      ],
      estado(),
    );
    // o `autoSubscribe` a trouxe assinada: é a volta de 1440p que se corta
    expect(minha.chamadas.assinaturas).toEqual([false]);
    expect(minha.chamadas.qualidades).toEqual([]);
    expect(dela.chamadas.assinaturas).toEqual([false]);
  });

  it("'Ver prévia' (guardada na store) assina a minha tela em LOW; ocultar desassina", () => {
    const minha = faixa("TR_1", false);
    const sala = [participante(identidadeDeTela(EU), [minha])];
    usePreviaDaMinhaTela.setState({ chave: chaveDoTileDeTela(EU, "TR_1") });
    aplicarAssinaturas(sala, estado());
    expect(minha.chamadas.assinaturas).toEqual([true]);
    expect(minha.chamadas.qualidades).toEqual([VideoQuality.LOW]);

    usePreviaDaMinhaTela.setState({ chave: null });
    aplicarAssinaturas(sala, estado());
    expect(minha.chamadas.assinaturas).toEqual([true, false]);
    expect(minha.chamadas.qualidades).toEqual([VideoQuality.LOW]);
  });

  it("a tela de outra pessoa assistida continua em HIGH mesmo com a minha prévia ligada", () => {
    const minha = faixa("TR_1", false);
    const dela = faixa("TR_2", false);
    usePreviaDaMinhaTela.setState({ chave: chaveDoTileDeTela(EU, "TR_1") });
    aplicarAssinaturas(
      [participante(identidadeDeTela(EU), [minha]), participante(identidadeDeTela(OUTRA), [dela])],
      estado({ assistindo: new Set([OUTRA]) }),
    );
    expect(minha.chamadas.qualidades).toEqual([VideoQuality.LOW]);
    expect(dela.chamadas.qualidades).toEqual([VideoQuality.HIGH]);
  });

  it("encerrar a transmissão apaga a prévia guardada", () => {
    const minha = faixa("TR_1", false);
    usePreviaDaMinhaTela.setState({ chave: chaveDoTileDeTela(EU, "TR_1") });
    aplicarAssinaturas([participante(identidadeDeTela(EU), [minha])], estado());
    expect(usePreviaDaMinhaTela.getState().chave).toBe(chaveDoTileDeTela(EU, "TR_1"));

    // o `#tela` saiu da sala: não há mais publicação com aquela chave
    aplicarAssinaturas([participante(EU, [])], estado());
    expect(usePreviaDaMinhaTela.getState().chave).toBeNull();
  });

  it("sair da sala (meuId nulo) também apaga a prévia", () => {
    usePreviaDaMinhaTela.setState({ chave: chaveDoTileDeTela(EU, "TR_1") });
    aplicarAssinaturas([], estado({ meuId: null }));
    expect(usePreviaDaMinhaTela.getState().chave).toBeNull();
  });

  it("assinar de volta quando a pessoa escolhe assistir, sem mexer no que já está certo", () => {
    const dela = faixa("TR_2", false);
    aplicarAssinaturas([participante(identidadeDeTela(OUTRA), [dela])], estado());
    expect(dela.chamadas.assinaturas).toEqual([]);

    aplicarAssinaturas(
      [participante(identidadeDeTela(OUTRA), [dela])],
      estado({ assistindo: new Set([OUTRA]) }),
    );
    expect(dela.chamadas.assinaturas).toEqual([true]);
    expect(dela.chamadas.qualidades).toEqual([VideoQuality.HIGH]);
  });

  it("a tela do navegador, publicada no meu próprio participante, não é assinada por ninguém", () => {
    // no navegador a faixa é local e nem chega a esta lista (a store filtra por
    // `RemoteTrackPublication`): o participante existe, sem telas remotas
    const eu = participante(EU, []);
    expect(() => aplicarAssinaturas([eu], estado())).not.toThrow();
    expect(eu.telas).toEqual([]);
  });

  it("desassina o áudio da minha própria tela (eu já ouço pelo alto-falante)", () => {
    const calls: boolean[] = [];
    const meuAudio = { isSubscribed: true, setSubscribed: (a: boolean) => calls.push(a) };
    const audioDela = { isSubscribed: true, setSubscribed: () => calls.push(true) };
    aplicarAssinaturas(
      [
        { dono: EU, telas: [], audios: [meuAudio] },
        { dono: OUTRA, telas: [], audios: [audioDela] },
      ],
      estado(),
    );
    expect(calls).toEqual([false]);
  });

  it("com várias telas assistidas, cada uma decide sozinha", () => {
    const a = faixa("TR_A", false);
    const b = faixa("TR_B", false);
    aplicarAssinaturas(
      [
        participante(identidadeDeTela("ana"), [a]),
        participante(identidadeDeTela("bia"), [b]),
      ],
      estado({ assistindo: new Set(["ana"]) }),
    );
    expect(a.isSubscribed).toBe(true);
    expect(b.isSubscribed).toBe(false);
  });
});
