/**
 * Como arrumar N tiles numa área fixa.
 *
 * O palco do Discord **não rola**: os participantes se redimensionam para caber
 * todos na tela. Isso é uma conta, não uma tabela de breakpoints — a mesma
 * quantidade de pessoas pede colunas diferentes num palco largo e num estreito.
 *
 * A regra é escolher o número de colunas que maximiza a área de cada tile
 * mantendo a proporção 16:9 dentro do retângulo disponível. Duas pessoas num
 * palco largo dão dois tiles grandes lado a lado; cinco dão 3 + 2 centralizado.
 */

export interface Arranjo {
  colunas: number;
  linhas: number;
  /** tamanho de **um** tile, em pixels. */
  largura: number;
  altura: number;
}

export const GAP = 12;
const PROPORCAO = 16 / 9;

export function melhorArranjo(
  quantidade: number,
  largura: number,
  altura: number,
  gap = GAP,
  proporcao = PROPORCAO,
): Arranjo {
  if (quantidade <= 0 || largura <= 0 || altura <= 0) {
    return { colunas: 1, linhas: 1, largura: 0, altura: 0 };
  }

  let melhor: Arranjo = { colunas: 1, linhas: quantidade, largura: 0, altura: 0 };
  for (let colunas = 1; colunas <= quantidade; colunas++) {
    const linhas = Math.ceil(quantidade / colunas);
    let w = (largura - gap * (colunas - 1)) / colunas;
    let h = w / proporcao;
    // não coube na altura: a altura passa a mandar e a largura segue a proporção
    const alturaTotal = h * linhas + gap * (linhas - 1);
    if (alturaTotal > altura) {
      h = (altura - gap * (linhas - 1)) / linhas;
      w = h * proporcao;
    }
    if (w <= 0 || h <= 0) continue;
    if (w * h > melhor.largura * melhor.altura) {
      melhor = { colunas, linhas, largura: Math.floor(w), altura: Math.floor(h) };
    }
  }
  return melhor;
}

/**
 * Quantos tiles em cada linha, equilibrado — é o que centraliza a última linha
 * incompleta (5 em 3 colunas vira 3 + 2, e não 3 + 1 + 1 nem 3 + 2 encostado à
 * esquerda).
 */
export function distribuir(quantidade: number, colunas: number): number[] {
  if (quantidade <= 0) return [];
  const linhas = Math.max(1, Math.ceil(quantidade / Math.max(1, colunas)));
  const base = Math.floor(quantidade / linhas);
  const sobra = quantidade % linhas;
  return Array.from({ length: linhas }, (_, i) => base + (i < sobra ? 1 : 0));
}
