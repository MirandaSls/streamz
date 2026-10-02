/**
 * Lógica pura do cartão de convite (`InviteEmbed`), separada para ser testável
 * sem montar React.
 */

/** Iniciais do nome ("Servidor de Md" -> "SdM"): mantém a caixa original, como o Discord. */
export function iniciaisDoServidor(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => Array.from(p)[0] ?? "")
    .join("")
    .slice(0, 4);
}

/** "1 membro", "2 membros". */
export function rotuloDeMembros(n: number): string {
  return `${n} ${n === 1 ? "membro" : "membros"}`;
}

/** "Desde out. de 2026" — mês abreviado pt-BR + ano; vazio se a data for inválida. */
export function desdeDoServidor(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // o `Intl` pt-BR devolve "out. de 2026"; fixar o fuso em UTC evita que a
  // virada de mês dependa do fuso de quem lê
  const mes = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" });
  const ano = d.getUTCFullYear();
  return `Desde ${mes} de ${ano}`;
}
