import { describe, expect, it, vi } from "vitest";
import {
  destravarElementos,
  urlsDistintas,
  type ElementoDestravavel,
} from "@/lib/destravar-sons";

/**
 * O efeito real do destravamento — o navegador passar a permitir `play()` sem
 * gesto — **não é testável aqui**: nem o jsdom nem o Chromium sem cabeça
 * aplicam a política do iOS. O que se testa é o contrato que a política exige:
 * todo arquivo tentado, uma vez cada, `play()` antes de qualquer espera, e o
 * elemento devolvido ao estado em que estava.
 */

function elemento(recusa = false): ElementoDestravavel & {
  chamadas: string[];
} {
  const chamadas: string[] = [];
  return {
    volume: 0.7,
    currentTime: 12,
    chamadas,
    play() {
      chamadas.push("play");
      return recusa ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve();
    },
    pause() {
      chamadas.push("pause");
    },
  };
}

describe("urlsDistintas", () => {
  it("não repete arquivo compartilhado por dois sons", () => {
    // `mudo` e `surdo` são o mesmo arquivo: destravá-lo duas vezes seria uma
    // reprodução a mais sem ganho nenhum
    expect(
      urlsDistintas({ mudo: "/sons/mudo.mp3", surdo: "/sons/mudo.mp3", msg: "/sons/m.mp3" }),
    ).toEqual(["/sons/mudo.mp3", "/sons/m.mp3"]);
  });

  it("preserva a ordem de declaração", () => {
    expect(urlsDistintas({ a: "/1", b: "/2", c: "/3" })).toEqual(["/1", "/2", "/3"]);
  });

  it("aguenta um mapa vazio", () => {
    expect(urlsDistintas({})).toEqual([]);
  });
});

describe("destravarElementos", () => {
  it("toca e pausa cada elemento, e conta os que aceitaram", async () => {
    const a = elemento();
    const b = elemento();
    await expect(destravarElementos([a, b])).resolves.toBe(2);
    expect(a.chamadas).toEqual(["play", "pause"]);
    expect(b.chamadas).toEqual(["play", "pause"]);
  });

  it("devolve volume e posição ao que eram", async () => {
    const a = elemento();
    await destravarElementos([a]);
    expect(a.volume).toBe(0.7);
    expect(a.currentTime).toBe(0);
  });

  it("toca em volume zero — o elemento não pode soar no destravamento", async () => {
    const volumes: number[] = [];
    const a: ElementoDestravavel = {
      volume: 0.9,
      currentTime: 0,
      play() {
        volumes.push(a.volume);
        return Promise.resolve();
      },
      pause() {},
    };
    await destravarElementos([a]);
    expect(volumes).toEqual([0]);
  });

  it("chama todos os `play` antes de esperar por qualquer um", async () => {
    // é a regra que a política de autoplay impõe: um `await` antes do `play`
    // sai da janela de ativação do gesto e o navegador recusa de novo
    const ordem: string[] = [];
    const fazer = (nome: string): ElementoDestravavel => ({
      volume: 1,
      currentTime: 0,
      play() {
        ordem.push(`play:${nome}`);
        return Promise.resolve().then(() => {
          ordem.push(`resolveu:${nome}`);
        });
      },
      pause() {
        ordem.push(`pause:${nome}`);
      },
    });
    await destravarElementos([fazer("a"), fazer("b")]);
    expect(ordem.slice(0, 2)).toEqual(["play:a", "play:b"]);
  });

  it("um elemento recusado não impede os outros", async () => {
    const mau = elemento(true);
    const bom = elemento();
    await expect(destravarElementos([mau, bom])).resolves.toBe(1);
    // mesmo recusado, ele é pausado e devolvido ao lugar
    expect(mau.chamadas).toEqual(["play", "pause"]);
    expect(bom.chamadas).toEqual(["play", "pause"]);
  });

  it("não rejeita quando todos recusam", async () => {
    const erro = vi.fn();
    await destravarElementos([elemento(true), elemento(true)]).catch(erro);
    expect(erro).not.toHaveBeenCalled();
  });

  it("lista vazia não faz nada", async () => {
    await expect(destravarElementos([])).resolves.toBe(0);
  });
});
