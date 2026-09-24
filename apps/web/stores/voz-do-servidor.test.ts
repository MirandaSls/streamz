import type { VoiceStateEvent } from "@streamz/shared";
import { describe, expect, it } from "vitest";
import {
  FONTE_MICROFONE,
  meuSilencio,
  microfoneTravado,
  podePublicarMicrofone,
  transicaoDaTrava,
} from "./voz-do-servidor";

const CAMERA = 1;
const LIVRE = { serverMute: false, serverDeaf: false };

function estado(userId: string, extra: Partial<VoiceStateEvent> = {}): VoiceStateEvent {
  return {
    channelId: "voz-1",
    guildId: "g1",
    user: { id: userId } as VoiceStateEvent["user"],
    connected: true,
    muted: false,
    deafened: false,
    video: false,
    screen: false,
    ...extra,
  };
}

describe("podePublicarMicrofone", () => {
  it("sem permissão conhecida não trava", () => {
    expect(podePublicarMicrofone(undefined)).toBe(true);
  });

  it("lista de fontes vazia quer dizer todas", () => {
    expect(podePublicarMicrofone({ canPublish: true, canPublishSources: [] })).toBe(true);
  });

  it("recusa quando o microfone saiu da lista", () => {
    expect(podePublicarMicrofone({ canPublish: true, canPublishSources: [CAMERA] })).toBe(false);
    expect(
      podePublicarMicrofone({ canPublish: true, canPublishSources: [CAMERA, FONTE_MICROFONE] }),
    ).toBe(true);
  });

  it("canPublish falso recusa tudo", () => {
    expect(podePublicarMicrofone({ canPublish: false, canPublishSources: [] })).toBe(false);
  });
});

describe("microfoneTravado", () => {
  it("serverMute trava", () => {
    expect(microfoneTravado({ serverMute: true, serverDeaf: false }, undefined)).toBe(true);
  });

  it("serverDeaf também trava, como no Discord", () => {
    expect(microfoneTravado({ serverMute: false, serverDeaf: true }, undefined)).toBe(true);
  });

  it("estado já liberado mas LiveKit ainda sem a fonte continua travado", () => {
    expect(microfoneTravado(LIVRE, { canPublish: true, canPublishSources: [CAMERA] })).toBe(true);
  });

  it("liberado dos dois lados destrava", () => {
    expect(microfoneTravado(LIVRE, { canPublish: true, canPublishSources: [FONTE_MICROFONE] })).toBe(
      false,
    );
  });
});

describe("meuSilencio", () => {
  it("acha o meu estado pelo id, não pela posição", () => {
    const lista = [estado("bia", { serverMute: true }), estado("ana", { serverDeaf: true })];
    expect(meuSilencio(lista, "ana")).toEqual({ serverMute: false, serverDeaf: true });
  });

  it("ausente é não silenciado", () => {
    expect(meuSilencio(undefined, "ana")).toEqual(LIVRE);
    expect(meuSilencio([estado("bia", { serverMute: true })], "ana")).toEqual(LIVRE);
    expect(meuSilencio([estado("ana", { serverMute: true })], null)).toEqual(LIVRE);
  });
});

describe("transicaoDaTrava", () => {
  it("só age na transição", () => {
    expect(transicaoDaTrava(false, false)).toBeNull();
    expect(transicaoDaTrava(true, true)).toBeNull();
    expect(transicaoDaTrava(false, true)).toBe("fechar");
    expect(transicaoDaTrava(true, false)).toBe("reabrir");
  });
});
