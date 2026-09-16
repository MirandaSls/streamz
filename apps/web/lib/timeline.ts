import type { ChatMessage } from "@/stores/messages-core";

/**
 * Montagem da timeline em blocos (d-social).
 *
 * Mora aqui, fora do componente, porque é a única lógica da lista que dá para
 * errar em silêncio: um bloco recolhido no lugar errado esconde mensagem de
 * quem não foi bloqueado.
 */

/**
 * Uma linha da timeline: uma mensagem, ou um bloco recolhido — bloqueadas
 * (`docs/PENDENCIAS.md`/d-social) ou ignoradas (`docs/CONTRATO-MENUS.md` §4).
 */
export type Bloco =
  | { kind: "mensagem"; message: ChatMessage; anterior?: ChatMessage }
  | { kind: "bloqueadas"; items: ChatMessage[]; anterior?: ChatMessage }
  | { kind: "ignoradas"; items: ChatMessage[]; anterior?: ChatMessage };

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

/**
 * Segunda passada: junta mensagens seguidas de gente ignorada — "1 mensagem
 * ignorada — Mostrar mensagem" do Discord (§4 do contrato). Corre **depois**
 * de `agruparBloqueadas`, sobre os blocos que ela produziu, e só toca blocos
 * `"mensagem"`: quem já bloqueou continua no bloco de bloqueadas mesmo que
 * também tenha sido ignorado (as duas listas são independentes, mas o
 * bloqueio já esconde a mensagem — não há dois avisos empilhados para a
 * mesma pessoa).
 *
 * Função separada, e não um único parâmetro a mais em `agruparBloqueadas`,
 * para não mexer na assinatura que `lib/__tests__/social.test.ts` já cobre.
 */
export function agruparIgnoradas(blocos: Bloco[], ignorados: Set<string>): Bloco[] {
  const out: Bloco[] = [];
  for (const bloco of blocos) {
    if (bloco.kind !== "mensagem" || !ignorados.has(bloco.message.author.id)) {
      out.push(bloco);
      continue;
    }
    const ultimo = out[out.length - 1];
    if (ultimo?.kind === "ignoradas") {
      ultimo.items.push(bloco.message);
    } else {
      out.push({ kind: "ignoradas", items: [bloco.message], anterior: bloco.anterior });
    }
  }
  return out;
}

/** Primeira mensagem de um bloco — a que define data e chave de render. */
export function primeiraDoBloco(bloco: Bloco): ChatMessage {
  return bloco.kind === "mensagem" ? bloco.message : bloco.items[0];
}
