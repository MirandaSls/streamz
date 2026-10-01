/**
 * Divide os ids de janela em lotes para a varredura de miniaturas.
 *
 * Por que lotes: pedir todas as janelas numa chamada só faz a grade ficar
 * vazia até a varredura inteira voltar (segundos com muitas janelas). Com
 * lotes pequenos, cada um pinta assim que volta.
 *
 * Por que essa ordem: ids que ainda não têm miniatura vêm primeiro, para a
 * primeira pintura ser rápida; os já pintados (só renovação) ficam por último.
 * Dentro de cada grupo a ordem original da lista é preservada.
 */
export function lotesDeMiniaturas(
  ids: readonly string[],
  jaTem: (id: string) => boolean,
  tamanho: number,
): string[][] {
  const t = Math.max(1, Math.floor(tamanho));
  const semMiniatura = ids.filter((id) => !jaTem(id));
  const comMiniatura = ids.filter((id) => jaTem(id));
  const ordenados = [...semMiniatura, ...comMiniatura];
  const lotes: string[][] = [];
  for (let i = 0; i < ordenados.length; i += t) lotes.push(ordenados.slice(i, i + t));
  return lotes;
}
