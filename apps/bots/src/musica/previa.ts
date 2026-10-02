/**
 * Detecta faixa que o Lavalink entrega como "finished" mas que era só uma
 * prévia: uploads oficiais do SoundCloud (gravadoras, faixas Go+) declaram a
 * duração completa (ex.: 238 s) e o stream real acaba em ~30 s. Sem isto o bot
 * pulava para a próxima e o usuário ouvia só o começo das músicas.
 */

/** Abaixo disto a faixa é curta demais para dizer que "acabou cedo". */
export const DURACAO_MINIMA_MS = 90_000;
/** Teto do que ainda é suspeito de ser prévia (a prévia do SoundCloud dura ~30 s). */
export const TOCADO_MAXIMO_MS = 45_000;
/** Fração da duração declarada abaixo da qual o fim é suspeito. */
export const FRACAO_MINIMA = 0.4;

export function ehPrevia(entrada: {
  duracaoMs: number;
  tocadoMs: number;
  /** Pausa, seek ou qualquer coisa que torne o tempo de relógio inconfiável. */
  interferiuUsuario: boolean;
}): boolean {
  const { duracaoMs, tocadoMs, interferiuUsuario } = entrada;
  // Pausa/seek falsificam o tempo tocado; duração 0 ou absurda = stream/desconhecida.
  if (interferiuUsuario) return false;
  if (!Number.isFinite(duracaoMs) || duracaoMs <= DURACAO_MINIMA_MS) return false;
  if (!Number.isFinite(tocadoMs) || tocadoMs < 0) return false;
  return tocadoMs < Math.min(TOCADO_MAXIMO_MS, duracaoMs * FRACAO_MINIMA);
}
