"use client";

import type { ReactElement } from "react";
import TooltipAtual from "../Tooltip";

/**
 * Dica do Discord: `.tooltip_c36707` / `.tooltipPrimary_c36707` em
 * `css-bruto/858942.086f3345af1722be.css`.
 *
 * Especificação medida (cartão 0.4-tooltip implementa):
 * - Fundo `--background-surface-high`, texto `--text-default` 14px peso 500
 *   linha 16, padding 8×12, raio 8, `max-width` 190, borda 1px
 *   `--border-subtle`, sombra `--shadow-high`, z-index acima de modal.
 * - Seta: triângulo de base 10 e altura 5, na cor do fundo.
 * - Cores: `primaria` (padrão), `cinza`, `marca` (limão, texto ESCURO),
 *   `perigo`, `positiva` — ver as variantes `tooltipGrey/Brand/Red/Green`.
 * - Atraso de abrir no hover: 300 ms (o que o app já usa; o Discord abre em JS e
 *   o número não está no CSS). Foco de teclado abre na hora. Toque não abre.
 * - Distância do alvo: 8 (não está no CSS; é a que o app usa e bate nos prints).
 *
 * A implementação atual (`components/ui/Tooltip.tsx`) continua existindo como
 * a peça que posiciona; o cartão 0.4-tooltip leva a lógica para cá e deixa o
 * arquivo antigo como reexportação compatível (`label`/`side`/`shortcut`).
 */
export type LadoDaDica = "top" | "right" | "bottom" | "left";
export type CorDaDica = "primaria" | "cinza" | "marca" | "perigo" | "positiva";

export interface TooltipProps {
  rotulo: string;
  lado?: LadoDaDica;
  /** ms antes de abrir no hover. Padrão 300. */
  atraso?: number;
  desabilitado?: boolean;
  cor?: CorDaDica;
  /** Atalho de teclado mostrado ao lado do texto. */
  atalho?: string;
  /** Um elemento só, que recebe os eventos de hover e foco. */
  children: ReactElement;
  className?: string;
}

// Implementação provisória: delega à dica atual (cartão 0.4-tooltip substitui).
export function Tooltip({ rotulo, lado = "top", desabilitado = false, atalho, children, className }: TooltipProps) {
  if (desabilitado) return children;
  return (
    <TooltipAtual label={rotulo} side={lado} shortcut={atalho} className={className}>
      {children}
    </TooltipAtual>
  );
}
