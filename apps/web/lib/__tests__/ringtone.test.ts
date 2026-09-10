/**
 * As duas regras que os sons quebravam: um som não se sobrepõe a si mesmo, e
 * há um único dono do volume.
 *
 * As stores são substituídas por objetos mínimos — o que está sob teste é a
 * aritmética de `lib/ringtone.ts`, não o zustand nem o `setSinkId`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = { outputVolume: 100, notificationSound: true };
const desligados = new Set<string>();

vi.mock("@/stores/settings", () => ({
  useSettings: { getState: () => settings },
}));
vi.mock("@/stores/sons", () => ({
  somLigado: (nome: string) => !desligados.has(nome),
}));
vi.mock("@/stores/voiceDevices", () => ({
  useVoiceDevicesStore: { getState: () => ({ outputId: null }) },
  aplicarSaida: () => Promise.resolve(),
}));

import {
  JANELA_SEM_REPETIR_MS,
  esquecerToquesRecentes,
  ehAparelhoDeBolso,
  fatorNoAparelho,
  tocarSom,
  volumeDoSom,
} from "@/lib/ringtone";

/** Um `<audio>` de mentira que só anota o que recebeu. */
class AudioFalso {
  static tocados: { src: string; volume: number }[] = [];
  preload = "";
  volume = 1;
  currentTime = 0;
  constructor(public src: string) {}
  play() {
    AudioFalso.tocados.push({ src: this.src, volume: this.volume });
    return Promise.resolve();
  }
}

/** A lista está em ordem crescente? É o que a mistura promete preservar. */
function crescente(valores: number[]): boolean {
  return valores.every((v, i) => i === 0 || v >= valores[i - 1]);
}

beforeEach(() => {
  AudioFalso.tocados = [];
  desligados.clear();
  settings.outputVolume = 100;
  settings.notificationSound = true;
  esquecerToquesRecentes();
  vi.stubGlobal("Audio", AudioFalso);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-03T20:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("um som não se sobrepõe a si mesmo", () => {
  it("engole o segundo pedido dentro da janela de 300 ms", () => {
    tocarSom("mensagem");
    vi.advanceTimersByTime(JANELA_SEM_REPETIR_MS - 1);
    tocarSom("mensagem");
    expect(AudioFalso.tocados).toHaveLength(1);
  });

  it("toca de novo depois da janela", () => {
    tocarSom("mensagem");
    vi.advanceTimersByTime(JANELA_SEM_REPETIR_MS);
    tocarSom("mensagem");
    expect(AudioFalso.tocados).toHaveLength(2);
  });

  it("a guarda é por arquivo: `mudo` e `surdo` são o mesmo mudo.mp3", () => {
    tocarSom("mudo");
    tocarSom("surdo");
    expect(AudioFalso.tocados).toHaveLength(1);
    expect(AudioFalso.tocados[0].src).toBe("/sons/mudo.mp3");
  });

  it("sons diferentes na mesma hora continuam podendo tocar juntos", () => {
    // sair + entrar é o que se ouve ao trocar de sala; a guarda não pode calar
    tocarSom("sair");
    tocarSom("entrar");
    expect(AudioFalso.tocados.map((t) => t.src)).toEqual([
      "/sons/sair.mp3",
      "/sons/entrar.mp3",
    ]);
  });

  it("um pedido engolido não adia o seguinte", () => {
    tocarSom("mensagem");
    vi.advanceTimersByTime(200);
    tocarSom("mensagem"); // engolido
    vi.advanceTimersByTime(101); // 301 ms desde o que tocou
    tocarSom("mensagem");
    expect(AudioFalso.tocados).toHaveLength(2);
  });
});

describe("um dono só do volume", () => {
  it("cada som tem o fator do Discord sobre o volume de saída", () => {
    expect(volumeDoSom("mensagem")).toBeCloseTo(0.15);
    expect(volumeDoSom("chamada")).toBeCloseTo(0.35);
    expect(volumeDoSom("mudo")).toBeCloseTo(0.08);
    expect(volumeDoSom("nao-surdo")).toBeCloseTo(0.08);
    expect(volumeDoSom("entrar")).toBeCloseTo(0.2);
    expect(volumeDoSom("transmissao-iniciada")).toBeCloseTo(0.2);
  });

  it("o volume de saída multiplica o fator", () => {
    settings.outputVolume = 50;
    expect(volumeDoSom("mensagem")).toBeCloseTo(0.075);
    expect(volumeDoSom("chamada")).toBeCloseTo(0.175);
    settings.outputVolume = 0;
    expect(volumeDoSom("chamada")).toBe(0);
  });

  it("nunca passa de 1, nem com um outputVolume fora da faixa", () => {
    settings.outputVolume = 500;
    expect(volumeDoSom("chamada")).toBe(1);
  });

  it("sem `matchMedia` (SSR, export estático) o aparelho não é de bolso", () => {
    expect(ehAparelhoDeBolso()).toBe(false);
  });

  it("num telefone o fator sobe pela raiz — metade da atenuação em dB", () => {
    // `(pointer: coarse)` é o que separa telefone de computador; o jsdom não
    // traz `matchMedia`, então o teste o coloca.
    vi.stubGlobal("matchMedia", (consulta: string) => ({
      matches: consulta === "(pointer: coarse)",
    }));
    expect(ehAparelhoDeBolso()).toBe(true);
    // 0,08 → 0,283: o "microfone mudo" sai 11 dB abaixo em vez de 22
    expect(volumeDoSom("mudo")).toBeCloseTo(Math.sqrt(0.08));
    expect(volumeDoSom("chamada")).toBeCloseTo(Math.sqrt(0.35));
    vi.unstubAllGlobals();
  });

  it("a ordem da mistura é a mesma no telefone e no computador", () => {
    // mudo < mensagem < entrar < chamada, os fatores de `FATOR` em ordem
    const fatores = [0.08, 0.15, 0.2, 0.35];
    expect(crescente(fatores.map((f) => fatorNoAparelho(f, false)))).toBe(true);
    expect(crescente(fatores.map((f) => fatorNoAparelho(f, true)))).toBe(true);
  });

  it("no computador o fator não é tocado", () => {
    expect(fatorNoAparelho(0.08, false)).toBe(0.08);
  });

  it("no telefone o controle de volume continua linear: em 0 é 0", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    settings.outputVolume = 0;
    expect(volumeDoSom("chamada")).toBe(0);
    vi.unstubAllGlobals();
  });

  it("o elemento recebe exatamente esse volume — a mensagem não sai em 1", () => {
    tocarSom("mensagem");
    expect(AudioFalso.tocados[0].volume).toBeCloseTo(0.15);
  });

  it("o mesmo som pedido duas vezes sai sempre no mesmo nível", () => {
    tocarSom("entrar");
    vi.advanceTimersByTime(1000);
    tocarSom("alguem-entrou"); // mesmo arquivo, outro nome
    expect(AudioFalso.tocados.map((t) => t.volume)).toEqual([0.2, 0.2]);
  });
});

describe("interruptores", () => {
  it("o mestre desligado cala tudo", () => {
    settings.notificationSound = false;
    tocarSom("mensagem");
    expect(AudioFalso.tocados).toHaveLength(0);
  });

  it("o interruptor do som vale só para ele", () => {
    desligados.add("mensagem");
    tocarSom("mensagem");
    tocarSom("entrar");
    expect(AudioFalso.tocados.map((t) => t.src)).toEqual(["/sons/entrar.mp3"]);
  });

  it("`forcar` ignora os dois — é a prévia da aba Notificações", () => {
    settings.notificationSound = false;
    desligados.add("mensagem");
    tocarSom("mensagem", { forcar: true });
    expect(AudioFalso.tocados).toHaveLength(1);
  });
});
