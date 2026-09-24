"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Preferências da **prévia da minha própria tela** durante compartilhamento
 * (menu de tela do Discord: "Mostrar meu compartilhamento de tela" e "Pausar
 * prévia quando o Discord não estiver em foco").
 *
 * A prévia da própria tela é cara de propósito indevido: ela decodifica de
 * volta o stream que este mesmo cliente acabou de codificar, só para
 * desenhar no próprio tile. Com a aba em segundo plano ninguém está vendo
 * esse tile — por isso o Discord (e nós) pausa a prévia quando a janela sai
 * de foco, mesmo com o compartilhamento continuando normalmente para quem
 * está do outro lado da chamada.
 *
 * `mostrarMinhaTela` e `pausarSemFoco` são preferência deste navegador
 * (persistidas). `janelaEmFoco` é estado ao vivo da aba, nunca persiste — e
 * por isso fica fora do `partialize` — e no servidor/SSR começa `true` (sem
 * `window` não há como saber, e `true` é o valor que não pausa nada).
 */

interface PreferenciasDeTransmissaoState {
  mostrarMinhaTela: boolean;
  pausarSemFoco: boolean;
  /** estado ao vivo, não persistido: mantido pelos listeners abaixo. */
  janelaEmFoco: boolean;

  setMostrarMinhaTela: (v: boolean) => void;
  setPausarSemFoco: (v: boolean) => void;
}

export const usePreferenciasDeTransmissao = create<PreferenciasDeTransmissaoState>()(
  persist(
    (set) => ({
      mostrarMinhaTela: true,
      pausarSemFoco: true,
      janelaEmFoco: true,

      setMostrarMinhaTela: (v) => set({ mostrarMinhaTela: v }),
      setPausarSemFoco: (v) => set({ pausarSemFoco: v }),
    }),
    {
      name: "streamz:preferencias-de-transmissao",
      version: 1,
      // só a preferência é persistida; foco é estado ao vivo da aba
      partialize: (s) => ({
        mostrarMinhaTela: s.mostrarMinhaTela,
        pausarSemFoco: s.pausarSemFoco,
      }),
    },
  ),
);

/** `true` quando a prévia da minha própria tela deve estar ligada agora. */
export function previaDaMinhaTelaLigada(s: {
  mostrarMinhaTela: boolean;
  pausarSemFoco: boolean;
  janelaEmFoco: boolean;
}): boolean {
  return s.mostrarMinhaTela && (!s.pausarSemFoco || s.janelaEmFoco);
}

// Listeners instalados uma vez, só no navegador — `janelaEmFoco` nunca é
// lido/gravado em `localStorage`, é sempre o foco real da aba agora.
if (typeof window !== "undefined") {
  const atualizarFoco = () =>
    usePreferenciasDeTransmissao.setState({ janelaEmFoco: document.hasFocus() });

  usePreferenciasDeTransmissao.setState({ janelaEmFoco: document.hasFocus() });

  window.addEventListener("focus", atualizarFoco);
  window.addEventListener("blur", atualizarFoco);
  document.addEventListener("visibilitychange", () => {
    // esconder a aba conta como perder foco mesmo em SOs que não disparam
    // `blur` da janela nesse caso; ficar visível de novo reavalia o foco real
    usePreferenciasDeTransmissao.setState({
      janelaEmFoco: document.hidden ? false : document.hasFocus(),
    });
  });
}
