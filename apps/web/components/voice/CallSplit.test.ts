import { describe, expect, it, vi } from "vitest";

/**
 * A decisão de leiaute do invólucro do palco na divisão vertical. Como no teste
 * do `CallStage`, o componente em volta puxa o mundo: a store de voz vira casca
 * e o que se exercita é a função pura.
 */
vi.mock("@/stores/voice", () => ({
  useVoice: Object.assign(() => undefined, { getState: () => ({}) }),
  participantesDe: () => [],
  telasDe: () => [],
}));

import { involucroDoPalco } from "./CallSplit";
import { reservaDoChat } from "./call-split-layout";

describe("involucroDoPalco", () => {
  it("na faixa fixa a altura do divisor e guarda a reserva do chat", () => {
    const { className, style } = involucroDoPalco(false, 199, 900);
    expect(style?.height).toBe(199);
    expect(style?.maxHeight).toBe(`calc(100% - ${Math.round(reservaDoChat(900))}px)`);
    const classes = className.split(" ");
    // `relative` é a âncora dos flutuantes do palco (cabeçalho, controles,
    // cantos) e `shrink-0` é o que impede a conversa de comer a faixa
    expect(classes).toContain("relative");
    expect(classes).toContain("shrink-0");
  });

  it("antes da primeira medição a reserva sai da altura de partida, não de zero", () => {
    // `disponivel` 0 é o primeiro quadro (SSR/antes do ResizeObserver): a
    // reserva tem de valer a mesma coisa que valeria numa coluna de 420
    const { style } = involucroDoPalco(false, 199, 0);
    expect(style?.maxHeight).toBe(`calc(100% - ${Math.round(reservaDoChat(420))}px)`);
  });

  it("expandido não tem altura nem `relative`: o palco se promove sozinho", () => {
    const { className, style } = involucroDoPalco(true, 199, 900);
    expect(style).toBeUndefined();
    const classes = className.split(" ");
    // com `relative` o `absolute inset-0` do palco pararia aqui, na faixa de
    // 199px que ele deveria ter deixado para trás
    expect(classes).not.toContain("relative");
    expect(classes).toContain("flex-1");
  });
});
