// Parte pura do fallback de playlist do Spotify: resolve cada faixa do embed
// por um mapeador injetado, com concorrência limitada e ordem preservada.

export const CONCORRENCIA_PLAYLIST = 4;

export interface ResolucaoEmOrdem<R> {
  /** Resultados na ordem da entrada; faixas não achadas ficam de fora. */
  achadas: R[];
  puladas: number;
}

/**
 * Por quê: disparar 100 buscas de uma vez estoura o Lavalink; e a ordem da
 * playlist é o que a pessoa espera ouvir, então cada resultado volta ao índice
 * de origem em vez de entrar na ordem em que a busca terminou.
 * Mapeador que devolve null/undefined ou lança conta como pulada.
 */
export async function resolverEmOrdem<T, R>(
  itens: readonly T[],
  mapear: (item: T) => Promise<R | null | undefined>,
  concorrencia = CONCORRENCIA_PLAYLIST,
): Promise<ResolucaoEmOrdem<R>> {
  const resultados: (R | null)[] = new Array(itens.length).fill(null);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      try {
        resultados[i] = (await mapear(itens[i]!)) ?? null;
      } catch {
        resultados[i] = null;
      }
    }
  };
  const n = Math.max(1, Math.min(concorrencia, itens.length));
  await Promise.all(Array.from({ length: n }, trabalhador));
  const achadas = resultados.filter((r): r is R => r !== null);
  return { achadas, puladas: itens.length - achadas.length };
}
