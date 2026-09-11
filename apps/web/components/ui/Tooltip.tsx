"use client";

import { type ReactElement, type ReactNode } from "react";
import { Tooltip as TooltipPrimitivo } from "./primitivos/Tooltip";

type Side = "top" | "right" | "bottom" | "left";

/**
 * Invólucro compatível: dezenas de consumidores importam este arquivo por
 * `label`/`side`/`shortcut`/`className`/`children` e não podem mudar agora
 * (cartão 0.4-tooltip). A lógica de posicionamento e o visual medido do
 * Discord vivem em `primitivos/Tooltip.tsx` — aqui só se traduz o nome dos
 * props.
 *
 * `children` continua `ReactNode` por compatibilidade de tipo com quem já
 * importava daqui, mas na prática todo consumidor passa um único elemento
 * (ícone ou botão) — o mesmo que o primitivo exige.
 */
export default function Tooltip({
  label,
  side = "top",
  shortcut,
  children,
  className = "",
}: {
  label: string;
  side?: Side;
  /** atalho mostrado em pílula à direita do rótulo. */
  shortcut?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TooltipPrimitivo rotulo={label} lado={side} atalho={shortcut} className={className}>
      {children as ReactElement}
    </TooltipPrimitivo>
  );
}
