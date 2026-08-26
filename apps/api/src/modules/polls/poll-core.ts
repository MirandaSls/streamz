import type { Poll } from "@newdisc/shared";

/** Uma linha de voto, do jeito mínimo que a contagem precisa. */
export interface VotoRow {
  optionIndex: number;
  userId: string;
}

/** A enquete como ela sai do banco, sem os votos. */
export interface PollRow {
  messageId: string;
  question: string;
  options: string[];
  multi: boolean;
  expiresAt: Date | null;
  closedAt: Date | null;
}

/**
 * Contagem da enquete: transforma linhas de voto no DTO com o total por opção.
 *
 * Função pura, e por isso testável sem banco. Votos apontando para índice que
 * não existe mais são ignorados de propósito — a lista de opções é imutável
 * depois de criada, mas um voto órfão nunca deve derrubar a renderização.
 *
 * `viewerId` marca as opções do espectador. Quando ausente (o caso de um
 * broadcast, que vai para todo mundo de uma vez), `me` sai `false` e é o
 * cliente que preserva a própria marcação.
 */
export function tallyPoll(poll: PollRow, votes: VotoRow[], viewerId?: string): Poll {
  const contagem = new Array<number>(poll.options.length).fill(0);
  const meus = new Array<boolean>(poll.options.length).fill(false);
  let total = 0;

  for (const v of votes) {
    if (v.optionIndex < 0 || v.optionIndex >= poll.options.length) continue;
    contagem[v.optionIndex] += 1;
    total += 1;
    if (viewerId && v.userId === viewerId) meus[v.optionIndex] = true;
  }

  return {
    messageId: poll.messageId,
    question: poll.question,
    options: poll.options.map((text, index) => ({
      index,
      text,
      votes: contagem[index],
      me: meus[index],
    })),
    multi: poll.multi,
    expiresAt: poll.expiresAt ? poll.expiresAt.toISOString() : null,
    closedAt: poll.closedAt ? poll.closedAt.toISOString() : null,
    totalVotes: total,
  };
}
