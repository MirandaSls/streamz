"use client";

import { create } from "zustand";
import type { InboxMention, InboxUnreadGroup } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { ui } from "@/stores/ui";

/**
 * Caixa de entrada: menções não lidas e canais com novidade, em todos os
 * servidores e conversas.
 *
 * É sempre um retrato do momento em que o popover abriu — carregamos ao abrir e
 * não mantemos assinatura ao vivo: a lista de não-lidos já está no rail e na
 * barra lateral, e uma segunda cópia ao vivo só criaria divergência entre as duas.
 */
export type InboxTab = "mentions" | "unread";

interface InboxState {
  tab: InboxTab;
  mentions: InboxMention[];
  unread: InboxUnreadGroup[];
  loading: boolean;

  setTab: (tab: InboxTab) => void;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useInbox = create<InboxState>((set) => ({
  tab: "mentions",
  mentions: [],
  unread: [],
  loading: false,

  setTab: (tab) => set({ tab }),

  load: async () => {
    set({ loading: true });
    try {
      const [mentions, unread] = await Promise.all([api.inboxMentions(25), api.inboxUnread()]);
      set({ mentions, unread, loading: false });
    } catch (e) {
      set({ loading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar a caixa de entrada"), "error");
    }
  },

  markAllRead: async () => {
    try {
      await api.markAllRead();
      set({ mentions: [], unread: [] });
      // o não-lido vive nas stores de servidores/canais/conversas. Marcamos
      // canal a canal (em vez de recarregar a lista) porque `loadForGuild`
      // troca o canal aberto — marcar tudo como lido não pode mexer na tela.
      const canais = useChannels.getState();
      for (const c of canais.channels) void canais.markRead(c.id);
      const dms = useDMs.getState();
      for (const d of dms.channels) void dms.markRead(d.id);
      await useGuilds.getState().load();
      ui.toast("Tudo marcado como lido");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível marcar tudo como lido"), "error");
    }
  },
}));
