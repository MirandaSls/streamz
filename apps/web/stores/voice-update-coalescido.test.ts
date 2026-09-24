import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarEmissorCoalescido } from "./voice-update-coalescido";

/**
 * O caso que este arquivo prova: spammar mudo/desmudo não pode fazer o
 * gateway descartar o estado final — ver o porquê em
 * `voice-update-coalescido.ts` e o bug original no `syncFlags` de `voice.ts`.
 */

const IGUAIS_NUMERO = (a: number, b: number) => a === b;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("criarEmissorCoalescido", () => {
  it("envio isolado sai na hora, sem esperar a janela", () => {
    const enviados: number[] = [];
    const emissor = criarEmissorCoalescido<number>((v) => enviados.push(v), 300, IGUAIS_NUMERO);

    emissor.pedir(1);

    expect(enviados).toEqual([1]);
  });

  it("rajada de 20 toggles em 1s: no máximo ceil(1000/intervalo)+1 envios, e o último é o estado final", () => {
    const enviados: number[] = [];
    const intervaloMs = 300;
    const emissor = criarEmissorCoalescido<number>(
      (v) => enviados.push(v),
      intervaloMs,
      IGUAIS_NUMERO,
    );

    // 20 toggles em 1000ms, alternando 0/1 a cada 50ms — o pior caso, porque
    // cada valor é diferente do anterior e nenhum é descartado por repetição
    const total = 20;
    const janelaTotalMs = 1000;
    const passoMs = janelaTotalMs / total;
    let estadoFinal = 0;
    for (let i = 0; i < total; i++) {
      estadoFinal = i % 2;
      emissor.pedir(estadoFinal);
      vi.advanceTimersByTime(passoMs);
    }
    // deixa a última janela aberta fechar sozinha (borda de descida)
    vi.advanceTimersByTime(intervaloMs);

    const maximoDeEnvios = Math.ceil(janelaTotalMs / intervaloMs) + 1;
    expect(enviados.length).toBeLessThanOrEqual(maximoDeEnvios);
    expect(enviados.length).toBeGreaterThan(0);
    expect(enviados.at(-1)).toBe(estadoFinal);
  });

  it("valor repetido não reenvia, mesmo depois da janela fechar", () => {
    const enviados: number[] = [];
    const emissor = criarEmissorCoalescido<number>((v) => enviados.push(v), 300, IGUAIS_NUMERO);

    emissor.pedir(1); // sai na hora (borda de subida)
    emissor.pedir(1); // janela aberta, mesmo valor: fica pendente
    vi.advanceTimersByTime(300); // janela fecha: pendente == último enviado, não reenvia
    emissor.pedir(1); // janela livre de novo, mesmo valor: continua sem enviar

    expect(enviados).toEqual([1]);
  });

  it("rajada que fecha a janela num valor diferente do enviado ainda manda o final", () => {
    const enviados: number[] = [];
    const emissor = criarEmissorCoalescido<number>((v) => enviados.push(v), 300, IGUAIS_NUMERO);

    emissor.pedir(0); // estado inicial, sai na hora
    vi.advanceTimersByTime(300);
    enviados.length = 0; // só interessa o que acontece a partir daqui

    emissor.pedir(1); // borda de subida: sai na hora (único envio até aqui)
    emissor.pedir(0); // dentro da janela: fica pendente
    emissor.pedir(1); // ainda na janela: pendente volta a 1 (igual ao já enviado)
    emissor.pedir(0); // ainda na janela: pendente vira 0 de novo — é o valor final
    vi.advanceTimersByTime(300);

    // o pendente no fechamento (0) difere do último enviado (1): mesmo tendo
    // "passado" por um valor igual ao já enviado no meio da rajada, o que sai
    // no fim da janela é o estado final de verdade, não uma média do caminho
    expect(enviados).toEqual([1, 0]);
  });

  it("zerar cancela o timer pendente e esquece o último enviado", () => {
    const enviados: number[] = [];
    const emissor = criarEmissorCoalescido<number>((v) => enviados.push(v), 300, IGUAIS_NUMERO);

    emissor.pedir(1); // sai na hora, janela abre
    emissor.pedir(0); // fica pendente

    emissor.zerar();
    vi.advanceTimersByTime(300); // sem o zerar, isso mandaria o 0 pendente

    expect(enviados).toEqual([1]);

    // esqueceu o último enviado: repetir o mesmo valor de antes volta a sair
    emissor.pedir(1);
    expect(enviados).toEqual([1, 1]);
  });
});
