import { create } from "zustand";
import type { Channel, ChannelType, GuildMemberView } from "@newdisc/shared";
import { api } from "@/lib/api";
import { errorMessage, leaveChannel } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { useMessages } from "@/stores/messages";

/**
 * Canais do servidor ativo: lista, canal de texto aberto, canal de voz em que
 * estamos e a allowlist dos canais privados.
 *
 * A store não decide permissão — só reflete o que a API já filtrou
 * (`GuildsService.getWithChannels` esconde canal privado fora da allowlist).
 */

export interface CreateChannelInput {
  name: string;
  type: ChannelType;
  isPrivate: boolean;
  readOnly: boolean;
  memberIds: string[];
}

interface ChannelsState {
  channels: Channel[];
  activeChannelId: string | null;
  /** canal de voz conectado — assume a área principal enquanto existir. */
  voiceChannelId: string | null;
  loading: boolean;

  /** allowlist do canal privado aberto no modal de acesso. */
  access: { channelId: string | null; allowed: string[]; loading: boolean };

  loadForGuild: (guildId: string) => Promise<void>;
  clear: () => void;
  select: (channel: Channel) => void;
  leaveVoice: () => void;
  create: (guildId: string, input: CreateChannelInput) => Promise<boolean>;

  loadAccess: (guildId: string, channelId: string) => Promise<void>;
  toggleAccess: (guildId: string, channelId: string, userId: string) => Promise<void>;
  clearAccess: () => void;
}

/** Guarda de corrida: só a última carga de canais escreve no estado. */
let loadSeq = 0;
let accessSeq = 0;

export const useChannels = create<ChannelsState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  voiceChannelId: null,
  loading: false,
  access: { channelId: null, allowed: [], loading: false },

  loadForGuild: async (guildId) => {
    const seq = ++loadSeq;
    set({ channels: [], activeChannelId: null, loading: true });
    try {
      const guild = (await api.getGuild(guildId)) as { channels?: Channel[] };
      if (seq !== loadSeq) return; // trocaram de servidor no meio do fetch
      const channels = guild.channels ?? [];
      set({ channels, loading: false });
      const firstText = channels.find((c) => c.type === "TEXT");
      if (firstText) get().select(firstText);
    } catch (e) {
      if (seq !== loadSeq) return;
      set({ loading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar os canais"), "error");
    }
  },

  clear: () => {
    ++loadSeq; // invalida qualquer carga em voo
    const active = get().activeChannelId;
    if (active) leaveChannel(active);
    set({
      channels: [],
      activeChannelId: null,
      voiceChannelId: null,
      loading: false,
      access: { channelId: null, allowed: [], loading: false },
    });
    useMessages.getState().closeChannel();
  },

  select: (channel) => {
    if (channel.type === "VOICE") {
      // voz assume a área principal; o chat de texto continua onde estava
      set({ voiceChannelId: channel.id });
      return;
    }
    set({ voiceChannelId: null, activeChannelId: channel.id });
    void useMessages.getState().open(channel.id);
  },

  leaveVoice: () => set({ voiceChannelId: null }),

  create: async (guildId, input) => {
    const name = input.name.trim();
    if (!name) return false;
    try {
      const channel = (await api.createChannel(guildId, name, input.type, {
        isPrivate: input.isPrivate,
        readOnly: input.readOnly,
        memberIds: input.isPrivate ? input.memberIds : undefined,
      })) as Channel;
      set((s) => ({ channels: [...s.channels, channel] }));
      ui.toast(`Canal ${channel.name} criado`);
      return true;
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar o canal"), "error");
      return false;
    }
  },

  loadAccess: async (guildId, channelId) => {
    const seq = ++accessSeq;
    set({ access: { channelId, allowed: [], loading: true } });
    try {
      const rows = (await api.channelMembers(guildId, channelId)) as GuildMemberView[];
      if (seq !== accessSeq) return;
      set({ access: { channelId, allowed: rows.map((r) => r.user.id), loading: false } });
    } catch (e) {
      if (seq !== accessSeq) return;
      set({ access: { channelId, allowed: [], loading: false } });
      ui.toast(errorMessage(e, "Não foi possível ler o acesso do canal"), "error");
    }
  },

  toggleAccess: async (guildId, channelId, userId) => {
    const allowed = get().access.allowed;
    const has = allowed.includes(userId);
    try {
      if (has) await api.removeChannelMember(guildId, channelId, userId);
      else await api.addChannelMember(guildId, channelId, userId);
      set((s) => ({
        access: {
          ...s.access,
          allowed: has
            ? s.access.allowed.filter((id) => id !== userId)
            : [...s.access.allowed, userId],
        },
      }));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível mudar o acesso"), "error");
    }
  },

  clearAccess: () => set({ access: { channelId: null, allowed: [], loading: false } }),
}));

/** Canal de texto aberto (objeto completo), ou null. */
export function useActiveChannel(): Channel | null {
  return useChannels((s) => s.channels.find((c) => c.id === s.activeChannelId) ?? null);
}

/** Canal de voz conectado (objeto completo), ou null. */
export function useVoiceChannel(): Channel | null {
  return useChannels((s) => s.channels.find((c) => c.id === s.voiceChannelId) ?? null);
}
