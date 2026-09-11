"use client";

import type { ReactNode } from "react";

/**
 * Barra de abas do Discord.
 *
 * Especificação medida (cartão 0.4-pequenos implementa):
 * - `sublinhado` (a da refresh, `.tabs_b292bc` em `css-bruto/722514.*.css`):
 *   trilho de 2px `--border-subtle` com o indicador de 2px
 *   `--tabs-indicator-default` (limão pela regra da marca) deslizando por baixo
 *   do item ativo (transição de `translate` + `width`); itens com gap 32,
 *   padding 0 0 16, texto `--text-subtle` → selecionado `--text-strong`;
 *   conteúdo do item com gap 8 (ícone, rótulo, contador). Foco no conteúdo:
 *   outline 2px `--border-focus` com offset 2 e raio 4. Tamanho/peso do
 *   rótulo "não medido" no CSS — medir no print (perfil, popouts).
 * - `pilula` (a de Amigos, `.filterTab_f2af23` em `sob-demanda/820f054b9dbb1129.css`):
 *   fundo `--control-secondary-background-default`, raio de pílula, padding
 *   0×12, borda 1px transparente → selecionada borda `--brand-500`; hover
 *   `--control-secondary-background-hover`. Altura "não medida" — o app usa 32,
 *   medido em print (conferir o de Amigos em `/opt/stack/streamz/docs/Reference/`).
 * - Contador na aba: `Badge` numérico.
 * - `role="tablist"`/`role="tab"` com `aria-selected`; setas trocam a aba.
 */
export interface AbaDeTabs<T extends string = string> {
  valor: T;
  rotulo: ReactNode;
  /** Número no `Badge` ao lado do rótulo (0 esconde). */
  contador?: number;
  desabilitada?: boolean;
}

export interface TabsProps<T extends string = string> {
  valor: T;
  aoMudar: (valor: T) => void;
  abas: AbaDeTabs<T>[];
  /** Padrão `sublinhado`. */
  variante?: "sublinhado" | "pilula";
  larguraTotal?: boolean;
  /** Nome acessível da lista de abas. */
  rotulo: string;
  className?: string;
}

// Implementação provisória (cartão 0.4-pequenos substitui pelo medido).
export function Tabs<T extends string = string>({ valor, aoMudar, abas, variante = "sublinhado", rotulo, className = "" }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={rotulo} className={`flex ${variante === "pilula" ? "gap-2" : "gap-8 border-b-2 border-border-subtle"} ${className}`}>
      {abas.map((a) => {
        const ativa = a.valor === valor;
        return (
          <button
            key={a.valor}
            type="button"
            role="tab"
            aria-selected={ativa}
            disabled={a.desabilitada}
            onClick={() => aoMudar(a.valor)}
            className={
              variante === "pilula"
                ? `h-8 rounded-full border px-3 ${ativa ? "border-brand-500 text-text-strong" : "border-transparent text-text-subtle"} bg-control-secondary-background-default`
                : `pb-4 ${ativa ? "text-text-strong" : "text-text-subtle"}`
            }
          >
            {a.rotulo}
          </button>
        );
      })}
    </div>
  );
}
