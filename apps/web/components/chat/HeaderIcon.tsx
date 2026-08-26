"use client";

import type { ReactNode } from "react";
import Tooltip from "@/components/ui/Tooltip";

/**
 * Botão de ícone da toolbar do cabeçalho (24px, hover claro, ativo branco).
 *
 * Fica em arquivo próprio porque o `HeaderPopover` também o usa, e o cabeçalho
 * já monta popovers — mantê-lo dentro do `HeaderBar` fecharia um ciclo de
 * importação entre os dois.
 */
export default function HeaderIcon({
  label,
  onClick,
  active = false,
  disabled = false,
  semTooltip = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  /** com o painel do botão aberto o tooltip só atrapalha: cobre o conteúdo. */
  semTooltip?: boolean;
  children: ReactNode;
}) {
  const botao = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-label={label}
      aria-disabled={disabled}
      aria-pressed={active || undefined}
      className={`grid h-6 w-6 place-items-center transition ${
        disabled
          ? "cursor-not-allowed text-txt-secondary opacity-50"
          : active
            ? "text-txt-primary"
            : "text-txt-secondary hover:text-txt-primary"
      }`}
    >
      {children}
    </button>
  );

  if (semTooltip) return botao;
  return (
    <Tooltip label={disabled ? `${label} (em breve)` : label} side="bottom">
      {botao}
    </Tooltip>
  );
}
