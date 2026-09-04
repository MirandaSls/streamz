/**
 * Quais canais uma categoria **recolhida** continua mostrando.
 *
 * Recolher uma categoria no Discord não esconde tudo: o canal em que você está
 * e os canais com novidade continuam na coluna. É o que impede o colapso de
 * virar um buraco — sem esta regra, uma mensagem nova numa categoria fechada
 * ficaria invisível, e um canal recém-criado ali dentro pareceria não ter sido
 * criado (era exatamente o bug relatado: "o canal é criado 'fechado'").
 *
 * A regra mora aqui, fora do componente, porque é decisão de produto e não
 * desenho: dá para testá-la sem montar a barra lateral inteira.
 */

/** O que a coluna sabe sobre um canal na hora de decidir se ele aparece. */
export interface EstadoDoCanalNaColuna {
  /** é o canal aberto agora (ou o canal de voz cujo palco está montado). */
  ativo: boolean;
  /** tem mensagem não lida que conta — silenciado já chega aqui como `false`. */
  naoLido: boolean;
  /** menções dirigidas a mim neste canal. */
  mencoes: number;
}

/**
 * Um canal continua visível numa categoria recolhida quando é o ativo ou tem
 * novidade (não lido ou menção).
 */
export function visivelComRecolhida({ ativo, naoLido, mencoes }: EstadoDoCanalNaColuna): boolean {
  return ativo || naoLido || mencoes > 0;
}

/**
 * A mesma decisão já contando o estado da categoria: expandida mostra tudo,
 * recolhida delega para `visivelComRecolhida`.
 *
 * Existe para o componente não precisar repetir o `if` — a barra lateral chama
 * só esta, e a regra do recolhido fica num lugar só.
 */
export function canalVisivel(
  estado: EstadoDoCanalNaColuna & { recolhida: boolean },
): boolean {
  return !estado.recolhida || visivelComRecolhida(estado);
}
