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
 *
 * `subtitle`: linha secundária (ex.: "2 membros" na dica de um grupo de DM no
 * rail) — repassada como `subtitulo` ao primitivo (cartão
 * rail-tooltip-contextmenu).
 *
 * `rail`: a dica do rail do Discord usa o tamanho e a distância do ícone de
 * servidor, não os padrões deste invólucro — `tamanho="servidor"` (corpo
 * 16px, `max-width` 196) e `distancia={12}` (o primitivo usa 8 por padrão).
 * Medido em `GuildRail.tsx` (cartão rail-tooltip-contextmenu, origem: print
 * 1:1 `2026-08-31 123822.png` — caixa de 36px de altura, ~12-13px do ícone à
 * caixa — contra os 34px/8px que a dica do rail desenhava com os padrões
 * deste invólucro).
 */
export default function Tooltip({
  label,
  side = "top",
  shortcut,
  subtitle,
  rail = false,
  children,
  className = "",
}: {
  label: string;
  side?: Side;
  /** atalho mostrado em pílula à direita do rótulo. */
  shortcut?: string;
  subtitle?: ReactNode;
  rail?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TooltipPrimitivo
      rotulo={label}
      lado={side}
      atalho={shortcut}
      subtitulo={subtitle}
      tamanho={rail ? "servidor" : undefined}
      distancia={rail ? 12 : undefined}
      className={className}
    >
      {children as ReactElement}
    </TooltipPrimitivo>
  );
}
