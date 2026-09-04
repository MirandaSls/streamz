"use client";

import type { MouseEvent, ReactNode } from "react";
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
  motivoDesabilitado,
  semTooltip = false,
  children,
}: {
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  /**
   * Por que o botão está cinza. Sem isto o tooltip do desabilitado é sempre
   * "(em breve)", que é verdade para os botões ainda sem função e mentira para
   * o telefone durante uma chamada — ali o motivo é "já estou nela".
   */
  motivoDesabilitado?: string;
  /** com o painel do botão aberto o tooltip só atrapalha: cobre o conteúdo. */
  semTooltip?: boolean;
  children: ReactNode;
}) {
  const botao = (
    <button
      type="button"
      // `aria-disabled` e não o atributo `disabled`: um `<button disabled>` não
      // dispara evento de ponteiro nenhum no Chromium, e o tooltip que explica
      // *por que* ele está cinza nunca apareceria. O clique já não faz nada
      // (o `onClick` some), e a guarda de verdade contra o clique repetido
      // está na store (`chamada-em-curso.ts`) — o botão é o aviso, não a trava
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
  const dica = disabled ? (motivoDesabilitado ?? `${label} (em breve)`) : label;
  return (
    <Tooltip label={dica} side="bottom">
      {botao}
    </Tooltip>
  );
}
