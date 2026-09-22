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
 *
 * A proporção e o vão saem do CSS do Discord e batem nas prints 1:1:
 * `.tile_ad58e7{aspect-ratio:16/9;border-radius:var(--radius-sm)}` e
 * `.gridContainer_ad58e7{gap:var(--space-8)}`
 * (`css-bruto/sob-demanda/f8c6050e8572a0c3.css`). Na print
 * `2026-08-31 101857` (1:1) dois tiles de 760×428 com 8px pretos entre eles
 * (linha y=470, x=1143–1150); na `2026-08-31 123917` (1:1) três tiles de
 * 291×163 com o mesmo vão (x=673–680).
 */

export interface Arranjo {
  colunas: number;
  linhas: number;
  /** tamanho de **um** tile, em pixels. */
  largura: number;
  altura: number;
}

/** Vão entre tiles: `--space-8` do `.gridContainer_ad58e7`, conferido nas duas prints. */
export const GAP = 8;

/**
 * Folga lateral do palco até o primeiro tile. Print `101857`: 9px pretos entre
 * a barra lateral e o tile da esquerda (x=374–382, o primeiro é o filete de 1px
 * da lista de canais) e 8 do tile da direita até a borda da janela
 * (x=1911–1918). Quem aplica é o dono do palco (`CallStage`, `VoicePanel`).
 */
export const FOLGA_DO_PALCO = 8;

const PROPORCAO = 16 / 9;

/**
 * O leiaute de **foco**: um tile grande em cima, os outros numa faixa embaixo.
 *
 * Medido na print `docs/Reference/Captura de tela 2026-09-03 203909.png`, na
 * escala 0,8075 (= 2777/3439, a largura da imagem sobre a do monitor do
 * usuário; conferida pelo passo da lista de canais — 26px medidos, 32 reais —,
 * pelo avatar do card do usuário — 25px, 32 — e pela cápsula de controles —
 * 38px, 48):
 *
 * | o quê | na print | real |
 * |---|---|---|
 * | destaque | 1458×823 (16:9 exato) | 1806×1019 |
 * | folga lateral do destaque | 229 de cada lado | centralizado |
 * | vão destaque → faixa | 6 | **8** |
 * | tile da faixa | 150×86 | **188×106** |
 *
 * O destaque não tem tamanho fixo: ele é 16:9 **contido** na área que sobra, e
 * é por isso que a conta dele é `melhorArranjo(1, …)`. Só a faixa é fixa — no
 * Discord a miniatura tem o mesmo tamanho com dois ou com dez participantes, e
 * a faixa rola de lado quando não cabem.
 */
export const FOCO_GAP = 8;
export const FAIXA_ALTURA = 106;
export const FAIXA_LARGURA = 188;
/**
 * Vão entre miniaturas: a print só tem uma, então o número não sai dela. Fica
 * o `--space-8` do `.gridContainer_ad58e7`, que é o vão da grade inteira.
 */
export const FAIXA_GAP = 8;

/**
 * Altura que sobra ao destaque depois de descontada a tira de miniaturas.
 *
 * `naTira` é quanta gente vai para a tira — com zero não há tira, e o
 * destaque fica com a área inteira. (O nome não é `naFaixa` porque "faixa",
 * neste arquivo, passou a querer dizer a faixa de chamada sobre a conversa;
 * a tira é a fileira de miniaturas do modo foco.)
 */
export function alturaDoDestaque(altura: number, naTira: number): number {
  return naTira > 0 ? altura - FAIXA_ALTURA - FOCO_GAP : altura;
}

/**
 * Se "destaque + tira" ainda vale a pena nesta área, ou se é hora de cair para
 * a grade.
 *
 * **São duas regras, porque são dois lugares.**
 *
 * 1. **Na faixa de chamada sobre a conversa é sempre grade** — por medida, não
 *    por conta. Na print
 *    `docs/Reference/Captura de Tela 2026-09-21 às 15.04.09.png` (2866×1546,
 *    2×: o rail mede 144px = 72 reais) a chamada está numa faixa sobre a
 *    conversa de uma DM com **três tiles iguais numa fileira** — transmissão ao
 *    vivo, e duas pessoas —, de 688×387 px = **344×193,5 reais (16:9)**, vão de
 *    16 = **8**, ocupando a largura toda dos 1058 reais da área. **Não há tira
 *    de miniaturas separada e não há destaque**: mesmo ao vivo, a transmissão é
 *    só mais uma célula. A fileira fica centralizada na faixa de 745px =
 *    **372,5 reais**, com ~86 acima e ~93 abaixo, e a cápsula de controles
 *    flutua por cima dessa folga (a faixa não reserva altura para ela — ver
 *    `folgaDaGrade`, em `CallStage`).
 *
 *    Sem a regra própria a aritmética do item 2 escolheria o foco nessa faixa:
 *    com 372 de altura o destaque sai com 258 contra os ~192 do tile da grade.
 *    A aritmética não está errada — ela só não sabe que ali o destaque custa a
 *    conversa inteira logo abaixo, e o Discord decidiu que não vale.
 *
 * 2. **Fora dela o critério é uma comparação**, não um limiar de altura. O
 *    destaque só merece a tira quando fica **maior do que a grade daria ao
 *    mesmo tile**; se não fica, o foco é prejuízo puro — vista principal menor
 *    *e* uma tira roubando altura. Como os dois lados são 16:9, comparar altura
 *    é comparar área. É o que sustenta o foco do canal de voz da print
 *    `2026-09-03 203909`, e é o que devolve a grade quando a área não comporta
 *    o destaque.
 *
 * Sem medida (primeiro quadro, SSR) a resposta é a grade: no foco a tira tem
 * altura fixa e apareceria **sozinha**, com o destaque em 0×0 — exatamente o
 * defeito que esta função existe para evitar.
 */
export function palcoUsaFoco(
  naTira: number,
  largura: number,
  altura: number,
  faixaDeChamada = false,
): boolean {
  // Sem ninguém na tira não há troca a fazer: o foco é um tile na área inteira.
  // Vem antes da faixa de propósito — sem tira não existe o arranjo que a regra
  // da faixa recusa, e o ramo de foco é o mesmo tile ocupando a mesma área.
  if (naTira <= 0) return true;
  // a faixa decide antes da aritmética: lá a medida diz grade em qualquer altura
  if (faixaDeChamada) return false;
  if (largura <= 0 || altura <= 0) return false;
  const destaque = melhorArranjo(1, largura, alturaDoDestaque(altura, naTira));
  const grade = melhorArranjo(naTira + 1, largura, altura);
  return destaque.altura > grade.altura;
}

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
