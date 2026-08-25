"use client";

import type { ReactNode } from "react";

type Side = "top" | "right" | "bottom" | "left";

const POSITION: Record<Side, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  right: "left-full top-1/2 ml-3 -translate-y-1/2",
  left: "right-full top-1/2 mr-3 -translate-y-1/2",
};

const ARROW: Record<Side, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-rail border-x-transparent border-b-transparent",
  bottom:
    "bottom-full left-1/2 -translate-x-1/2 border-b-rail border-x-transparent border-t-transparent",
  right: "right-full top-1/2 -translate-y-1/2 border-r-rail border-y-transparent border-l-transparent",
  left: "left-full top-1/2 -translate-y-1/2 border-l-rail border-y-transparent border-r-transparent",
};

/**
 * Tooltip escuro com seta, como o do Discord — aparece no hover e no foco de
 * teclado. Só CSS: sem portal nem cálculo de posição, o que basta para os
 * ícones do rail, das toolbars e do rodapé.
 */
export default function Tooltip({
  label,
  side = "top",
  children,
  className = "",
}: {
  label: string;
  side?: Side;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[70] whitespace-nowrap rounded bg-rail px-3 py-2 text-sm font-semibold text-txt-primary opacity-0 shadow-high transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${POSITION[side]}`}
      >
        {label}
        <span
          aria-hidden="true"
          className={`absolute border-[5px] ${ARROW[side]}`}
        />
      </span>
    </span>
  );
}
