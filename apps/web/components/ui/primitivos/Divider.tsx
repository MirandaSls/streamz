import type { ReactNode } from "react";

/**
 * Divisória do Discord: 1px `--border-subtle` (`.divider_e62f9d` e dezenas de
 * `.divider_*`/`.separator_*` no CSS bruto).
 *
 * Especificação (cartão 0.4-pequenos implementa):
 * - `horizontal`: 1px de altura, largura total; margens quem decide é o uso.
 * - `vertical`: 1px de largura; altura 20 na toolbar (`.separator__841c8`) ou
 *   esticada.
 * - Com `rotulo`: linha – texto – linha (divisor de data da conversa: 12px peso
 *   600 `--text-muted`); tom `perigo` é o "NOVO" das não lidas (linha
 *   `--status-danger` e o rótulo em pílula à direita — medida "não
 *   confirmada" no CSS; o app já tem uma em `MessageList.tsx`, manter a medida
 *   dela).
 */
export interface DividerProps {
  orientacao?: "horizontal" | "vertical";
  rotulo?: ReactNode;
  tom?: "sutil" | "normal" | "perigo";
  className?: string;
}

// Implementação provisória (cartão 0.4-pequenos substitui pelo medido).
export function Divider({ orientacao = "horizontal", rotulo, tom = "sutil", className = "" }: DividerProps) {
  const cor = tom === "perigo" ? "bg-status-danger" : tom === "normal" ? "bg-border-normal" : "bg-border-subtle";
  if (orientacao === "vertical") return <span role="separator" aria-orientation="vertical" className={`inline-block w-px self-stretch ${cor} ${className}`} />;
  if (!rotulo) return <hr className={`h-px border-0 ${cor} ${className}`} />;
  return (
    <div role="separator" className={`flex items-center gap-2 ${className}`}>
      <span className={`h-px flex-1 ${cor}`} />
      <span className="text-text-xs font-semibold text-text-muted">{rotulo}</span>
      <span className={`h-px flex-1 ${cor}`} />
    </div>
  );
}
