import type { DMChannelView } from "@streamz/shared";

/**
 * A aritmética do badge de não lidas — a parte pura, testável sem store.
 *
 * Em conversa direta o Discord conta **toda** mensagem não lida (não só a
 * menção): a linha da conversa mostra o número, e o ícone de mensagens
 * diretas no rail mostra a soma. Em servidor o badge continua sendo só de
 * menções, e o canal não lido fica em negrito com a pílula — isso não passa
 * por aqui.
 */

/** Acima disto o badge não cresce: "99+", como no Discord. */
export const TETO_DO_CONTADOR = 99;

/** Rótulo do badge: o número, ou "99+" quando estoura o teto. */
export function rotuloDoContador(n: number): string {
  return n > TETO_DO_CONTADOR ? `${TETO_DO_CONTADOR}+` : String(n);
}

/** Soma das não lidas de todas as conversas (o badge do rail). */
export function somarNaoLidas(dms: readonly Pick<DMChannelView, "unreadCount">[]): number {
  return dms.reduce((total, d) => total + Math.max(0, d.unreadCount), 0);
}

/**
 * O que muda na conversa quando chega uma mensagem: `lastMessageAt` sempre;
 * menção e não lida só quando a mensagem é de outro — a minha nunca é "não
 * lida" para mim.
 */
export function aoChegarMensagem<T extends Pick<DMChannelView, "lastMessageAt" | "mentionCount" | "unreadCount">>(
  dm: T,
  at: string,
  opcoes: { mention: boolean; propria: boolean },
): T {
  return {
    ...dm,
    lastMessageAt: at,
    mentionCount: dm.mentionCount + (opcoes.mention && !opcoes.propria ? 1 : 0),
    unreadCount: dm.unreadCount + (opcoes.propria ? 0 : 1),
  };
}

/** O que o ícone da caixa de entrada mostra. */
export type BadgeDaCaixa =
  | { tipo: "nada" }
  /** há novidade, mas nada que se conte: um ponto, sem número. */
  | { tipo: "ponto" }
  | { tipo: "contagem"; total: number };

/**
 * O badge do ícone da caixa de entrada (barra de título do desktop e cabeçalho
 * de Amigos no navegador).
 *
 * A regra é a que o resto do app já usa e a que o Discord mostra: **conta-se o
 * que é dirigido a mim** — menção em servidor e mensagem em conversa direta —,
 * e o resto (canal de servidor com mensagem nova, sem menção) vira só um ponto.
 * Números e ponto não se somam: quando há o que contar, o número já diz que há
 * novidade.
 *
 * É a mesma aritmética do contador no ícone do app (`atualizarContadorNoIcone`
 * em `hooks/useRealtime.ts`), de propósito: dois lugares dizendo números
 * diferentes sobre a mesma caixa seria pior do que não ter badge.
 */
export function badgeDaCaixa(entrada: {
  /** soma dos `mentionCount` dos servidores. */
  mencoes: number;
  /** soma dos `unreadCount` das conversas. */
  conversas: number;
  /** algum servidor com canal não lido (sem menção). */
  temServidorNaoLido: boolean;
}): BadgeDaCaixa {
  const total = Math.max(0, entrada.mencoes) + Math.max(0, entrada.conversas);
  if (total > 0) return { tipo: "contagem", total };
  if (entrada.temServidorNaoLido) return { tipo: "ponto" };
  return { tipo: "nada" };
}
