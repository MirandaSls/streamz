import { displayNameOf, type PublicUser } from "@streamz/shared";

/**
 * "Mencionar" do menu de contexto: insere `@nome ` no composer aberto.
 *
 * Vai por `CustomEvent` no `window` e não por store porque quem menciona (lista
 * de membros, participantes de voz, cabeçalho de mensagem) não sabe qual
 * composer está montado — pode ser o do canal, o da thread ou o da conversa. O
 * composer em foco escuta e resolve; se não houver nenhum, o evento cai no
 * vazio, que é exatamente o comportamento desejado.
 */

export const EVENTO_MENCAO = "streamz:mencionar";

export interface DetalheMencao {
  texto: string;
}

/**
 * Devolve `true` quando algum composer atendeu. O evento é cancelável e quem
 * atende chama `preventDefault()` — é assim que quem menciona de uma tela sem
 * composer (o palco de voz) sabe que precisa cair no rascunho.
 */
export function mencionar(user: PublicUser): boolean {
  if (typeof window === "undefined") return false;
  const detalhe: DetalheMencao = { texto: `@${displayNameOf(user)} ` };
  const evento = new CustomEvent<DetalheMencao>(EVENTO_MENCAO, {
    detail: detalhe,
    cancelable: true,
  });
  return !window.dispatchEvent(evento);
}
