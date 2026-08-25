import type { ChatMessage } from "@/stores/messages-core";

/**
 * Montagem da timeline em blocos (d-social).
 *
 * Mora aqui, fora do componente, porque é a única lógica da lista que dá para
 * errar em silêncio: um bloco recolhido no lugar errado esconde mensagem de
 * quem não foi bloqueado.
 */

/** Uma linha da timeline: uma mensagem, ou o bloco recolhido de bloqueadas. */
export type Bloco =
  | { kind: "mensagem"; message: ChatMessage; anterior?: ChatMessage }
  | { kind: "bloqueadas"; items: ChatMessage[]; anterior?: ChatMessage };

/**
 * Junta mensagens seguidas de gente bloqueada num bloco só — é o que faz o
 * Discord mostrar "3 mensagens bloqueadas" em vez de três avisos em fila.
 *
 * `anterior` viaja com o bloco porque o divisor de data e o agrupamento por
 * autor comparam com a mensagem que veio antes na *timeline*, não no bloco.
 */
export function agruparBloqueadas(items: ChatMessage[], bloqueados: Set<string>): Bloco[] {
  const out: Bloco[] = [];
  let anterior: ChatMessage | undefined;
  for (const message of items) {
    const bloqueada = bloqueados.has(message.author.id);
    const ultimo = out[out.length - 1];
    if (bloqueada && ultimo?.kind === "bloqueadas") {
      ultimo.items.push(message);
    } else if (bloqueada) {
      out.push({ kind: "bloqueadas", items: [message], anterior });
    } else {
      out.push({ kind: "mensagem", message, anterior });
    }
    anterior = message;
  }
  return out;
}

/** Primeira mensagem de um bloco — a que define data e chave de render. */
export function primeiraDoBloco(bloco: Bloco): ChatMessage {
  return bloco.kind === "bloqueadas" ? bloco.items[0] : bloco.message;
}
