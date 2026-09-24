import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Track } from "livekit-client";
import type { VoiceStateEvent } from "@streamz/shared";

/**
 * A grade com a **minha própria tela** no ar, pelo navegador.
 *
 * O relato que abriu este teste: "a sua própria tela não aparece quando você
 * usa o Streamz pelo navegador". Ler o código não bastou — duas correções
 * saíram só da leitura e o defeito continuou —, então a sala do LiveKit entra
 * de mentira e a asserção é sobre o que a grade **desenha**: um card para a
 * pessoa e outro para a transmissão dela, com o selo "Ao vivo", como nas
 * prints do Discord no navegador (`p2`/`p4`/`p6`).
 *
 * Só a sala e as stores são falsas; a montagem dos tiles e o desenho do tile
 * são os de verdade. `telasDe`/`camerasDe`/`participantesDe` repetem aqui o
 * filtro do módulo real (`stores/voice.ts`) porque o `sala` de lá é privado e
 * só nasce dentro de `connect`.
 */

// ── a sala de mentira ──────────────────────────────────────────────────────

interface PubFalsa {
  kind: string;
  source: string;
  trackSid: string;
  track: unknown;
  isMuted: boolean;
}

interface ParticipanteFalso {
  identity: string;
  trackPublications: Map<string, PubFalsa>;
}

const falsas = vi.hoisted(() => {
  const sala: { participantes: { identity: string; trackPublications: Map<string, unknown> }[] } = {
    participantes: [],
  };
  const voz = {
    tick: 0,
    falando: new Set<string>(),
    focado: null as string | null,
    focoAutomatico: true,
    assistindo: new Set<string>(),
    volumes: {} as Record<string, number>,
    silenciados: {} as Record<string, boolean>,
    states: {} as Record<string, unknown[]>,
    statesOf: (channelId: string) => voz.states[channelId] ?? [],
    setFocado: vi.fn(),
    focarAutomaticamente: vi.fn(),
    assistir: vi.fn(),
    pararDeAssistir: vi.fn(),
    setVolume: vi.fn(),
    toggleSilenciado: vi.fn(),
    pararTela: vi.fn(),
  };
  const hook = <T,>(sel: (s: typeof voz) => T): T => sel(voz);
  return { sala, voz, useVoice: Object.assign(hook, { getState: () => voz }) };
});

/** Mesma conta de `donoDaIdentidade`: `<userId>#tela` pertence a `<userId>`. */
const dono = (identity: string) => identity.split("#")[0];

vi.mock("@/stores/voice", () => ({
  useVoice: falsas.useVoice,
  aplicarAssinaturasDeTela: vi.fn(),
  participantesDaSala: () => falsas.sala.participantes,
  participantesDe: (userId: string) =>
    falsas.sala.participantes.filter((p) => dono(p.identity) === userId),
  camerasDe: (p: ParticipanteFalso) =>
    Array.from(p.trackPublications.values()).filter(
      (pub) =>
        pub.kind === Track.Kind.Video && !!pub.track && !pub.isMuted && pub.source !== Track.Source.ScreenShare,
    ),
  telasDe: (p: ParticipanteFalso) =>
    Array.from(p.trackPublications.values()).filter(
      (pub) => pub.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare,
    ),
}));

vi.mock("@/stores/auth", () => ({
  useAuth: <T,>(sel: (s: { user: { id: string } }) => T) => sel({ user: { id: "ana" } }),
}));

vi.mock("@/stores/presence", () => ({
  usePresence: <T,>(sel: (s: { profiles: Record<string, unknown> }) => T) => sel({ profiles: {} }),
}));

vi.mock("@/stores/preferencias-por-participante", () => ({
  usePreferenciasPorParticipante: <T,>(sel: (s: { videosDesativados: Record<string, boolean> }) => T) =>
    sel({ videosDesativados: {} }),
}));

vi.mock("@/lib/cor-dominante", () => ({ useCorDominante: (_u: unknown, f: string) => f }));

vi.mock("@/components/voice/fullscreen", () => ({
  alternarTelaCheiaDe: vi.fn(),
  soltarTelaCheiaDe: vi.fn(),
  suportaTelaCheia: () => true,
}));

import VoiceGrid, { estiloDaTira, telaQueAssumeOPalco } from "./VoiceGrid";
import { larguraDaTira } from "./grid-layout";
import type { Tile } from "./TileDeVoz";

// ── cenário ────────────────────────────────────────────────────────────────

const CANAL = "canal1";

function estado(id: string, nome: string): VoiceStateEvent {
  return {
    channelId: CANAL,
    guildId: null,
    user: { id, username: nome, displayName: nome, avatarUrl: null, bot: false },
    muted: false,
    deafened: false,
    video: false,
    tela: false,
    reconnecting: false,
  } as unknown as VoiceStateEvent;
}

function participante(identity: string, pubs: PubFalsa[]): ParticipanteFalso {
  return { identity, trackPublications: new Map(pubs.map((p) => [p.trackSid, p])) };
}

function telaPublicada(trackSid: string): PubFalsa {
  return {
    kind: Track.Kind.Video,
    source: Track.Source.ScreenShare,
    trackSid,
    track: {},
    isMuted: false,
  };
}

beforeEach(() => {
  falsas.sala.participantes = [];
  falsas.voz.states = {};
  falsas.voz.focado = null;
  falsas.voz.focoAutomatico = true;
  falsas.voz.assistindo = new Set();
});

describe("a minha tela no navegador", () => {
  it("vira um card na grade, ao lado do card da pessoa", () => {
    falsas.voz.states = { [CANAL]: [estado("ana", "Ana"), estado("bia", "Bia")] };
    // navegador: a tela sobe no **meu próprio** participante, sem `#tela`
    falsas.sala.participantes = [
      participante("ana", [telaPublicada("sid1")]),
      participante("bia", []),
    ];

    const html = renderToStaticMarkup(<VoiceGrid channelId={CANAL} nomeDoCanal="Geral" />);

    expect(html).toContain('data-voice-tile="ana"');
    expect(html).toContain('data-voice-tile="bia"');
    // o card da transmissão: chave `<dono>:<trackSid>`
    expect(html).toContain('data-voice-tile="ana:sid1"');
    expect(html).toContain("Ao vivo");
  });

  it("continua na grade mesmo com outra pessoa no palco", () => {
    falsas.voz.states = { [CANAL]: [estado("ana", "Ana"), estado("bia", "Bia")] };
    falsas.sala.participantes = [
      participante("ana", [telaPublicada("sid1")]),
      participante("bia", []),
    ];
    falsas.voz.focado = "bia";

    const html = renderToStaticMarkup(<VoiceGrid channelId={CANAL} nomeDoCanal="Geral" />);

    expect(html).toContain('data-voice-tile="ana:sid1"');
  });

  it("não leva ícone de ação nenhum por cima da transmissão", () => {
    falsas.voz.states = { [CANAL]: [estado("ana", "Ana")] };
    falsas.sala.participantes = [participante("ana", [telaPublicada("sid1")])];

    const html = renderToStaticMarkup(<VoiceGrid channelId={CANAL} nomeDoCanal="Geral" />);
    // a tela é o último tile da grade (a pessoa vem antes): do marcador dela
    // até o fim do HTML é o card de tela e nada mais
    const cardDaTela = html.slice(html.indexOf('data-voice-tile="ana:sid1"'));

    // prints `p2`/`p4`/`p6`: sobre um card de tela o Discord só desenha o selo
    // "AO VIVO" — nem "Parar transmissão", nem "Tela cheia", nem "…"
    for (const rotulo of ["Parar transmissão", "Tela cheia", "Colocar no palco", "Mais opções"]) {
      expect(cardDaTela).not.toContain(rotulo);
    }
    expect(cardDaTela).toContain("Ao vivo");
    // paridade com o Discord: o card da pessoa também não leva ação nenhuma
    // por cima — só o menu do botão direito
    expect(html).not.toContain("Colocar no palco");
    expect(html).not.toContain("Mais opções");
  });
});

// ── a regra do palco automático, à parte ───────────────────────────────────

/**
 * O efeito que a aplica não roda em `renderToStaticMarkup`, e é justamente ele
 * que mandava a minha tela para o destaque. A regra virou função pura para
 * poder ser afirmada aqui.
 */
describe("telaQueAssumeOPalco", () => {
  const tile = (p: Partial<Tile> & { key: string; userId: string }): Tile =>
    ({
      state: estado(p.userId, p.userId),
      publication: null,
      tela: false,
      assistindo: false,
      comVideo: false,
      ...p,
    }) as Tile;

  it("não promove a minha própria tela — ela é um card da grade (print p2)", () => {
    const tiles = [
      tile({ key: "ana", userId: "ana" }),
      tile({ key: "ana:sid1", userId: "ana", tela: true, assistindo: true, comVideo: true }),
    ];
    expect(telaQueAssumeOPalco(tiles, "ana")).toBeNull();
  });

  it("nem a minha tela da captura nativa do desktop", () => {
    const tiles = [
      tile({
        key: "ana:sid1",
        userId: "ana",
        tela: true,
        assistindo: true,
        comVideo: true,
        minhaTelaNativa: true,
      }),
    ];
    expect(telaQueAssumeOPalco(tiles, "ana")).toBeNull();
  });

  it("promove a tela de outra pessoa que eu escolhi assistir", () => {
    const tiles = [
      tile({ key: "ana:sid1", userId: "ana", tela: true, assistindo: true }),
      tile({ key: "bia:sid2", userId: "bia", tela: true, assistindo: true }),
    ];
    expect(telaQueAssumeOPalco(tiles, "ana")?.key).toBe("bia:sid2");
  });

  it("não promove transmissão que eu ainda não abri", () => {
    const tiles = [tile({ key: "bia:sid2", userId: "bia", tela: true })];
    expect(telaQueAssumeOPalco(tiles, "ana")).toBeNull();
  });
});

/**
 * A faixa de chamada sobre a conversa não comporta destaque + tira.
 *
 * O palco aqui nunca é medido (`renderToStaticMarkup` não roda efeito, e não há
 * `ResizeObserver`), que é o mesmo caso de "área ainda não medida" de
 * `palcoUsaFoco`: a resposta é a grade. O que se afirma é o que o defeito
 * mostrava — com o foco ligado, a tira de 106px aparecia **sozinha** e a
 * transmissão sumia.
 *
 * A tabela-verdade de quando cada arranjo vale (faixa × área medida) é do
 * `grid-layout.test.ts`, que testa a decisão sem depender de medida nenhuma.
 */
describe("o palco cai para a grade quando o foco não cabe", () => {
  it("não desenha a tira de miniaturas", () => {
    falsas.voz.states = { [CANAL]: [estado("ana", "Ana"), estado("bia", "Bia")] };
    falsas.sala.participantes = [
      participante("ana", [telaPublicada("sid1")]),
      participante("bia", []),
    ];
    falsas.voz.focado = "bia";

    const html = renderToStaticMarkup(<VoiceGrid channelId={CANAL} nomeDoCanal="Geral" />);

    expect(html).not.toContain("height:106px");
  });

  it("não perde o tile que estava no palco", () => {
    falsas.voz.states = { [CANAL]: [estado("ana", "Ana"), estado("bia", "Bia")] };
    falsas.sala.participantes = [
      participante("ana", [telaPublicada("sid1")]),
      participante("bia", []),
    ];
    falsas.voz.focado = "bia";

    const html = renderToStaticMarkup(<VoiceGrid channelId={CANAL} nomeDoCanal="Geral" />);

    // os três continuam na grade: a pessoa focada, a outra e a transmissão
    for (const chave of ["ana", "bia", "ana:sid1"]) {
      expect(html).toContain(`data-voice-tile="${chave}"`);
    }
  });
});

/**
 * **A grade entrega o leiaute em retângulos absolutos.**
 *
 * Era isto que faltava para haver transição: com fileiras de flexbox, quem
 * entra na chamada muda a *contagem* de filhos, e contagem não interpola — o
 * leiaute trocava seco. Com cada tile em `position: absolute` e o retângulo no
 * `style`, a mudança vira interpolação de `top/left/width/height`, que é o que
 * o Signal Desktop faz na mesma tela (ver `TRANSICAO_DE_REFLOW`).
 *
 * Aqui o palco nunca é medido (`renderToStaticMarkup` não roda efeito e não há
 * `ResizeObserver`), então os números saem zerados de propósito; o que se
 * afirma é a **forma** de entrega. As coordenadas de verdade são do
 * `grid-layout.test.ts`, que as calcula sem depender de render.
 */
describe("a grade posiciona cada tile de forma absoluta", () => {
  function palcoDeTres() {
    falsas.voz.states = { [CANAL]: [estado("ana", "Ana"), estado("bia", "Bia")] };
    falsas.sala.participantes = [
      participante("ana", [telaPublicada("sid1")]),
      participante("bia", []),
    ];
    return renderToStaticMarkup(<VoiceGrid channelId={CANAL} nomeDoCanal="Geral" />);
  }

  it("o palco é o contexto de posicionamento, e não mais uma pilha de fileiras", () => {
    const html = palcoDeTres();
    expect(html).toContain('class="relative h-full min-h-0 overflow-hidden"');
  });

  it("cada célula leva top/left/width/height no estilo", () => {
    const html = palcoDeTres();
    // os invólucros da grade são os únicos `class="absolute"` sem mais nada —
    // os `absolute` de dentro do tile sempre vêm acompanhados (`inset-0`,
    // `pointer-events-none`, …)
    const envoltorios = html.match(/<div class="absolute" style="[^"]*"/g) ?? [];
    // duas pessoas e a transmissão de uma delas
    expect(envoltorios).toHaveLength(3);
    for (const envoltorio of envoltorios) {
      for (const lado of ["left:", "top:", "width:", "height:"]) {
        expect(envoltorio).toContain(lado);
      }
    }
  });

  it("o primeiro quadro, ainda sem medida, não leva transição", () => {
    // ligá-la antes da primeira medida faria cada tile **inflar de 0×0** ao
    // entrar na chamada: o quadro anterior é o palco não medido
    expect(palcoDeTres()).not.toContain("transition:");
  });
});

/**
 * **A tira do modo foco anima a largura, e não só as miniaturas.**
 *
 * Quem centraliza a tira é o `justify-center` do pai, e o que ele mede é a
 * largura do invólucro. Com ela mudando em corte seco enquanto o `left` das
 * miniaturas interpolava, o bloco saltava de lado num quadro e a miniatura
 * sobrevivente deslizava na direção contrária ao salto — movimento errado
 * exatamente no caso que a transição queria suavizar. O desenho não dá para
 * afirmar sem navegador; o contrato que chega ao DOM, dá.
 */
describe("a tira de miniaturas do palco", () => {
  it("põe a largura na mesma transição das miniaturas", () => {
    const estilo = estiloDaTira(3, true);

    expect(estilo.width).toBe(larguraDaTira(3));
    // o token é o mesmo de `TRANSICAO_DE_REFLOW`, e é ele que o
    // `prefers-reduced-motion` zera
    expect(estilo.transition).toContain("width var(--mov-reflow)");
  });

  it("encolhe quando perde uma miniatura — é essa largura que o pai recentraliza", () => {
    expect(estiloDaTira(2, true).width).toBeLessThan(estiloDaTira(3, true).width);
  });

  it("sem animação não leva transição nenhuma, como os tiles", () => {
    expect(estiloDaTira(3, false).transition).toBeUndefined();
  });
});
