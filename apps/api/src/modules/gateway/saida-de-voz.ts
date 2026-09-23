import type { DisconnectReason } from "socket.io";

/**
 * Fechar o programa não é a rede cair — e o gateway tratava os dois igual.
 *
 * A carência de `VOICE_RECONNECT_GRACE_MS` (45 s) existe para queda de rede: o
 * Wi-Fi oscila, o notebook dorme, o celular troca de torre, e derrubar alguém
 * da chamada por isso seria pior que o fantasma. Mas ela era aplicada a **toda**
 * desconexão, inclusive a quem clicou em "Sair" na bandeja ou fechou o app — e
 * essas pessoas ficavam 45 s na sala, para todo mundo, marcadas como
 * "reconectando", sem nunca voltar.
 *
 * O Socket.IO já sabe distinguir os dois casos: ele entrega o **motivo** da
 * desconexão. Quem pediu para sair sai na hora; quem caiu ganha a carência.
 *
 * A lista de motivos é do próprio Socket.IO (`DisconnectReason`, importado em
 * vez de recopiado: reescrevê-la à mão foi o que já a deixou incompleta uma
 * vez). Ainda assim o `default` do `switch` é a carência — o motivo chega como
 * `string` solta em `client.data`, e motivo desconhecido tratado como queda é o
 * lado seguro do erro. Errar para "esperou 45 s à toa" incomoda; errar para
 * "derrubou quem só trocou de rede" perde a chamada.
 */
export type MotivoDaDesconexao = DisconnectReason | (string & {});

/**
 * A pessoa **pediu** para sair, ou a conexão caiu?
 *
 * `true` ⇒ tira da voz agora. `false` ⇒ agenda e espera a carência.
 */
export function saidaFoiIntencional(motivo: MotivoDaDesconexao | undefined): boolean {
  switch (motivo) {
    // `socket.disconnect()` no cliente — fechou o app, saiu pela bandeja.
    case "client namespace disconnect":
    // O servidor desconectou de propósito: é o que `client.disconnect(true)`
    // produz hoje (conta desativada no meio, token inválido, expulsão).
    case "server namespace disconnect":
    // A outra forma de o servidor cortar de propósito: fechar o transporte por
    // baixo (`conn.close()`), que o engine.io reporta assim. Não acontece pelos
    // caminhos de hoje, mas quem cair nele foi **desligado**, não perdeu a rede
    // — e 45 s de fantasma de quem já foi embora é justo o que isto evita.
    case "forced close":
      return true;
    // `"server shutting down"` fica de fora de propósito: ali quem está saindo
    // é a instância, não a pessoa, e o cliente vai reconectar. A carência é o
    // que mantém a chamada de pé por cima de um restart.
    default:
      return false;
  }
}
