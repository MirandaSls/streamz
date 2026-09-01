"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Como uma aba pede para trocar de aba.
 *
 * Existe por causa de "Configurações relacionadas": o cartão do fim da página
 * leva à página vizinha, e sem isto a aba teria de mexer na URL na mão e torcer
 * para a `SettingsModal` reagir — que ela não faz, porque a aba inicial é lida
 * uma vez só, na montagem.
 *
 * Um contexto e não a store de UI: reabrir o modal por `openModal` remontaria a
 * tela inteira e perderia a rolagem, o rascunho de um campo e a barra de
 * alterações não salvas.
 */
const Contexto = createContext<((id: string) => void) | null>(null);

export function ProvedorDeAbas({
  irParaAba,
  children,
}: {
  irParaAba: (id: string) => void;
  children: ReactNode;
}) {
  return <Contexto.Provider value={irParaAba}>{children}</Contexto.Provider>;
}

/**
 * Devolve a função de trocar de aba. Fora da `SettingsModal` (numa aba montada
 * em teste, por exemplo) devolve uma função que não faz nada — o cartão fica
 * inerte em vez de derrubar a tela.
 */
export function useIrParaAba(): (id: string) => void {
  return useContext(Contexto) ?? (() => {});
}
