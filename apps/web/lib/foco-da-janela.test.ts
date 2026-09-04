import { describe, expect, it } from "vitest";
import { SEM_OBSERVACAO, comSinal, temFoco } from "./foco-da-janela";

describe("foco da janela", () => {
  it("sem observação nenhuma, quem responde é o DOM", () => {
    expect(temFoco(SEM_OBSERVACAO, true)).toBe(true);
    expect(temFoco(SEM_OBSERVACAO, false)).toBe(false);
  });

  it("o sinal observado ganha do DOM", () => {
    // é o caso da barra de título própria: o usuário clica em outro app pela
    // região de arrasto e o DOM não vê blur; o `onFocusChanged` do Tauri vê
    expect(temFoco(comSinal(SEM_OBSERVACAO, false), true)).toBe(false);
    expect(temFoco(comSinal(SEM_OBSERVACAO, true), false)).toBe(true);
  });

  /**
   * O defeito: a janela `main` do desktop nasce escondida, então o primeiro
   * sinal é `false`. Quem a mostra é a janelinha de abertura, e o sinal que
   * corrige pode vir do DOM (`focus`) ou do Tauri (`onFocusChanged`) — antes,
   * só o do Tauri era ouvido, e quando ele chegava tarde o `false` ficava para
   * sempre: a DM aberta na tela nunca mais era marcada como lida.
   */
  it("o sinal seguinte corrige a janela que nasceu escondida", () => {
    let estado = comSinal(SEM_OBSERVACAO, false);
    expect(temFoco(estado, false)).toBe(false);
    estado = comSinal(estado, true);
    expect(temFoco(estado, false)).toBe(true);
  });

  it("vale sempre o último sinal, não importa a fonte", () => {
    let estado = comSinal(SEM_OBSERVACAO, true);
    estado = comSinal(estado, false); // blur do DOM
    estado = comSinal(estado, true); // onFocusChanged do Tauri
    expect(temFoco(estado, false)).toBe(true);
  });
});
