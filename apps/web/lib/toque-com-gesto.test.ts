import { describe, expect, it } from "vitest";
import {
  esperasArmadas,
  pararToqueEm,
  tocarToqueEm,
  type AlvoDeGesto,
  type ElementoDeToque,
} from "@/lib/toque-com-gesto";

/** `window` de mentira: guarda os ouvintes para o teste disparar o gesto. */
function alvoFalso() {
  const ouvintes = new Map<string, Set<() => void>>();
  const alvo: AlvoDeGesto = {
    addEventListener: (tipo, ouvinte) => {
      const set = ouvintes.get(tipo) ?? new Set();
      set.add(ouvinte);
      ouvintes.set(tipo, set);
    },
    removeEventListener: (tipo, ouvinte) => {
      ouvintes.get(tipo)?.delete(ouvinte);
    },
  };
  return {
    alvo,
    /** quantos ouvintes ainda estão pendurados, somando todos os tipos */
    pendurados: () => Array.from(ouvintes.values()).reduce((n, s) => n + s.size, 0),
    gesto: () => {
      for (const ouvinte of Array.from(ouvintes.get("pointerdown") ?? [])) ouvinte();
    },
  };
}

/** `<audio>` de mentira: `recusar` imita a política de autoplay do Chromium. */
function audioFalso(recusar: boolean) {
  const el = {
    currentTime: 7,
    recusar,
    tocando: false,
    play() {
      if (el.recusar) return Promise.reject(new Error("NotAllowedError"));
      el.tocando = true;
      return Promise.resolve();
    },
    pause() {
      el.tocando = false;
    },
  };
  return el as typeof el & ElementoDeToque;
}

describe("toque com gesto", () => {
  it("toca do começo quando o autoplay deixa, sem armar espera", async () => {
    const { alvo, pendurados } = alvoFalso();
    const el = audioFalso(false);

    await tocarToqueEm(el, alvo);

    expect(el.tocando).toBe(true);
    expect(el.currentTime).toBe(0);
    expect(pendurados()).toBe(0);
  });

  it("autoplay recusado: o toque começa no primeiro gesto", async () => {
    const { alvo, gesto, pendurados } = alvoFalso();
    const el = audioFalso(true);

    await tocarToqueEm(el, alvo);
    expect(el.tocando).toBe(false);
    expect(pendurados()).toBeGreaterThan(0);

    // o gesto é exatamente o instante em que o Chromium passa a permitir
    el.recusar = false;
    gesto();
    expect(el.tocando).toBe(true);
    // o gesto foi consumido: nada continua pendurado no window
    expect(pendurados()).toBe(0);
    expect(esperasArmadas()).toBe(0);
  });

  it("chamada que acabou antes do gesto não ressuscita o toque", async () => {
    const { alvo, gesto, pendurados } = alvoFalso();
    const el = audioFalso(true);

    await tocarToqueEm(el, alvo);
    pararToqueEm(el);
    expect(pendurados()).toBe(0);

    gesto();
    expect(el.tocando).toBe(false);
    expect(el.currentTime).toBe(0);
    expect(esperasArmadas()).toBe(0);
  });

  it("tocar de novo não empilha esperas", async () => {
    const { alvo, pendurados } = alvoFalso();
    const el = audioFalso(true);

    await tocarToqueEm(el, alvo);
    const depoisDaPrimeira = pendurados();
    await tocarToqueEm(el, alvo);

    expect(pendurados()).toBe(depoisDaPrimeira);
    expect(esperasArmadas()).toBe(1);
    pararToqueEm(el);
  });
});
