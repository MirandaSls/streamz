"use client";

import { useEffect } from "react";
import { ui } from "@/stores/ui";

/**
 * Deep link das configurações: `?settings=<aba>`.
 *
 * A leitura/escrita é feita direto em `window.location` + `history` em vez de
 * `useSearchParams`/`router`: a query aqui é estado de *interface* (que tela
 * está aberta), e o roteador do Next remontaria a árvore a cada troca de aba —
 * caro e visível. `replaceState` também evita empilhar um passo de "voltar"
 * por clique no menu.
 */

const PARAMETRO = "settings";

/** A aba pedida na URL atual, se houver. */
export function lerAbaDaUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(PARAMETRO);
}

/** Escreve a aba aberta na URL, sem empilhar histórico. */
export function escreverAbaNaUrl(abaId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(PARAMETRO) === abaId) return;
  url.searchParams.set(PARAMETRO, abaId);
  window.history.replaceState(null, "", url.toString());
}

/** Tira o parâmetro ao fechar as configurações. */
export function limparAbaDaUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAMETRO)) return;
  url.searchParams.delete(PARAMETRO);
  window.history.replaceState(null, "", url.toString());
}

/**
 * Abre as configurações quando a página carrega com `?settings=<aba>` — é o
 * que faz o link compartilhado cair na tela certa.
 */
export function useSettingsRoute(): void {
  useEffect(() => {
    const aba = lerAbaDaUrl();
    if (aba) ui.openModal({ kind: "settings", tab: aba });
  }, []);
}
