"use client";

import type { ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "@/components/ui/icones";

/**
 * O `HelpMessage` do Discord (`.root_aea291`, `css-bruto/sob-demanda/
 * 622936.fbeaed30a81cf742.css`): `align-items:center;border-radius:
 * var(--radius-xs);display:flex;padding:8px`, ícone com `margin-inline-end:10px`;
 * `.info` = fundo `--background-feedback-info` + borda `--icon-feedback-info`
 * e ícone 24; `.warning` = fundo/borda `-warning` e ícone **20**.
 *
 * `erro` não está nesse arquivo (só `info` e `warning`): é o mesmo desenho com
 * os tokens `-critical` e o ícone de 20 do `warning` — por analogia, não
 * medido. Tinta do texto: o módulo não fixa (`.text_aea291{flex:1}`); fica
 * `--text-default` (não medido).
 *
 * Primitivo desde a rodada de correção (cartão mensagem-de-ajuda-primitivo):
 * morava em `settings/aplicativos/pecas.tsx`, mas `chat/bot/ModalDeBot.tsx`
 * já importava de lá — mesma peça, sem relação com "Aplicativos".
 */
export function MensagemDeAjuda({
  tom,
  children,
  acao,
}: {
  tom: "info" | "aviso" | "erro";
  children: ReactNode;
  acao?: ReactNode;
}) {
  const caixa =
    tom === "info"
      ? "bg-background-feedback-info border-icon-feedback-info"
      : tom === "aviso"
        ? "bg-background-feedback-warning border-icon-feedback-warning"
        : "bg-background-feedback-critical border-icon-feedback-critical";
  const icone =
    tom === "info" ? (
      <HelpCircle size={24} aria-hidden="true" className="mr-[10px] shrink-0 text-icon-feedback-info" />
    ) : (
      <AlertTriangle
        size={20}
        aria-hidden="true"
        className={`mr-[10px] shrink-0 ${tom === "aviso" ? "text-icon-feedback-warning" : "text-icon-feedback-critical"}`}
      />
    );
  return (
    <div
      role={tom === "erro" ? "alert" : undefined}
      className={`flex items-center rounded border p-2 celular:flex-wrap celular:gap-y-2 ${caixa}`}
    >
      {icone}
      <div className="min-w-0 flex-1 text-text-sm text-text-default">{children}</div>
      {acao ? <div className="ml-2 shrink-0 celular:ml-[34px]">{acao}</div> : null}
    </div>
  );
}
