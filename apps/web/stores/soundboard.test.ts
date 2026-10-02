import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundboardPlayEvent, SoundboardSound } from "@streamz/shared";

// o arquivo de áudio em si não interessa aqui: só se a store o mandou tocar
const { tocarEfeitoSonoro } = vi.hoisted(() => ({ tocarEfeitoSonoro: vi.fn() }));
vi.mock("@/lib/soundboard-audio", () => ({ tocarEfeitoSonoro }));
vi.mock("@/lib/api", () => ({ api: {} }));

import { deveTocarEfeitoDaChamada, useSoundboard } from "./soundboard";
import { usePreferenciasPorParticipante } from "./preferencias-por-participante";

const som: SoundboardSound = {
  id: "s1",
  guildId: "g1",
  name: "airhorn",
  emoji: "",
  url: "/x/s1.mp3",
  volume: 1,
  createdById: "u1",
};

function tocou(autorId: string, channelId = "voz1"): SoundboardPlayEvent {
  return {
    channelId,
    guildId: "g1",
    sound: som,
    user: { id: autorId } as SoundboardPlayEvent["user"],
  };
}

describe("deveTocarEfeitoDaChamada", () => {
  it("toca para quem está na chamada do som", () => {
    expect(deveTocarEfeitoDaChamada(tocou("u1"), "voz1", {})).toBe(true);
  });

  it("não toca o som de quem eu silenciei", () => {
    expect(deveTocarEfeitoDaChamada(tocou("u1"), "voz1", { u1: true })).toBe(false);
    expect(deveTocarEfeitoDaChamada(tocou("u2"), "voz1", { u1: true })).toBe(true);
  });

  it("não toca no cliente que não está nesta chamada", () => {
    // o evento chega a todo socket da pessoa: a aba ociosa e o navegador ao
    // lado do desktop tocariam o som que o cliente da chamada silenciou
    expect(deveTocarEfeitoDaChamada(tocou("u1"), null, {})).toBe(false);
    expect(deveTocarEfeitoDaChamada(tocou("u1"), "voz2", {})).toBe(false);
  });
});

describe("Silenciar efeitos sonoros", () => {
  beforeEach(() => {
    tocarEfeitoSonoro.mockClear();
    usePreferenciasPorParticipante.setState({ efeitosSonorosSilenciados: {} });
  });

  it("o item do menu cala só a pessoa marcada, e desmarcar devolve o som", () => {
    usePreferenciasPorParticipante.getState().alternarEfeitosSilenciados("u1");

    useSoundboard.getState().tocarLocalmente(tocou("u1"), "voz1");
    expect(tocarEfeitoSonoro).not.toHaveBeenCalled();

    useSoundboard.getState().tocarLocalmente(tocou("u2"), "voz1");
    expect(tocarEfeitoSonoro).toHaveBeenCalledTimes(1);

    usePreferenciasPorParticipante.getState().alternarEfeitosSilenciados("u1");
    useSoundboard.getState().tocarLocalmente(tocou("u1"), "voz1");
    expect(tocarEfeitoSonoro).toHaveBeenCalledTimes(2);
  });
});
