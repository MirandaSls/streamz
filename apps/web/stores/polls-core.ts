import type { Poll } from "@streamz/shared";

/**
 * Regras puras da enquete do lado do cliente.
 *
 * Fora da store porque são as duas decisões sutis da feature — e as duas
 * quebram de um jeito que a tela não denuncia (contagem que anda sozinha,
 * marcação que some no primeiro voto de outra pessoa).
 */

/**
 * Aplica meu voto na hora, sem esperar o servidor.
 *
 * Clicar na opção já marcada é desvotar. Sem `multi`, votar numa opção tira o
 * voto das outras — a mesma regra que o servidor aplica, para que o otimista e
 * o eco não discordem.
 */
export function aplicarVoto(poll: Poll, optionIndex: number): Poll {
  const marcada = poll.options[optionIndex]?.me ?? false;
  const options = poll.options.map((o) => {
    if (o.index === optionIndex) {
      return { ...o, me: !marcada, votes: Math.max(0, o.votes + (marcada ? -1 : 1)) };
    }
    if (!poll.multi && o.me) return { ...o, me: false, votes: Math.max(0, o.votes - 1) };
    return o;
  });
  return { ...poll, options, totalVotes: options.reduce((n, o) => n + o.votes, 0) };
}

/**
 * Junta a contagem que veio do gateway com a marcação que este cliente já tinha.
 *
 * `poll.updated` é um broadcast: ele vale para todo mundo na sala e por isso
 * **não** sabe quem sou eu (`me` vem sempre `false`). Aproveitar as contagens e
 * preservar a minha marcação é o que impede o voto de alguém de apagar a marca
 * do meu na tela.
 */
export function mesclarContagem(anterior: Poll | undefined, doServidor: Poll): Poll {
  const options = doServidor.options.map((o) => ({
    ...o,
    me: anterior?.options.find((a) => a.index === o.index)?.me ?? false,
  }));
  return { ...doServidor, options };
}

/** Um voto mandado ao servidor e o que o ack disse dele (`undefined` = em voo). */
export interface VotoEmVoo {
  indice: number;
  ok?: boolean;
}

/**
 * Estado final de um lote de votos em que algum falhou (ack `ok: false` ou
 * servidor mudo até o timeout).
 *
 * "Lote" são os votos disparados enquanto havia outro em voo na mesma enquete
 * — o botão "Votar" de uma enquete múltipla manda um por opção, de uma vez.
 * Desfazer voto a voto não funciona: sem `multi`, cada voto mexe na marca das
 * outras opções, e desfazer um no meio da fila deixa a marca errada. Então o
 * lote guarda a enquete de antes do primeiro voto (`base`) e, quando todos
 * respondem, refaz sobre ela **só os que o servidor aceitou**:
 *
 * - a marca (`me`) sai dessa repetição — é a única fonte que o cliente tem;
 * - a contagem sai do último `poll.updated` do lote, se chegou algum (é a
 *   verdade do servidor, e já inclui os votos aceitos: o gateway faz o
 *   broadcast antes de devolver o ack); sem nenhum, sai da repetição.
 */
export function reconciliarLote(base: Poll, votos: readonly VotoEmVoo[], servidor?: Poll): Poll {
  const refeita = votos.reduce((p, v) => (v.ok ? aplicarVoto(p, v.indice) : p), base);
  if (!servidor) return refeita;
  return mesclarContagem(refeita, servidor);
}
