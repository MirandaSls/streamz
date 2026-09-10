/**
 * A ordenação e a paginação do `/ranking`, e a posição que o `/nivel` mostra.
 *
 * Puro e sem servidor por perto: a entrada é o mapa `usuarioId → { xp }` do
 * estado, a saída é uma lista pronta para virar texto.
 */

import type { UsuarioDeNiveis } from "./dados";
import { nivelDoXp } from "./curva";

/** Quantas pessoas cabem numa página do `/ranking`. */
export const POR_PAGINA = 10;

export interface LinhaDoRanking {
  usuarioId: string;
  xp: number;
  nivel: number;
  mensagens: number;
  /** 1 é o primeiro lugar. */
  posicao: number;
}

/**
 * Ordena por XP (maior primeiro) e **desempata pelo id**.
 *
 * O desempate não é capricho: `Array#sort` é estável no V8, mas a ordem de
 * `Object.entries` de quem empatou depende da ordem de inserção no mapa — que
 * muda quando o arquivo é relido do disco. Sem o desempate, dois empatados
 * trocariam de lugar sozinhos a cada reinício do bot, e "eu caí uma posição sem
 * ninguém falar nada" é um defeito que ninguém consegue reproduzir.
 */
export function ordenarRanking(usuarios: Record<string, UsuarioDeNiveis>): LinhaDoRanking[] {
  return Object.entries(usuarios)
    .filter(([, u]) => u.xp > 0)
    .sort(([idA, a], [idB, b]) => b.xp - a.xp || (idA < idB ? -1 : idA > idB ? 1 : 0))
    .map(([usuarioId, u], indice) => ({
      usuarioId,
      xp: u.xp,
      nivel: nivelDoXp(u.xp),
      mensagens: u.mensagens,
      posicao: indice + 1,
    }));
}

/** A posição de alguém, ou `0` se ainda não pontuou. */
export function posicaoNoRanking(ordenado: LinhaDoRanking[], usuarioId: string): number {
  return ordenado.find((l) => l.usuarioId === usuarioId)?.posicao ?? 0;
}

export interface Pagina {
  itens: LinhaDoRanking[];
  /** Já grampeada em [1, paginas]. */
  pagina: number;
  paginas: number;
  total: number;
}

/**
 * Uma página do ranking, com o número **grampeado**.
 *
 * `/ranking 99` num servidor de duas páginas devolve a última, e não uma lista
 * vazia: quem digita um número grande quer o fim, não um erro.
 */
export function paginar(
  ordenado: LinhaDoRanking[],
  pagina: number,
  porPagina: number = POR_PAGINA,
): Pagina {
  const total = ordenado.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pedida = Number.isFinite(pagina) ? Math.floor(pagina) : 1;
  const atual = Math.min(Math.max(pedida, 1), paginas);
  const inicio = (atual - 1) * porPagina;
  return { itens: ordenado.slice(inicio, inicio + porPagina), pagina: atual, paginas, total };
}
