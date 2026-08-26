import { PTT_RELEASE_MS } from "@streamz/shared";

/**
 * Push-to-talk — a parte pura.
 *
 * A regra tem um detalhe que só se vê usando: soltar a tecla **não** pode
 * fechar o microfone na hora. Sem uma folga, a última sílaba de cada frase
 * some, porque a mão sai da tecla antes de a boca terminar. Daí o
 * `PTT_RELEASE_MS`: depois de soltar, o microfone continua aberto por um
 * instante e só então fecha.
 *
 * Aqui não há timer nem estado global: quem chama pergunta "está aberto
 * agora?" passando o relógio. Isso torna a regra testável e deixa o agendamento
 * (o `setTimeout` que fecha) na store, onde ele pertence.
 */

export interface PttState {
  /** quando a tecla foi pressionada; null = não está pressionada. */
  pressedAt: number | null;
  /** quando foi solta pela última vez; null = nunca foi usada. */
  releasedAt: number | null;
}

export const PTT_INICIAL: PttState = { pressedAt: null, releasedAt: null };

/** Tecla pressionada. Repetição do teclado (auto-repeat) não reinicia a contagem. */
export function pttPress(state: PttState, now: number): PttState {
  if (state.pressedAt !== null) return state;
  return { pressedAt: now, releasedAt: null };
}

/** Tecla solta. Soltar sem ter pressionado não muda nada. */
export function pttRelease(state: PttState, now: number): PttState {
  if (state.pressedAt === null) return state;
  return { pressedAt: null, releasedAt: now };
}

/** O microfone deve estar aberto neste instante? */
export function pttAberto(
  state: PttState,
  now: number,
  releaseMs: number = PTT_RELEASE_MS,
): boolean {
  if (state.pressedAt !== null) return true;
  if (state.releasedAt === null) return false;
  return now - state.releasedAt < releaseMs;
}

/**
 * Quantos ms faltam para o microfone fechar (null = não há fechamento
 * pendente). É o atraso do `setTimeout` que a store agenda ao soltar a tecla.
 */
export function pttFechaEm(
  state: PttState,
  now: number,
  releaseMs: number = PTT_RELEASE_MS,
): number | null {
  if (state.pressedAt !== null || state.releasedAt === null) return null;
  const falta = state.releasedAt + releaseMs - now;
  return falta > 0 ? falta : null;
}

/** Tecla do evento, no formato que gravamos na preferência (`KeyboardEvent.code`). */
export function pttCombina(code: string, configurada: string | null): boolean {
  return !!configurada && code === configurada;
}

/**
 * Nome legível de um `KeyboardEvent.code` para mostrar na configuração.
 * Só desembrulha os prefixos que o browser usa; o resto vai como veio.
 */
export function pttRotulo(code: string | null): string {
  if (!code) return "Nenhuma";
  if (code === "Space") return "Espaço";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return `Seta ${code.slice(5).toLowerCase()}`;
  return code;
}
