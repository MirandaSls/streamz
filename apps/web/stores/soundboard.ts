"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  SONS_PADRAO,
  type GuildSoundboard,
  type SoundboardSound,
} from "@streamz/shared";
import { api } from "@/lib/api";
import { tocarEfeitoSonoro } from "@/lib/soundboard-audio";

/**
 * O painel de efeitos sonoros: os sons dos meus servidores, e o que **este**
 * navegador lembra sobre eles.
 *
 * Duas metades numa store só, e é de propósito:
 *
 * - **os sons** vêm do servidor (carregam com o app e se atualizam por
 *   `soundboard.updated`, como os emojis), e não são persistidos: uma lista
 *   guardada no `localStorage` seria uma segunda verdade que envelhece;
 * - **favoritos, frequentes e volume** são do navegador (`persist`), pelo mesmo
 *   motivo das preferências do seletor de emoji: não existe rota para eles no
 *   contrato, e enquanto não existir, guardar por aparelho entrega o
 *   comportamento do Discord sem inventar payload. Trocar de máquina perde os
 *   favoritos — está registrado no PR.
 *
 * O `volume` é o **dos efeitos**, separado do `outputVolume` das configurações
 * (que vale para os avisos de voz e para o toque). São controles diferentes
 * porque respondem a perguntas diferentes: "os sons do app estão altos" e "as
 * pessoas estão fazendo barulho demais na call" não se resolvem no mesmo lugar.
 * Zero é mudo, e é isso que o botão de alto-falante do painel mostra.
 */

interface SoundboardState {
  // ── do servidor ──
  guilds: GuildSoundboard[];
  carregado: boolean;
  // ── deste navegador ──
  /** ids favoritados, do mais recente para o mais antigo. */
  favoritos: string[];
  /** id do som → quantas vezes foi tocado por mim. */
  usos: Record<string, number>;
  /** volume dos efeitos, de 0 a 1. */
  volume: number;

  load: () => Promise<void>;
  aplicar: (guildId: string, sounds: SoundboardSound[]) => void;
  clear: () => void;
  alternarFavorito: (id: string) => void;
  registrarUso: (id: string) => void;
  definirVolume: (v: number) => void;
  /** toca o som localmente, no volume de efeitos deste cliente. */
  tocarLocalmente: (sound: SoundboardSound) => void;
}

/** Quantos sons a seção "Utilizados com frequência" mostra (duas fileiras de 3). */
export const LIMITE_FREQUENTES = 6;
/** Teto do histórico de contagem, para o objeto não crescer sem fim. */
const LIMITE_HISTORICO = 200;

export const useSoundboard = create<SoundboardState>()(
  persist(
    (set, get) => ({
      guilds: [],
      carregado: false,
      favoritos: [],
      usos: {},
      volume: 1,

      load: async () => {
        // falha aqui não pode derrubar nada: sem os sons do servidor o painel
        // continua com os do Streamz, que são arquivos do próprio app
        const guilds = await api.mySoundboard().catch(() => [] as GuildSoundboard[]);
        set({ guilds, carregado: true });
      },

      aplicar: (guildId, sounds) => {
        const atual = get().guilds;
        const i = atual.findIndex((g) => g.guildId === guildId);
        // servidor que ainda não estava na lista (acabei de entrar): recarrega
        if (i < 0) {
          void get().load();
          return;
        }
        const guilds = atual.slice();
        guilds[i] = { ...guilds[i], sounds };
        set({ guilds });
      },

      clear: () => set({ guilds: [], carregado: false }),

      alternarFavorito: (id) =>
        set((s) => ({
          favoritos: s.favoritos.includes(id)
            ? s.favoritos.filter((x) => x !== id)
            : [id, ...s.favoritos],
        })),

      registrarUso: (id) =>
        set((s) => {
          const usos = { ...s.usos, [id]: (s.usos[id] ?? 0) + 1 };
          const podados = Object.entries(usos)
            .sort((a, b) => b[1] - a[1])
            .slice(0, LIMITE_HISTORICO);
          return { usos: Object.fromEntries(podados) };
        }),

      definirVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)) }),

      tocarLocalmente: (sound) => tocarEfeitoSonoro(sound, get().volume),
    }),
    {
      name: "soundboard",
      version: 1,
      // a lista de sons é do servidor: persistir criaria uma segunda verdade
      partialize: (s) => ({ favoritos: s.favoritos, usos: s.usos, volume: s.volume }),
    },
  ),
);

/**
 * Todo som que eu posso tocar, em lista plana — os padrão do Streamz mais os
 * dos meus servidores.
 *
 * É por aqui que favoritos e frequentes resolvem um id em som: eles guardam id,
 * e o id pode ter deixado de existir (o som foi apagado, ou saí do servidor).
 */
export function todosOsSons(guilds: GuildSoundboard[]): SoundboardSound[] {
  return [...SONS_PADRAO, ...guilds.flatMap((g) => g.sounds)];
}
