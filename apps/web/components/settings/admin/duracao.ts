/**
 * "há 12 min" a partir de um epoch em ms.
 *
 * Fica fora de `comuns.tsx` para poder ser testada sem React — é a única conta
 * do painel que tem casos de borda (o minuto zero, a virada da hora, a hora
 * cheia) e é ela que decide se a lista de chamadas parece viva ou parada.
 *
 * `null` vira travessão em vez de "agora": estado de voz gravado antes de o
 * `entrouEm` existir não sabe desde quando a pessoa está lá, e chutar zero
 * mostraria toda chamada antiga como recém-começada.
 */
export function duracao(desde: number | null, agora = Date.now()): string {
  if (desde === null) return "—";
  const s = Math.max(0, Math.round((agora - desde) / 1000));
  if (s < 60) return "agora há pouco";
  const min = Math.floor(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `há ${h} h` : `há ${h} h ${resto} min`;
}
