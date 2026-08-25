/**
 * Datas e horas no formato que o Discord mostra (pt-BR):
 * "Hoje às 14:03", "Ontem às 09:12", "12/08/2026 14:03".
 */

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 0 = hoje, 1 = ontem, n = dias atrás (negativo = futuro). */
export function diasAtras(iso: string, agora = new Date()): number {
  const d = new Date(iso);
  return Math.round((inicioDoDia(agora) - inicioDoDia(d)) / 86_400_000);
}

/** "14:03" */
export function hora(iso: string): string {
  return HORA.format(new Date(iso));
}

/** "Hoje às 14:03" · "Ontem às 09:12" · "12/08/2026 14:03" */
export function horaCompleta(iso: string, agora = new Date()): string {
  const dias = diasAtras(iso, agora);
  if (dias === 0) return `Hoje às ${hora(iso)}`;
  if (dias === 1) return `Ontem às ${hora(iso)}`;
  return `${DATA_CURTA.format(new Date(iso))} ${hora(iso)}`;
}

/** Rótulo do divisor de data entre grupos de mensagens. */
export function rotuloDoDia(iso: string, agora = new Date()): string {
  const dias = diasAtras(iso, agora);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return DATA_LONGA.format(new Date(iso));
}

/** true se as duas datas caem no mesmo dia civil local. */
export function mesmoDia(a: string, b: string): boolean {
  return inicioDoDia(new Date(a)) === inicioDoDia(new Date(b));
}

/** Janela em que mensagens seguidas do mesmo autor são agrupadas (Discord: 7 min). */
export const JANELA_AGRUPAMENTO_MS = 7 * 60_000;

/**
 * Uma mensagem "continua" a anterior quando é do mesmo autor, no mesmo dia e
 * dentro da janela — nesse caso ela aparece sem avatar nem nome.
 */
export function continuaAnterior(
  anterior: { author: { id: string }; createdAt: string; parentId: string | null } | undefined,
  atual: { author: { id: string }; createdAt: string; parentId: string | null },
): boolean {
  if (!anterior) return false;
  if (anterior.author.id !== atual.author.id) return false;
  if (anterior.parentId !== atual.parentId) return false;
  if (!mesmoDia(anterior.createdAt, atual.createdAt)) return false;
  const delta = new Date(atual.createdAt).getTime() - new Date(anterior.createdAt).getTime();
  return delta >= 0 && delta < JANELA_AGRUPAMENTO_MS;
}
