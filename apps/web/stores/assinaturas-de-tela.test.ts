import { VideoQuality } from "livekit-client";
import { describe, expect, it } from "vitest";
import { donoDaIdentidade, identidadeDeTela } from "@streamz/shared";
import {
  aplicarAssinaturas,
  assinaturaDaTela,
  chaveDoTileDeTela,
  type EstadoDeAssistir,
  type ParticipanteDeTela,
} from "./assinaturas-de-tela";

/**
 * A regressão que este arquivo prende: **a tela do próprio usuário ficava
 * preta no desktop**.
 *
 * A captura nativa entra na sala como um participante separado
 * (`<userId>#tela`), então do ponto de vista do meu cliente a minha
 * transmissão é *remota*. A regra do PR #108 desassinava toda tela cujo dono
 * não estivesse em `assistindo` — e ninguém entra em `assistindo` pela própria
 * tela. Resultado: `setSubscribed(false)` na própria transmissão, SFU parando
 * de encaminhar, `<video>` sem quadros.
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

describe("assinaturaDaTela", () => {
  it("assina a minha própria tela mesmo sem ninguém 'assistindo' (a regressão da 0.0.18)", () => {
    const chave = chaveDoTileDeTela(EU, "TR_1");
    expect(assinaturaDaTela(EU, chave, estado())).toEqual({
      assinar: true,
      qualidade: VideoQuality.HIGH,
    });
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
    const minha = chaveDoTileDeTela(EU, "TR_1");
    const dela = chaveDoTileDeTela(OUTRA, "TR_2");
    const assistindo = new Set([OUTRA]);
    // a dela está no destaque, a minha desceu para a faixa de 188×106
    expect(assinaturaDaTela(OUTRA, dela, estado({ assistindo, focado: dela })).qualidade).toBe(
      VideoQuality.HIGH,
    );
    expect(assinaturaDaTela(EU, minha, estado({ assistindo, focado: dela })).qualidade).toBe(
      VideoQuality.LOW,
    );
  });

  it("focar o tile da pessoa (a câmera) deixa as telas na faixa, em baixa", () => {
    const minha = chaveDoTileDeTela(EU, "TR_1");
    // a chave do tile de pessoa é o `userId` cru, sem o `:sid`
    expect(assinaturaDaTela(EU, minha, estado({ focado: OUTRA })).qualidade).toBe(VideoQuality.LOW);
  });

  it("sem sala (meuId nulo) ninguém vira 'minha tela'", () => {
    const chave = chaveDoTileDeTela(EU, "TR_1");
    expect(assinaturaDaTela(EU, chave, estado({ meuId: null })).assinar).toBe(false);
  });
});

describe("aplicarAssinaturas", () => {
  it("a minha tela nativa (`md#tela`) continua assinada; a de outra pessoa é desassinada", () => {
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
    // era aqui que a tela ficava preta: um `setSubscribed(false)` na minha
    expect(minha.chamadas.assinaturas).toEqual([]);
    expect(minha.isSubscribed).toBe(true);
    expect(minha.chamadas.qualidades).toEqual([VideoQuality.HIGH]);
    expect(dela.chamadas.assinaturas).toEqual([false]);
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
