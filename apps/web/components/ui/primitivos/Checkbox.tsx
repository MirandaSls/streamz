"use client";

import type { ReactNode } from "react";

/**
 * Checkbox do Discord: `.checkboxIndicator__714a9` em
 * `css-bruto/362698.047b6f205fd7bdc1.css`.
 *
 * Especificação medida (cartão 0.4-controles implementa):
 * - Quadrado 20×20, raio 4 (`--radius-xs`), borda 1px, fundo/borda por estado:
 *   `--checkbox-background-default` / `--checkbox-border-default`, hover
 *   `-hover`, marcado `--checkbox-background-selected-default` (limão) /
 *   `--checkbox-border-selected-default`, marcado+hover `-selected-hover`.
 * - Visto: SVG ocupando o quadrado, cor `--checkbox-icon-active` (escuro sobre o
 *   limão), desenhado com animação de 300 ms `cubic-bezier(.65,0,.83,.83)` ao
 *   marcar e 120 ms ao desmarcar (respeita `reduzir-movimento`).
 * - Linha: gap 12 entre o quadrado e o texto; rótulo e descrição com gap 4.
 * - Desabilitado: opacidade .5.
 * - `<input type="checkbox">` real (acessível) visualmente escondido, com o
 *   quadrado desenhado ao lado; `indeterminado` mostra um traço.
 */
export interface CheckboxProps {
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
  desabilitado?: boolean;
  indeterminado?: boolean;
  id?: string;
  /** Texto ao lado. Sem ele, passe `rotuloAcessivel`. */
  rotulo?: ReactNode;
  descricao?: ReactNode;
  rotuloAcessivel?: string;
  className?: string;
}

// Implementação provisória (cartão 0.4-controles substitui pelo medido).
export function Checkbox({
  marcado,
  aoMudar,
  desabilitado,
  id,
  rotulo,
  descricao,
  rotuloAcessivel,
  className = "",
}: CheckboxProps) {
  return (
    <label className={`flex items-start gap-3 ${desabilitado ? "opacity-50" : "cursor-pointer"} ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        disabled={desabilitado}
        aria-label={rotuloAcessivel}
        onChange={(e) => aoMudar(e.target.checked)}
        className="mt-0.5 h-[20px] w-[20px] shrink-0 accent-brand-500"
      />
      {rotulo || descricao ? (
        <span className="flex flex-col gap-1">
          {rotulo ? <span className="text-text-md text-text-default">{rotulo}</span> : null}
          {descricao ? <span className="text-text-sm text-text-muted">{descricao}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
