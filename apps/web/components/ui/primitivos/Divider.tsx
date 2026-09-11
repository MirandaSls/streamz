import type { ReactNode } from "react";

/**
 * Divisória do Discord: 1px `--border-subtle` (`.divider_e62f9d` e dezenas de
 * `.divider_*`/`.separator_*` no CSS bruto).
 *
 * Medido (cartão 0.4-pequenos):
 * - `horizontal`: 1px de altura, 100% de largura (`.divider_e62f9d{height:1px;
 *   width:100%;background-color:var(--border-subtle)}`, letra por letra);
 *   margens quem decide é o uso.
 * - `vertical`: 1px de largura, esticada por padrão (`self-stretch`); a
 *   toolbar do Discord fixa 20px (`.separator__841c8{height:20px;width:1px}`)
 *   — quem precisa disso passa `className="h-5"` (20px), não é o padrão do
 *   primitivo porque a maioria dos usos estica.
 * - Com `rotulo`: linha – texto – linha. Medida do divisor de **data**
 *   (`DateDivider` em `MessageList.tsx`, mantida aqui): `text-xs` (12px)
 *   `font-semibold` `text-text-muted`, `px-1` entre o texto e as linhas —
 *   bate com o CSS achado para esse padrão. tom `perigo` é o "NOVO" das não
 *   lidas: mesma medida do `UnreadDivider` de `MessageList.tsx` — só a linha
 *   da esquerda (sem linha depois do rótulo), pílula com canto de baixo
 *   arredondado (`rounded-b-sm`, não a escala de raio do Discord — é a forma
 *   que o Discord usa ali, "colada" no topo da primeira mensagem não lida) em
 *   `--status-danger`, texto 10px peso 700 caixa-alta.
 */
export interface DividerProps {
  orientacao?: "horizontal" | "vertical";
  rotulo?: ReactNode;
  tom?: "sutil" | "normal" | "perigo";
  className?: string;
}

export function Divider({ orientacao = "horizontal", rotulo, tom = "sutil", className = "" }: DividerProps) {
  const cor = tom === "perigo" ? "bg-status-danger" : tom === "normal" ? "bg-border-normal" : "bg-border-subtle";

  if (orientacao === "vertical") {
    return <span role="separator" aria-orientation="vertical" className={`inline-block w-px self-stretch ${cor} ${className}`} />;
  }

  if (!rotulo) {
    return <hr className={`h-px w-full border-0 ${cor} ${className}`} />;
  }

  if (tom === "perigo") {
    // "NOVO" das não lidas — mesma medida de `UnreadDivider` em MessageList.tsx: só a linha da esquerda.
    return (
      <div role="separator" className={`flex items-center ${className}`}>
        <span className="h-px flex-1 bg-status-danger" />
        <span className="rounded-b-sm bg-status-danger px-1 py-px text-[10px] font-bold uppercase leading-[13px] tracking-wide text-control-critical-primary-text-default">
          {rotulo}
        </span>
      </div>
    );
  }

  // divisor de data — mesma medida de `DateDivider` em MessageList.tsx.
  return (
    <div role="separator" className={`flex items-center ${className}`}>
      <span className={`h-px flex-1 ${cor}`} />
      <span className="px-1 text-xs font-semibold text-text-muted">{rotulo}</span>
      <span className={`h-px flex-1 ${cor}`} />
    </div>
  );
}
