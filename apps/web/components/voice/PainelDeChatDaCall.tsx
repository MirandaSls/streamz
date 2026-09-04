"use client";

import type { ReactNode } from "react";
import { MessageSquare, X } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";

/**
 * A casca da conversa da chamada — a coluna que abre à direita do palco.
 *
 * Medida na print `docs/Reference/Captura de tela 2026-09-03 203909.png`
 * (escala 0,8075 = 2777/3439; ver `grid-layout.ts` para como a escala foi
 * conferida):
 *
 * | o quê | na print | real |
 * |---|---|---|
 * | largura do painel | 363 | **450** |
 * | cabeçalho (até o filete) | 33 → 69 = 36 | **44** |
 * | balão do cabeçalho | 14 | **18** |
 * | recuo do balão | 11 | **14** |
 * | X, da borda direita | 14 | **16** |
 * | composer (caixa inteira) | 41 | 51 |
 *
 * O cabeçalho é **só** balão + nome + X: nem busca, nem alfinete, nem lista de
 * membros. Este painel não é o canal de texto aberto de lado — é a conversa
 * *da chamada*, e cada ícone a mais aqui é um ícone a menos de nome visível
 * numa coluna de 450.
 *
 * O composer e a timeline vêm de fora (`children`): em canal de voz são os do
 * `ChatView`, em conversa direta os do `DMView`. A casca não sabe a diferença,
 * e é por isso que ela pode ser a mesma nos dois.
 */
export default function PainelDeChatDaCall({
  titulo,
  onFechar,
  children,
  largura,
}: {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  /** medida pelo `CallSplit` quando o divisor é arrastável; padrão 450. */
  largura?: number;
}) {
  return (
    <section
      aria-label={`Conversa de ${titulo}`}
      style={largura ? { width: largura } : undefined}
      className={`flex min-h-0 shrink-0 flex-col border-l border-border bg-chat ${
        largura ? "" : "w-[450px]"
      }`}
    >
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border pl-3.5 pr-2">
        <MessageSquare size={18} className="shrink-0 text-txt-muted" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-txt-primary">
          {titulo}
        </h2>
        <Tooltip label="Fechar">
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar a conversa da chamada"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
          >
            <X size={18} />
          </button>
        </Tooltip>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
