import { create } from "zustand";
import { isTextChannel } from "@streamz/shared";
import type { Channel, GuildChannelType, GuildMemberView } from "@streamz/shared";
import { api } from "@/lib/api";
import { applyPositions, moveCategory, moveChannel } from "@/stores/channel-order";
import { canalLido, listaLida } from "@/stores/leitura";
import { useCategories } from "@/stores/categories";
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
  /** categoria em que o canal nasce (null = solto, no topo da lista). */
  categoryId?: string | null;
}

/** Campos que o modal de configurações do canal salva. */
export interface UpdateChannelInput {
  name?: string;
  topic?: string | null;
  slowmodeSeconds?: number;
  nsfw?: boolean;
  readOnly?: boolean;
  isPrivate?: boolean;
  categoryId?: string | null;
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
  /** Salva as configurações do canal (nome, tópico, modo lento, NSFW…). */
  update: (channelId: string, patch: UpdateChannelInput) => Promise<boolean>;

  /** Solta um canal na posição `index` de uma categoria (null = sem categoria). */
  dropChannel: (channelId: string, categoryId: string | null, index: number) => Promise<void>;
  /** Solta uma categoria na posição `index` da lista de categorias. */
  dropCategory: (categoryId: string, index: number) => Promise<void>;

  /** Marca todos os canais visíveis do servidor como lidos. */
  markGuildRead: (guildId: string) => Promise<void>;

  /** Marca o canal como lido (na API e localmente). */
  markRead: (channelId: string) => Promise<void>;
  /**
   * `channel.read`: li estes canais em **outra** conexão da minha conta. Só
   * aplica o estado de leitura — não fala com a API e não muda o que está na
   * tela. Idempotente (ver `stores/leitura`).
   */
  aplicarLeitura: (channelIds: readonly string[], lastReadAt: string) => void;
  /** Mensagem nova num canal deste servidor. */
  bumpUnread: (channelId: string, at: string, mention: boolean, propria: boolean) => void;
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
        // as categorias vêm de outra rota: carregar aqui mantém os dois lados
        // da barra lateral sempre do mesmo servidor
        void useCategories.getState().loadForGuild(guildId);
        const firstText = channels.find((c) => isTextChannel(c));
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
      useCategories.getState().clear();
      useMessages.getState().closeChannel();
    },

    select: (channel) => {
      // Canal de voz também é canal aberto: ele tem chat de texto próprio, e a
      // coluna 3 empilha o palco em cima da conversa dele (ver `CallSplit`).
      // Só `voiceChannelId` muda de significado entre os dois casos — é ele que
      // diz se há palco a montar.
      set({
        voiceChannelId: channel.type === "VOICE" ? channel.id : null,
        activeChannelId: channel.id,
      });
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
          categoryId: input.categoryId ?? null,
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

    update: async (channelId, patch) => {
      const guildId = get().guildId;
      if (!guildId) return false;
      try {
        get().handleUpdated(await api.updateChannel(guildId, channelId, patch));
        return true;
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar o canal"), "error");
        return false;
      }
    },

    dropChannel: async (channelId, categoryId, index) => {
      const guildId = get().guildId;
      if (!guildId) return;
      const categories = useCategories.getState().categories;
      const positions = moveChannel(get().channels, categories, channelId, categoryId, index);
      if (positions.length === 0) return;
      const antes = get().channels;
      // aplica na hora: esperar o channel.updated faria o canal voltar ao lugar
      // antigo por um quadro, que é exatamente o que arrastar não pode fazer
      set({ channels: applyPositions(antes, positions) });
      try {
        await api.reorderChannels(guildId, { channels: positions });
      } catch (e) {
        set({ channels: antes });
        ui.toast(errorMessage(e, "Não foi possível reordenar"), "error");
      }
    },

    dropCategory: async (categoryId, index) => {
      const guildId = get().guildId;
      if (!guildId) return;
      const categorias = useCategories.getState();
      const positions = moveCategory(categorias.categories, categoryId, index);
      if (positions.length === 0) return;
      const antes = categorias.categories;
      const mapa = new Map(positions.map((p) => [p.id, p.position]));
      for (const c of antes) {
        const pos = mapa.get(c.id);
        if (pos !== undefined) categorias.handleUpdated({ ...c, position: pos });
      }
      try {
        await api.reorderChannels(guildId, { categories: positions });
      } catch (e) {
        for (const c of antes) categorias.handleUpdated(c);
        ui.toast(errorMessage(e, "Não foi possível reordenar"), "error");
      }
    },

    markGuildRead: async (guildId) => {
      const agora = new Date().toISOString();
      const antes = get().channels;
      set({
        channels: antes.map((c) => ({ ...c, lastReadAt: agora, mentionCount: 0 })),
      });
      try {
        await api.markGuildRead(guildId);
      } catch (e) {
        set({ channels: antes });
        ui.toast(errorMessage(e, "Não foi possível marcar como lido"), "error");
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

    aplicarLeitura: (channelIds, lastReadAt) =>
      set((s) => {
        const channels = listaLida(s.channels, channelIds, (c) => canalLido(c, lastReadAt));
        return channels === s.channels ? s : { channels };
      }),

    // a minha mensagem também lê o canal: ver `aoChegarMensagem` (nao-lidas.ts)
    bumpUnread: (channelId, at, mention, propria) =>
      patchChannel(channelId, (c) =>
        propria
          ? canalLido({ ...c, lastMessageAt: at }, at)
          : { ...c, lastMessageAt: at, mentionCount: c.mentionCount + (mention ? 1 : 0) },
      ),

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
        const next = restantes.find((c) => isTextChannel(c));
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
