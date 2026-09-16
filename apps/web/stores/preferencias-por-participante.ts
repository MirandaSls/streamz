"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Preferências locais **por participante de voz** — o que ESTE navegador
 * decide sobre CADA pessoa, independente do que ela mesma escolheu.
 *
 * Duas por enquanto (ESPEC2 item N): silenciar os efeitos sonoros do painel
 * disparados por alguém e desativar a câmera dela para mim. As duas seguem o
 * padrão de outras preferências "deste aparelho, sobre outra pessoa" já
 * persistidas (`stores/sons.ts`, `stores/soundboard.ts`): sem rota no
 * contrato, guardadas por navegador — sobrevivem a um F5, mas não trocam de
 * máquina. `silenciados`/`volumes` de `stores/voice.ts` são parecidos, mas
 * ficam de fora daqui de propósito: são estado **da chamada em curso** (não
 * persistido), enquanto os dois campos abaixo são preferência que deveria
 * continuar valendo na próxima vez que a pessoa entrar numa sala.
 *
 * A chave é o id do usuário, e o valor ausente (`false`) é o padrão — quem
 * nunca mexeu no menu continua ouvindo/vendo todo mundo.
 */

interface PreferenciasPorParticipanteState {
  /** ids de quem eu silenciei os efeitos sonoros do soundboard. */
  efeitosSonorosSilenciados: Record<string, true>;
  /** ids de quem eu desativei a câmera (não mostro o vídeo dela). */
  videosDesativados: Record<string, true>;

  efeitosSilenciados: (userId: string) => boolean;
  videoDesativado: (userId: string) => boolean;
  alternarEfeitosSilenciados: (userId: string) => void;
  alternarVideoDesativado: (userId: string) => void;
}

export const usePreferenciasPorParticipante = create<PreferenciasPorParticipanteState>()(
  persist(
    (set, get) => ({
      efeitosSonorosSilenciados: {},
      videosDesativados: {},

      efeitosSilenciados: (userId) => !!get().efeitosSonorosSilenciados[userId],
      videoDesativado: (userId) => !!get().videosDesativados[userId],

      alternarEfeitosSilenciados: (userId) =>
        set((s) => {
          const { [userId]: _fora, ...resto } = s.efeitosSonorosSilenciados;
          return {
            efeitosSonorosSilenciados: s.efeitosSonorosSilenciados[userId]
              ? resto
              : { ...resto, [userId]: true },
          };
        }),

      alternarVideoDesativado: (userId) =>
        set((s) => {
          const { [userId]: _fora, ...resto } = s.videosDesativados;
          return {
            videosDesativados: s.videosDesativados[userId] ? resto : { ...resto, [userId]: true },
          };
        }),
    }),
    {
      name: "preferencias-por-participante",
      version: 1,
    },
  ),
);
