"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GuildSoundboard, SoundboardSound } from "@streamz/shared";
import { api } from "@/lib/api";
import { tocarEfeitoSonoro } from "@/lib/soundboard-audio";
import { usePreferenciasPorParticipante } from "@/stores/preferencias-por-participante";

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
  /**
   * O último `GET /soundboard` falhou. Separado de `carregado` porque "não
   * sei" e "não há nada" pedem telas diferentes: sem este campo a falha de
   * rede virava lista vazia, e painel e aba diziam "Nenhum som ainda." para
   * quem estava só sem internet — sem oferecer tentar de novo.
   */
  falhouCarregar: boolean;
  // ── deste navegador ──
  /** ids favoritados, do mais recente para o mais antigo. */
  favoritos: string[];
  /** id do som → quantas vezes foi tocado por mim. */
  usos: Record<string, number>;
  /** volume dos efeitos, de 0 a 1. */
  volume: number;

  load: () => Promise<void>;
  /** o "Tentar de novo" do estado de erro (painel e aba). */
  recarregar: () => Promise<void>;
  aplicar: (guildId: string, sounds: SoundboardSound[]) => void;
  clear: () => void;
  alternarFavorito: (id: string) => void;
  registrarUso: (id: string) => void;
  definirVolume: (v: number) => void;
  /**
   * toca o som localmente, no volume de efeitos deste cliente — a menos que
   * `autorId` seja alguém cujos efeitos eu silenciei (ESPEC2 item N,
   * `stores/preferencias-por-participante.ts`).
   */
  tocarLocalmente: (sound: SoundboardSound, autorId?: string) => void;
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
      falhouCarregar: false,
      favoritos: [],
      usos: {},
      volume: 1,

      load: async () => {
        // falha aqui não derruba nada, mas também não finge lista vazia: marca
        // `falhouCarregar` e deixa `guilds`/`carregado` como estavam. Na
        // primeira carga isso é o estado de erro com "Tentar de novo"; numa
        // recarga (reconexão do socket, `aplicar` de servidor novo) quem já
        // tinha a lista continua vendo a lista, que é melhor que uma tela de
        // erro por cima de sons que ainda tocam
        set({ falhouCarregar: false });
        try {
          const guilds = await api.mySoundboard();
          set({ guilds, carregado: true, falhouCarregar: false });
        } catch {
          set({ falhouCarregar: true });
        }
      },

      recarregar: () => get().load(),

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

      clear: () => set({ guilds: [], carregado: false, falhouCarregar: false }),

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

      tocarLocalmente: (sound, autorId) => {
        if (autorId && usePreferenciasPorParticipante.getState().efeitosSilenciados(autorId)) return;
        tocarEfeitoSonoro(sound, get().volume);
      },
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
 * Todo som que eu posso tocar, em lista plana — os dos meus servidores. O app
 * não traz som de fábrica.
 *
 * É por aqui que favoritos e frequentes resolvem um id em som: eles guardam id,
 * e o id pode ter deixado de existir (o som foi apagado, ou saí do servidor).
 */
export function todosOsSons(guilds: GuildSoundboard[]): SoundboardSound[] {
  return guilds.flatMap((g) => g.sounds);
}
