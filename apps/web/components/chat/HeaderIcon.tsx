"use client";

import type { MouseEvent, ReactNode } from "react";
import Tooltip from "@/components/ui/Tooltip";

/**
 * Botão de ícone da toolbar do cabeçalho (24px, hover claro, ativo branco).
 *
 * Fica em arquivo próprio porque o `HeaderPopover` também o usa, e o cabeçalho
 * já monta popovers — mantê-lo dentro do `HeaderBar` fecharia um ciclo de
 * importação entre os dois.
 *
 * **As três cores são as do ícone do cabeçalho do Discord**, e não as de texto
 * que estavam aqui. No CSS bruto (`858942….css`, o módulo do cabeçalho do
 * canal): `.clickable__9293f .icon__9293f{color:var(--icon-muted)}`,
 * `:hover{color:var(--icon-subtle)}`, `.selected__9293f{color:var(--icon-strong)}`
 * e `.iconDisabled__9293f{opacity:.6}`. Bate com o print 1:1 `2026-09-02 180835`:
 * em repouso a tinta dos ícones do cabeçalho mede #96979e (`--icon-muted`;
 * linha y=52, x1542–1553) e o de membros, que está ligado, mede #fbfbfb
 * (`--icon-strong`; linha y=62, x1624–1635). Nós desenhávamos o repouso em
 * `text-text-subtle` (#abacb2 na nossa `canal-texto.png`), que é justamente a
 * cor de **hover** do Discord — todos os ícones já nasciam acesos.
 *
 * A **caixa** continua de 24px. O CSS do Discord tem 32
 * (`.iconWrapper__9293f{height:var(--space-32);width:var(--space-32)}`), mas
 * trocar aqui mexe no ponto de ancoragem do `HeaderPopover` (que mede a caixa
 * do botão) e no cabeçalho de Amigos, os dois fora deste cartão — ver
 * "faltando".
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
          ? "cursor-not-allowed text-icon-muted opacity-60"
          : active
            ? "text-icon-strong"
            : "text-icon-muted hover:text-icon-subtle"
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
