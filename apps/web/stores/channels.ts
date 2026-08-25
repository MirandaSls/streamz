import { create } from "zustand";
import type { Channel, GuildChannelType, GuildMemberView } from "@newdisc/shared";
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
 * "Não lido" e menções por canal vêm da API e são mantidos ao vivo aqui.
 */

export interface CreateChannelInput {
  name: string;
  type: GuildChannelType;
  isPrivate: boolean;
  readOnly: boolean;
  memberIds: string[];
}

interface ChannelsState {
  /** servidor a que a lista pertence (para descartar eventos de outro). */
  guildId: string | null;
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
  rename: (channel: Channel) => Promise<void>;
  remove: (channel: Channel) => Promise<void>;

  /** Marca o canal como lido (na API e localmente). */
  markRead: (channelId: string) => Promise<void>;
  /** Mensagem nova num canal deste servidor. */
  bumpUnread: (channelId: string, at: string, mention: boolean) => void;
  handleCreated: (channel: Channel) => void;
  handleUpdated: (channel: Channel) => void;
  handleDeleted: (channelId: string) => void;

  loadAccess: (guildId: string, channelId: string) => Promise<void>;
  toggleAccess: (guildId: string, channelId: string, userId: string) => Promise<void>;
  clearAccess: () => void;
}

/** Guarda de corrida: só a última carga de canais escreve no estado. */
let loadSeq = 0;
let accessSeq = 0;

export const useChannels = create<ChannelsState>((set, get) => {
  function patchChannel(channelId: string, fn: (c: Channel) => Channel) {
    set((s) => ({ channels: s.channels.map((c) => (c.id === channelId ? fn(c) : c)) }));
  }

  return {
    guildId: null,
    channels: [],
    activeChannelId: null,
    voiceChannelId: null,
    loading: false,
    access: { channelId: null, allowed: [], loading: false },

    loadForGuild: async (guildId) => {
      const seq = ++loadSeq;
      set({ guildId, channels: [], activeChannelId: null, loading: true });
      try {
        const guild = await api.getGuild(guildId);
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
        guildId: null,
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
      void get().markRead(channel.id);
    },

    leaveVoice: () => set({ voiceChannelId: null }),

    create: async (guildId, input) => {
      const name = input.name.trim();
      if (!name) return false;
      try {
        const channel = await api.createChannel(guildId, name, input.type, {
          isPrivate: input.isPrivate,
          readOnly: input.readOnly,
          memberIds: input.isPrivate ? input.memberIds : undefined,
        });
        get().handleCreated(channel);
        ui.toast(`Canal ${channel.name ?? name} criado`);
        return true;
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível criar o canal"), "error");
        return false;
      }
    },

    rename: async (channel) => {
      const guildId = get().guildId;
      if (!guildId) return;
      const name = await ui.prompt({
        title: "Renomear canal",
        message: "Novo nome do canal.",
        initial: channel.name ?? "",
        confirmLabel: "Salvar",
      });
      if (!name?.trim() || name.trim() === channel.name) return;
      try {
        const updated = await api.updateChannel(guildId, channel.id, { name: name.trim() });
        get().handleUpdated(updated);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível renomear"), "error");
      }
    },

    remove: async (channel) => {
      const guildId = get().guildId;
      if (!guildId) return;
      const ok = await ui.confirm({
        title: `Apagar #${channel.name ?? "canal"}`,
        message: "Todas as mensagens do canal somem. Não dá para desfazer.",
        confirmLabel: "Apagar canal",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteChannel(guildId, channel.id);
        get().handleDeleted(channel.id);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível apagar"), "error");
      }
    },

    markRead: async (channelId) => {
      const c = get().channels.find((x) => x.id === channelId);
      if (!c) return;
      const jaLido = c.lastReadAt && c.lastMessageAt && c.lastReadAt >= c.lastMessageAt;
      if (jaLido && c.mentionCount === 0) return;
      const now = new Date().toISOString();
      patchChannel(channelId, (x) => ({ ...x, lastReadAt: now, mentionCount: 0 }));
      try {
        await api.markRead(channelId);
      } catch {
        // falhou em silêncio: o próximo reload da lista traz o valor do servidor
      }
    },

    bumpUnread: (channelId, at, mention) =>
      patchChannel(channelId, (c) => ({
        ...c,
        lastMessageAt: at,
        mentionCount: c.mentionCount + (mention ? 1 : 0),
      })),

    handleCreated: (channel) => {
      if (channel.guildId !== get().guildId) return;
      set((s) =>
        s.channels.some((c) => c.id === channel.id)
          ? s
          : { channels: [...s.channels, channel].sort((a, b) => a.position - b.position) },
      );
    },

    handleUpdated: (channel) => {
      if (channel.guildId !== get().guildId) return;
      // preserva o estado de leitura local: o evento vem sem a visão do espectador
      patchChannel(channel.id, (c) => ({
        ...channel,
        lastMessageAt: c.lastMessageAt,
        lastReadAt: c.lastReadAt,
        mentionCount: c.mentionCount,
      }));
    },

    handleDeleted: (channelId) => {
      const s = get();
      if (!s.channels.some((c) => c.id === channelId)) return;
      const restantes = s.channels.filter((c) => c.id !== channelId);
      set({
        channels: restantes,
        voiceChannelId: s.voiceChannelId === channelId ? null : s.voiceChannelId,
      });
      if (s.activeChannelId === channelId) {
        leaveChannel(channelId);
        useMessages.getState().closeChannel();
        const next = restantes.find((c) => c.type === "TEXT");
        if (next) get().select(next);
        else set({ activeChannelId: null });
      }
    },

    loadAccess: async (guildId, channelId) => {
      const seq = ++accessSeq;
      set({ access: { channelId, allowed: [], loading: true } });
      try {
        const rows = (await api.channelMembers(guildId, channelId)) as Pick<GuildMemberView, "user">[];
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
  };
});

/** Canal de texto aberto (objeto completo), ou null. */
export function useActiveChannel(): Channel | null {
  return useChannels((s) => s.channels.find((c) => c.id === s.activeChannelId) ?? null);
}

/** Canal de voz conectado (objeto completo), ou null. */
export function useVoiceChannel(): Channel | null {
  return useChannels((s) => s.channels.find((c) => c.id === s.voiceChannelId) ?? null);
}
