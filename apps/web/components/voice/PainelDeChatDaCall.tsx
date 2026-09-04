"use client";

import type { ReactNode } from "react";
import { MessageSquare, X } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";

/**
 * A casca da conversa da chamada — a coluna que abre à direita do palco.
 *
 * Medida **duas vezes**. Primeiro na print `2026-09-03 203909`, que precisava
 * de escala (0,8075 = 2777/3439; ver `grid-layout.ts`). Depois na print
 * `2026-09-04 102429`, que é **1:1** — a coluna de canais mede 294px nela e
 * 294px aqui (`ChannelSidebar`) —, e por isso é ela que manda onde as duas
 * discordam: régua sem conversão vale mais que régua com.
 *
 * | o quê | 203909 (com escala) | 102429 (1:1) | fica |
 * |---|---|---|---|
 * | largura do painel | 450 | 478 | **450** (o divisor é arrastável; 450 é só o ponto de partida) |
 * | cabeçalho, com o filete | 44 | 33→82 = **49** | **49** |
 * | balão do cabeçalho | 18 | tinta 1461..1477 = 17 → **18** | **18** |
 * | recuo do balão | 14 | 1461−1441 = **20** | **20** |
 * | balão → nome | — | 1491−1478 = **13** | **13** |
 * | nome | — | caixa alta 12 → **16px** | **16px** |
 * | X, da borda direita | 16 | tinta até 1900, borda 1918 → botão a **8** | **8** |
 * | composer (caixa inteira) | 51 | 964..1021 = **58** | do `ChatView` |
 *
 * Os 49 do cabeçalho não são um número novo: é a **mesma** altura do cabeçalho
 * do palco (`VoicePanel`), e na print os dois nomes ficam na mesma linha. Com
 * 44 eles ficavam 5px fora de registro um do outro.
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
      <header className="flex h-[49px] shrink-0 items-center gap-[13px] border-b border-border pl-5 pr-2">
        <MessageSquare size={18} className="shrink-0 text-txt-muted" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-txt-primary">
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
