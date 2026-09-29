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

import type { VoiceStateEvent } from "@streamz/shared";
import {
  folgaDaGrade,
  posicaoDoPalco,
  seloDaTransmissao,
  telaNoDestaque,
  temVideoNoPalco,
} from "./CallStage";

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
  it("no desktop reserva sempre: a cápsula cobre o que estiver por baixo sem a folga", () => {
    // print do usuário (2026-09-28): numa faixa de 199px a seta de expandir, a
    // cápsula de controles e os ícones do canto se encavalavam com o avatar e
    // o "Chamando…" quando a faixa não reservava a mesma altura que o palco
    // cheio e o expandido já reservavam
    expect(folgaDaGrade(false).split(" ")).toContain("pb-24");
  });

  it("a altura mínima continua valendo no desktop", () => {
    // sem `min-h-0` o item flexível volta a se medir pelo conteúdo, que é o
    // transbordo por cima da conversa das prints `image.pbg`/`aaa.pbg`
    expect(folgaDaGrade(false).split(" ")).toEqual(expect.arrayContaining(["min-h-0", "flex-1"]));
  });

  it("no celular as folgas são do `PalcoMobile`, que as tem por orientação", () => {
    const classes = folgaDaGrade(true).split(" ");
    expect(classes).not.toContain("pb-24");
    expect(classes).not.toContain("px-2");
  });
});

function estado(id: string, flags: Partial<Pick<VoiceStateEvent, "video" | "screen">>): VoiceStateEvent {
  return {
    channelId: "canal1",
    guildId: null,
    user: { id, username: id, displayName: id, avatarUrl: null, bot: false },
    connected: true,
    muted: false,
    deafened: false,
    video: flags.video ?? false,
    screen: flags.screen ?? false,
  } as unknown as VoiceStateEvent;
}

describe("temVideoNoPalco", () => {
  it("sem ninguém no canal não há vídeo", () => {
    expect(temVideoNoPalco([])).toBe(false);
  });

  it("chamada só de voz — ninguém com câmera nem tela — não conta como vídeo", () => {
    expect(temVideoNoPalco([estado("ana", {}), estado("bia", {})])).toBe(false);
  });

  it("uma câmera ligada entre várias pessoas já conta como vídeo", () => {
    expect(temVideoNoPalco([estado("ana", {}), estado("bia", { video: true })])).toBe(true);
  });

  it("uma transmissão de tela também conta como vídeo", () => {
    expect(temVideoNoPalco([estado("ana", { screen: true })])).toBe(true);
  });
});
