"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Preferências locais **por participante de voz** — o que ESTE navegador
 * decide sobre CADA pessoa, independente do que ela mesma escolheu.
 *
 * Por enquanto só uma (ESPEC2 item N): silenciar os efeitos sonoros do painel
 * disparados por alguém. Segue o padrão de outras preferências "deste
 * aparelho, sobre outra pessoa" já persistidas (`stores/sons.ts`,
 * `stores/soundboard.ts`): sem rota no contrato, guardadas por navegador —
 * sobrevivem a um F5, mas não trocam de máquina. `silenciados`/`volumes` de
 * `stores/voice.ts` são parecidos e também persistidos (chaves
 * `voiceSilenciadosPorPessoa`/`voiceVolumesPorPessoa`); ficam de fora
 * **desta** store só porque moram junto do resto do estado de voz, não
 * porque sumam ao fechar a aba.
 *
 * A chave é o id do usuário, e o valor ausente (`false`) é o padrão — quem
 * nunca mexeu no menu continua ouvindo todo mundo.
 */

interface PreferenciasPorParticipanteState {
  /** ids de quem eu silenciei os efeitos sonoros do soundboard. */
  efeitosSonorosSilenciados: Record<string, true>;

  efeitosSilenciados: (userId: string) => boolean;
  alternarEfeitosSilenciados: (userId: string) => void;
}

export const usePreferenciasPorParticipante = create<PreferenciasPorParticipanteState>()(
  persist(
    (set, get) => ({
      efeitosSonorosSilenciados: {},

      efeitosSilenciados: (userId) => !!get().efeitosSonorosSilenciados[userId],

      alternarEfeitosSilenciados: (userId) =>
        set((s) => {
          const { [userId]: _fora, ...resto } = s.efeitosSonorosSilenciados;
          return {
            efeitosSonorosSilenciados: s.efeitosSonorosSilenciados[userId]
              ? resto
              : { ...resto, [userId]: true },
          };
        }),
    }),
    {
      name: "preferencias-por-participante",
      version: 2,
      // v1 tinha `videosDesativados` ("Desativar vídeo" saiu do menu — câmera
      // ligada de alguém agora sempre aparece); descarta o campo do estado
      // salvo para quem já tinha escondido alguém não ficar com lixo gravado.
      migrate: (persisted) => {
        const { videosDesativados: _fora, ...resto } = persisted as Record<string, unknown> & {
          videosDesativados?: unknown;
        };
        return resto as Pick<PreferenciasPorParticipanteState, "efeitosSonorosSilenciados">;
      },
    },
  ),
);
