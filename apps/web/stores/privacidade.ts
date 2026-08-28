"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Preferências de privacidade da aba "Privacidade e segurança".
 *
 * **Ainda são locais.** O contrato (`@streamz/shared`) não tem campo para
 * filtro de conteúdo nem para "quem pode te mandar mensagem", e inventar um
 * aqui seria redeclarar contrato do lado do cliente — o que este projeto
 * proíbe. Quando os campos existirem em `MinhaConta`, esta store vira a cópia
 * local de um `PATCH /me/privacy` e o resto da aba não muda.
 */

/** Como filtrar mídia possivelmente sensível nas conversas diretas. */
export type FiltroDeConteudo = "nenhum" | "naoAmigos" | "todos";

/** Quem pode abrir uma conversa direta com você. */
export type QuemPodeChamar = "todos" | "amigosDeAmigos" | "amigos";

interface PrivacidadeState {
  filtro: FiltroDeConteudo;
  quemPodeChamar: QuemPodeChamar;
  set: (patch: Partial<Pick<PrivacidadeState, "filtro" | "quemPodeChamar">>) => void;
}

export const usePrivacidade = create<PrivacidadeState>()(
  persist(
    (set) => ({
      filtro: "naoAmigos",
      quemPodeChamar: "todos",
      set: (patch) => set(patch),
    }),
    {
      name: "privacidade",
      version: 1,
      // só os dados são persistidos; as ações são remontadas a cada carga
      partialize: (s) => ({ filtro: s.filtro, quemPodeChamar: s.quemPodeChamar }),
    },
  ),
);
