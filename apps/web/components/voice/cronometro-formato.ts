/**
 * Formato do cronômetro da call: `m:ss` até uma hora, `h:mm:ss` depois — como
 * no Discord.
 *
 * Fica num módulo sem JSX porque é a parte que se testa: o `vitest` do web não
 * transforma `.tsx` (o `tsconfig` deixa o JSX para o Next), então lógica pura
 * mora ao lado do componente, não dentro dele. Mesmo arranjo de
 * `call-split-layout.ts`.
 */
export function formatarDuracao(ms: number): string {
  // relógio do sistema pode voltar no meio da call; tempo negativo é 0:00
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dois = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${m}:${dois(s)}`;
}
