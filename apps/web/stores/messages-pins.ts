"use client";

import { create } from "zustand";
import type { MessagePinnedEvent, MessageUnpinnedEvent, PinnedMessage } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Mensagens fixadas do canal aberto.
 *
 * A lista só é carregada quando o popover abre (é o que o Discord faz), mas
 * fica sincronizada ao vivo depois disso: `message.pinned`/`message.unpinned`
 * chegam pela sala do canal e entram aqui sem novo fetch.
 */
interface PinsState {
  channelId: string | null;
  items: PinnedMessage[];
  loading: boolean;

  load: (channelId: string) => Promise<void>;
  pin: (channelId: string, messageId: string) => Promise<void>;
  unpin: (channelId: string, messageId: string) => Promise<void>;

  handlePinned: (event: MessagePinnedEvent) => void;
  handleUnpinned: (event: MessageUnpinnedEvent) => void;
  clear: () => void;
}

export const usePins = create<PinsState>((set, get) => ({
  channelId: null,
  items: [],
  loading: false,

  load: async (channelId) => {
    set({ channelId, loading: true });
    try {
      const items = await api.pins(channelId);
      // trocaram de canal durante o fetch: a lista que chegou não é mais desta tela
      if (get().channelId !== channelId) return;
      set({ items, loading: false });
    } catch (e) {
      if (get().channelId !== channelId) return;
      set({ items: [], loading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar as fixadas"), "error");
    }
  },

  pin: async (channelId, messageId) => {
    try {
      await api.pinMessage(channelId, messageId);
      ui.toast("Mensagem fixada");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível fixar a mensagem"), "error");
    }
  },

  unpin: async (channelId, messageId) => {
    const ok = await ui.confirm({
      title: "Desafixar esta mensagem?",
      message: "Ela sai da lista de fixadas do canal.",
      confirmLabel: "Desafixar",
    });
    if (!ok) return;
    try {
      await api.unpinMessage(channelId, messageId);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível desafixar a mensagem"), "error");
    }
  },

  handlePinned: ({ channelId, pin }) => {
    set((s) => {
      if (s.channelId !== channelId) return s;
      const semDuplicata = s.items.filter((p) => p.message.id !== pin.message.id);
      return { items: [pin, ...semDuplicata] };
    });
  },

  handleUnpinned: ({ channelId, messageId }) => {
    set((s) =>
      s.channelId === channelId
        ? { items: s.items.filter((p) => p.message.id !== messageId) }
        : s,
    );
  },

  clear: () => set({ channelId: null, items: [], loading: false }),
}));
