import { create } from "zustand";
import type { VoiceStateEvent } from "@newdisc/shared";

/**
 * Quem está conectado em cada canal de voz, ao vivo.
 *
 * O gateway emite `voice.state` na sala do servidor sempre que alguém entra,
 * sai, muda de mudo/surdo ou liga câmera/tela. Aqui só guardamos a última
 * versão de cada participante por canal — a barra lateral desenha a lista sob
 * o canal, como no Discord.
 */

interface VoiceStatesState {
  byChannel: Record<string, VoiceStateEvent[]>;
  apply: (event: VoiceStateEvent) => void;
  clear: () => void;
}

export const useVoiceStates = create<VoiceStatesState>((set) => ({
  byChannel: {},

  apply: (event) =>
    set((s) => {
      const atual = s.byChannel[event.channelId] ?? [];
      const semEle = atual.filter((v) => v.user.id !== event.user.id);
      // `connected: false` é a saída — some da lista em vez de virar linha morta
      const lista = event.connected ? [...semEle, event] : semEle;
      if (lista.length === 0 && atual.length === 0) return s;
      return { byChannel: { ...s.byChannel, [event.channelId]: lista } };
    }),

  clear: () => set({ byChannel: {} }),
}));

/** Participantes de um canal de voz (lista estável, vazia quando ninguém). */
const VAZIO: VoiceStateEvent[] = [];
export function useVoiceParticipants(channelId: string): VoiceStateEvent[] {
  return useVoiceStates((s) => s.byChannel[channelId] ?? VAZIO);
}
