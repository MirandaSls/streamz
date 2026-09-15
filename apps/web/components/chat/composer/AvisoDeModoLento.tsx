"use client";

import { slowmodeLabel } from "@streamz/shared";
import { Timer } from "@/components/ui/icones";
import { Tooltip } from "@/components/ui/primitivos";

/**
 * Aviso de modo lento, colado em cima da caixa do campo, à direita.
 *
 * `.cooldownWrapper_b21699{gap:4px;margin-inline-start:auto;padding:3px 8px;
 * padding-inline-end:16px;white-space:nowrap}` e `.cooldownText_b21699{
 * border-start-start-radius:8px;border-start-end-radius:8px;gap:var(--space-4)}`,
 * com o ícone depois do texto (`.slowModeIcon_b21699{margin-inline-start:4px}`)
 * — `css-bruto/sob-demanda/132839.8777680fa22a03e5.css`. O raio só em cima é o
 * que diz onde ele mora: uma aba apoiada na caixa. Antes o aviso era um número
 * solto no meio da fileira de ícones.
 *
 * Não medido: o fundo da aba (usa `--background-surface-higher`, o das barras
 * empilhadas `.stackedBars__74017`) e o tamanho da letra.
 */
export default function AvisoDeModoLento({
  segundos,
  restante,
  bloqueado,
}: {
  segundos: number;
  restante: number;
  bloqueado: boolean;
}) {
  return (
    <div className="pointer-events-none absolute bottom-full right-2.5 z-[1] flex celular:right-3">
      <Tooltip rotulo={`Modo lento ligado (${slowmodeLabel(segundos)})`}>
        <span
          aria-live="polite"
          tabIndex={0}
          className={`pointer-events-auto flex items-center gap-1 whitespace-nowrap rounded-t-lg bg-background-surface-higher py-[3px] pl-2 pr-4 text-text-xs tabular-nums ${
            bloqueado ? "text-text-default" : "text-text-muted"
          }`}
        >
          {bloqueado ? `${restante}s` : `Modo lento: ${slowmodeLabel(segundos)}`}
          <Timer size={16} aria-hidden="true" className="ml-1 shrink-0" />
        </span>
      </Tooltip>
    </div>
  );
}
