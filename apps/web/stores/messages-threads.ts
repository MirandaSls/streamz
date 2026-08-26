"use client";

import { create } from "zustand";
import { MAX_THREAD_NAME, type ThreadUpdatedEvent, type ThreadView } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Threads nomeadas do canal aberto — o que o painel de threads do cabeçalho
 * lista. As respostas em si continuam sendo mensagens (`useMessages.openThread`);
 * aqui mora só o nome, o arquivamento e os contadores.
 */
interface ThreadsState {
  channelId: string | null;
  items: ThreadView[];
  loading: boolean;

  load: (channelId: string) => Promise<void>;
  /** Pergunta o nome e cria a thread a partir de uma mensagem raiz. */
  create: (channelId: string, messageId: string, sugestao?: string) => Promise<ThreadView | null>;
  rename: (channelId: string, thread: ThreadView) => Promise<void>;
  setArchived: (channelId: string, thread: ThreadView, archived: boolean) => Promise<void>;

  handleUpdated: (event: ThreadUpdatedEvent) => void;
  clear: () => void;
}

/** Nome sugerido: o começo da mensagem raiz, como o Discord propõe. */
function sugestaoDeNome(texto: string): string {
  return texto.replace(/\s+/g, " ").trim().slice(0, MAX_THREAD_NAME);
}

export const useThreads = create<ThreadsState>((set, get) => ({
  channelId: null,
  items: [],
  loading: false,

  load: async (channelId) => {
    set({ channelId, loading: true });
    try {
      const items = await api.threads(channelId);
      if (get().channelId !== channelId) return;
      set({ items, loading: false });
    } catch (e) {
      if (get().channelId !== channelId) return;
      set({ items: [], loading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar as threads"), "error");
    }
  },

  create: async (channelId, messageId, sugestao) => {
    const nome = await ui.prompt({
      title: "Criar thread",
      message: "Dê um nome à conversa que começa nesta mensagem.",
      placeholder: "Ex.: bug do login",
      initial: sugestaoDeNome(sugestao ?? ""),
      confirmLabel: "Criar",
    });
    if (!nome?.trim()) return null;
    try {
      const thread = await api.createThread(channelId, messageId, nome.trim());
      ui.toast(`Thread “${thread.name}” criada`);
      return thread;
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar a thread"), "error");
      return null;
    }
  },

  rename: async (channelId, thread) => {
    const nome = await ui.prompt({
      title: "Renomear thread",
      initial: thread.name,
      confirmLabel: "Salvar",
    });
    if (!nome?.trim() || nome.trim() === thread.name) return;
    try {
      await api.updateThread(channelId, thread.id, { name: nome.trim() });
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível renomear a thread"), "error");
    }
  },

  setArchived: async (channelId, thread, archived) => {
    try {
      await api.updateThread(channelId, thread.id, { archived });
      ui.toast(archived ? "Thread arquivada" : "Thread reaberta");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível alterar a thread"), "error");
    }
  },

  handleUpdated: ({ channelId, thread }) => {
    set((s) => {
      if (s.channelId !== channelId) return s;
      const semAntiga = s.items.filter((t) => t.id !== thread.id);
      return { items: [thread, ...semAntiga] };
    });
  },

  clear: () => set({ channelId: null, items: [], loading: false }),
}));
