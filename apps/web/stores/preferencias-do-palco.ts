"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Preferências locais **do palco de voz** — o que ESTE navegador decide sobre
 * a própria exibição da grade, não sobre outra pessoa (isso é
 * `preferencias-por-participante.ts`) nem sobre o estado da chamada em curso
 * (`stores/voice.ts`).
 *
 * Duas por enquanto, espelhando o menu de vídeo do Discord: esconder a
 * própria prévia da câmera (só afeta o meu tile — os outros continuam me
 * vendo normalmente) e ocultar da grade quem está sem vídeo/tela. Sem rota
 * no contrato, guardadas por navegador — sobrevivem a um F5, mas não trocam
 * de máquina.
 */

interface PreferenciasDoPalcoState {
  /** mostra minha própria câmera no meu tile (Discord: "Prévia da câmera"). */
  previaDaCamera: boolean;
  /** mostra na grade quem está sem vídeo/tela (Discord: "Mostrar participantes sem vídeo"). */
  mostrarSemVideo: boolean;

  alternarPreviaDaCamera: () => void;
  alternarMostrarSemVideo: () => void;
}

export const usePreferenciasDoPalco = create<PreferenciasDoPalcoState>()(
  persist(
    (set) => ({
      previaDaCamera: true,
      mostrarSemVideo: true,

      alternarPreviaDaCamera: () => set((s) => ({ previaDaCamera: !s.previaDaCamera })),
      alternarMostrarSemVideo: () => set((s) => ({ mostrarSemVideo: !s.mostrarSemVideo })),
    }),
    {
      name: "streamz:preferencias-do-palco",
      version: 1,
    },
  ),
);
