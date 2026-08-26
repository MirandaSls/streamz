import { MAX_TIMEOUT_MINUTES, isTimedOut } from "@streamz/shared";

/**
 * Regras puras do castigo (timeout), fora do service para poderem ser testadas
 * sem banco e para que a mesma frase apareça em toda recusa.
 */

/** Formata o fim do castigo como a UI mostra: "25/08 às 14:03". */
export function formatarFim(until: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(until.getDate())}/${dois(until.getMonth() + 1)} às ${dois(until.getHours())}:${dois(until.getMinutes())}`;
}

/**
 * A frase de recusa quando alguém de castigo tenta escrever ou reagir; `null`
 * quando o castigo não vale mais (data ausente ou no passado).
 *
 * Devolver a mensagem em vez de um booleano é de propósito: quem está de
 * castigo precisa saber **até quando**, e essa frase é a mesma no gateway, no
 * REST e no aviso do composer.
 */
export function motivoDeBloqueio(
  timeoutUntil: Date | string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!timeoutUntil) return null;
  const until = timeoutUntil instanceof Date ? timeoutUntil : new Date(timeoutUntil);
  if (!isTimedOut(until.toISOString(), now)) return null;
  return `Você está de castigo até ${formatarFim(until)}`;
}

/**
 * Converte a escolha do moderador em data de fim. Aceita minutos (presets) ou
 * uma data explícita, e recusa o que não faz sentido — castigo no passado ou
 * além do teto de 28 dias.
 */
export function calcularFim(
  input: { minutes?: number; until?: string },
  now: number = Date.now(),
): { ok: true; until: Date } | { ok: false; message: string } {
  if (input.until) {
    const t = new Date(input.until).getTime();
    if (!Number.isFinite(t)) return { ok: false, message: "Data de castigo inválida" };
    if (t <= now) return { ok: false, message: "O castigo precisa terminar no futuro" };
    if (t - now > MAX_TIMEOUT_MINUTES * 60_000) {
      return { ok: false, message: "O castigo não pode passar de 28 dias" };
    }
    return { ok: true, until: new Date(t) };
  }
  const minutes = input.minutes ?? 0;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false, message: "Duração de castigo inválida" };
  }
  if (minutes > MAX_TIMEOUT_MINUTES) {
    return { ok: false, message: "O castigo não pode passar de 28 dias" };
  }
  return { ok: true, until: new Date(now + minutes * 60_000) };
}
