/**
 * Fechar o programa não é a rede cair — e o gateway tratava os dois igual.
 *
 * A carência de `VOICE_RECONNECT_GRACE_MS` (45 s) existe para queda de rede: o
 * Wi-Fi oscila, o notebook dorme, o celular troca de torre, e derrubar alguém
 * da chamada por isso seria pior que o fantasma. Mas ela era aplicada a **toda**
 * desconexão, inclusive a quem clicou em "Sair" na bandeja ou fechou a aba — e
 * essas pessoas ficavam 45 s na sala, para todo mundo, marcadas como
 * "reconectando", sem nunca voltar.
 *
 * O Socket.IO já sabe distinguir os dois casos: ele entrega o **motivo** da
 * desconexão. Quem pediu para sair sai na hora; quem caiu ganha a carência.
 *
 * Os motivos vêm do Socket.IO v4 (`Socket#disconnect` e o evento
 * `disconnecting`), e a lista é fechada — por isso o `default` do `switch`
 * é a carência: motivo novo (ou desconhecido) é tratado como queda, que é o
 * lado seguro do erro. Errar para "esperou 45 s à toa" incomoda; errar para
 * "derrubou quem só trocou de rede" perde a chamada.
 */
export type MotivoDaDesconexao =
  /** `socket.disconnect()` no cliente — fechou a aba, saiu pela bandeja. */
  | "client namespace disconnect"
  /** O servidor desconectou de propósito (expulsão, conta desativada). */
  | "server namespace disconnect"
  /** A conexão caiu: rede, sono da máquina, aba congelada pelo navegador. */
  | "transport close"
  | "transport error"
  | "ping timeout"
  | "parse error"
  | (string & {});

/**
 * A pessoa **pediu** para sair, ou a conexão caiu?
 *
 * `true` ⇒ tira da voz agora. `false` ⇒ agenda e espera a carência.
 */
export function saidaFoiIntencional(motivo: MotivoDaDesconexao | undefined): boolean {
  switch (motivo) {
    case "client namespace disconnect":
    case "server namespace disconnect":
      return true;
    default:
      return false;
  }
}
