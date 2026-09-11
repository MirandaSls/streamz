"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Checkbox do Discord: `.checkboxIndicator__714a9` em
 * `css-bruto/362698.047b6f205fd7bdc1.css`.
 *
 * Medido/confirmado (cartão 0.4-controles):
 * - Quadrado 20×20 (CSS), raio 4 (`rounded` = `--radius-xs`), borda 1px;
 *   fundo/borda por estado: `--checkbox-background-default` /
 *   `--checkbox-border-default`, hover `-hover`, marcado
 *   `--checkbox-background-selected-default` (limão) /
 *   `--checkbox-border-selected-default`, marcado+hover `-selected-hover`.
 * - Visto: cor `--checkbox-icon-active` (escuro sobre o limão, regra do
 *   accent). No CSS é um traço (`.checkStroke__714a9`, não preenchido),
 *   animado em **300ms `cubic-bezier(.65,0,.83,.83)`** ao marcar e **120ms
 *   `cubic-bezier(.65,0,.83,.84)`** ao desmarcar (`checkDraw__714a9`/
 *   `checkUndraw__714a9`). Aproximado aqui por opacidade+escala — desenhar o
 *   traço de fato via `stroke-dashoffset` não foi feito (ver
 *   `nao_verificado`).
 * - O CSS também tem um `.dot__714a9`: não é o indeterminado, é um pulso que
 *   acompanha marcar/desmarcar (opacidade 1→0 crescendo escala 1→3,
 *   `dotGrow__714a9`). Não implementado (ver `nao_verificado`). O
 *   **indeterminado é extensão nossa** — o Discord não documenta um terceiro
 *   estado neste componente — desenhado como um traço horizontal, "não
 *   medido".
 * - Linha: gap 12 entre o quadrado e o texto (`--space-12`), rótulo e
 *   descrição com gap 4 (`--space-4`) — os dois já batiam com o provisório
 *   e o CSS bruto (`.checkboxOption__714a9`/`.label__714a9`) confirma.
 * - Desabilitado: opacidade .5, cursor not-allowed
 *   (`.checkboxOption__714a9[data-disabled]`).
 * - `<input type="checkbox">` real por cima do quadrado, visualmente
 *   transparente (não `display:none` — continua focável e clicável);
 *   `indeterminado` usa a propriedade DOM `indeterminate` (não existe
 *   atributo HTML para isso) e troca o visto pelo traço.
 * - Foco de teclado: o `:focus-visible` global de `globals.css` exclui
 *   `input` de propósito (linha ~92, é dos campos de texto) — o anel aqui é
 *   reimplementado via `peer-focus-visible` no quadrado, mesma cor
 *   (`--border-focus`) e offset do anel padrão.
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

export function Checkbox({
  marcado,
  aoMudar,
  desabilitado,
  indeterminado,
  id,
  rotulo,
  descricao,
  rotuloAcessivel,
  className = "",
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // `indeterminate` não é atributo HTML — só existe como propriedade do nó do DOM.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = Boolean(indeterminado) && !marcado;
  }, [indeterminado, marcado]);

  const mostrarTraco = Boolean(indeterminado) && !marcado;

  return (
    <label
      className={`group flex items-start gap-3 ${desabilitado ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}
    >
      <span className="relative mt-0.5 h-[20px] w-[20px] shrink-0">
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          checked={marcado}
          disabled={desabilitado}
          aria-label={rotuloAcessivel}
          onChange={(e) => aoMudar(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-[inherit] appearance-none opacity-0 outline-none"
        />
        <span
          aria-hidden
          className={`pointer-events-none flex h-full w-full items-center justify-center rounded border transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-border-focus ${
            marcado
              ? "border-checkbox-border-selected-default bg-checkbox-background-selected-default group-hover:border-checkbox-border-selected-hover group-hover:bg-checkbox-background-selected-hover"
              : "border-checkbox-border-default bg-checkbox-background-default group-hover:border-checkbox-border-hover group-hover:bg-checkbox-background-hover"
          }`}
        >
          {mostrarTraco ? (
            <span className="h-[2px] w-[10px] rounded-full bg-checkbox-icon-active" />
          ) : (
            <svg
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
              className={`h-full w-full text-checkbox-icon-active transition-[opacity,transform] ${
                marcado
                  ? "scale-100 opacity-100 duration-300 ease-[cubic-bezier(.65,0,.83,.83)]"
                  : "scale-50 opacity-0 duration-[120ms] ease-[cubic-bezier(.65,0,.83,.84)]"
              }`}
            >
              <path d="M4.5 10.5L8 14L15.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </span>
      {rotulo || descricao ? (
        <span className="flex flex-col gap-1">
          {rotulo ? <span className="text-text-md text-text-default">{rotulo}</span> : null}
          {descricao ? <span className="text-text-sm text-text-muted">{descricao}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
