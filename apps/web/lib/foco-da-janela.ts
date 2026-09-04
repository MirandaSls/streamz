/**
 * "A janela está na frente?" — a regra pura por trás de `janelaTemFoco()`.
 *
 * Por que isso virou um módulo: é o gate de **marcar como lido**. Com a
 * conversa aberta e a janela em foco, a mensagem que chega é lida; sem foco,
 * ela conta como não lida e notifica (§ `lib/na-tela.ts`). No desktop esse
 * gate estava travado em "sem foco", e a DM aberta na tela continuava em
 * negrito.
 *
 * A causa é a ordem em que as coisas acontecem no app de desktop desde a
 * janelinha de abertura (PR #88): a janela `main` nasce `visible: false`, o JS
 * sobe com ela escondida — `document.hasFocus()` é **falso** — e só depois a
 * janelinha chama `show()` + `setFocus()`. O código antigo fotografava
 * `document.hasFocus()` uma vez, no início da observação, e daí em diante só
 * aceitava correção do `onFocusChanged` do Tauri; se esse ouvinte (que é
 * registrado por `import()` assíncrono) só ficou pronto **depois** do foco já
 * ter sido dado, ninguém mais desmentia o `false` inicial até o usuário sair do
 * app e voltar.
 *
 * A regra, então:
 *
 *  - enquanto **ninguém** observou, quem responde é o DOM (`document.hasFocus()`);
 *  - a partir do primeiro sinal, vale o **último** sinal recebido, venha ele do
 *    `focus`/`blur` da janela ou do `onFocusChanged` do Tauri. As duas fontes
 *    falam da mesma janela e podem repetir a mesma troca; nenhuma delas é
 *    autoridade sozinha (o DOM erra quando o usuário clica em outro app pela
 *    nossa região de arrasto; o do Tauri chega tarde no boot).
 */

export interface EstadoDeFoco {
  /** Último sinal recebido; `null` enquanto ninguém observou. */
  ultimo: boolean | null;
}

/** Ninguém observando ainda: quem responde é o DOM. */
export const SEM_OBSERVACAO: EstadoDeFoco = { ultimo: null };

/** Chegou um sinal de foco (do DOM ou do Tauri, tanto faz): ele passa a valer. */
export function comSinal(_estado: EstadoDeFoco, foco: boolean): EstadoDeFoco {
  return { ultimo: foco };
}

/** A resposta que o resto do app usa. `doDom` é o `document.hasFocus()`. */
export function temFoco(estado: EstadoDeFoco, doDom: boolean): boolean {
  return estado.ultimo ?? doDom;
}
