"use client";

import { create } from "zustand";
import type { InboxMention, InboxUnreadGroup, ModerationNotice } from "@streamz/shared";
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
interface InboxState {
  mentions: InboxMention[];
  unread: InboxUnreadGroup[];
  avisos: ModerationNotice[];
  loading: boolean;

  carregarAvisos: () => Promise<void>;
  adicionarAviso: (n: ModerationNotice) => void;
  dispensarAviso: (id: string) => Promise<void>;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useInbox = create<InboxState>((set, get) => ({
  mentions: [],
  unread: [],
  avisos: [],
  loading: false,

  carregarAvisos: async () => {
    try {
      set({ avisos: await api.moderationNotices() });
    } catch {
      // silencioso: avisos são complemento e chegam também pelo WS
    }
  },

  adicionarAviso: (n) =>
    set((s) => (s.avisos.some((a) => a.id === n.id) ? s : { avisos: [n, ...s.avisos] })),

  dispensarAviso: async (id) => {
    const antes = get().avisos;
    set({ avisos: antes.filter((a) => a.id !== id) });
    try {
      await api.dismissModerationNotice(id);
    } catch (e) {
      set({ avisos: antes });
      ui.toast(errorMessage(e, "Não foi possível dispensar o aviso"), "error");
    }
  },

  load: async () => {
    set({ loading: true });
    try {
      const [mentions, unread] = await Promise.all([api.inboxMentions(25), api.inboxUnread()]);
      set({ mentions, unread, loading: false });
      void get().carregarAvisos();
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
