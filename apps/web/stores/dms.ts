import { create } from "zustand";
import { WS_EVENTS, type DirectMessage, type DMChannelView, type PublicUser } from "@newdisc/shared";
import { api } from "@/lib/api";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { useChannels } from "@/stores/channels";
import { MAX_MESSAGE_LENGTH } from "@/stores/messages-core";

/**
 * Mensagens diretas: lista de conversas, conversa aberta e seu histórico.
 *
 * Diferente dos canais, a entrega ao vivo não passa por sala de canal — o
 * gateway emite `dm.new` para a sala pessoal de cada participante. Por isso não
 * há join/leave aqui.
 */

/** Teto de mensagens da conversa aberta (mesma razão da timeline de canal). */
const RETENTION_LIMIT = 500;

interface DMsState {
  channels: DMChannelView[];
  activeId: string | null;
  messages: DirectMessage[];
  loadingList: boolean;
  loadingMessages: boolean;

  openList: () => Promise<void>;
  select: (dm: DMChannelView) => Promise<void>;
  openWith: (userId: string) => Promise<void>;
  createGroup: (userIds: string[], name?: string) => Promise<boolean>;
  send: (content: string) => void;
  handleNew: (message: DirectMessage) => void;
  clear: () => void;
}

/** Guarda de corrida do histórico da conversa aberta. */
let historySeq = 0;

export const useDMs = create<DMsState>((set, get) => ({
  channels: [],
  activeId: null,
  messages: [],
  loadingList: false,
  loadingMessages: false,

  openList: async () => {
    ui.setView("dm");
    // sai da call de voz: a área principal passa a ser a conversa
    useChannels.getState().leaveVoice();
    set({ loadingList: true });
    try {
      const channels = (await api.listDMs()) as DMChannelView[];
      set({ channels, loadingList: false });
    } catch (e) {
      set({ loadingList: false });
      ui.toast(errorMessage(e, "Não foi possível carregar suas conversas"), "error");
    }
  },

  select: async (dm) => {
    const seq = ++historySeq;
    set({ activeId: dm.id, messages: [], loadingMessages: true });
    try {
      const messages = (await api.dmHistory(dm.id)) as DirectMessage[];
      if (seq !== historySeq) return; // trocaram de conversa no meio do fetch
      set({ messages, loadingMessages: false });
    } catch (e) {
      if (seq !== historySeq) return;
      set({ messages: [], loadingMessages: false });
      ui.toast(errorMessage(e, "Não foi possível abrir a conversa"), "error");
    }
  },

  openWith: async (userId) => {
    try {
      const dm = (await api.openDM(userId)) as DMChannelView;
      ui.setView("dm");
      useChannels.getState().leaveVoice();
      set((s) => ({
        channels: s.channels.some((d) => d.id === dm.id) ? s.channels : [dm, ...s.channels],
      }));
      await get().select(dm);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível abrir a conversa"), "error");
    }
  },

  createGroup: async (userIds, name) => {
    if (userIds.length < 2) return false;
    try {
      const dm = (await api.createGroupDM(userIds, name)) as DMChannelView;
      set((s) => ({ channels: [dm, ...s.channels] }));
      await get().select(dm);
      return true;
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar o grupo"), "error");
      return false;
    }
  },

  send: (content) => {
    const dmChannelId = get().activeId;
    const text = content.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!dmChannelId || !text) return;
    emit(WS_EVENTS.DM_CREATE, { dmChannelId, content: text });
  },

  handleNew: (message) => {
    if (message.dmChannelId !== get().activeId) return;
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) return s;
      const next = [...s.messages, message];
      return { messages: next.length > RETENTION_LIMIT ? next.slice(next.length - RETENTION_LIMIT) : next };
    });
  },

  clear: () => {
    ++historySeq;
    set({ channels: [], activeId: null, messages: [], loadingMessages: false });
  },
}));

/** Nome de exibição de uma conversa (grupo tem nome; 1-a-1 usa o outro). */
export function dmTitle(dm: DMChannelView): string {
  if (dm.isGroup) {
    return dm.name || dm.others.map((u) => u.username).join(", ") || "Grupo";
  }
  return dm.others[0]?.username ?? "Conversa";
}

/**
 * Contatos disponíveis para montar um grupo: os usuários com quem já existe uma
 * DM 1-a-1. O MVP não tem endpoint de busca de usuários — é o que dá para
 * oferecer sem inventar rota nova.
 */
export function contactsFromDMs(channels: DMChannelView[]): PublicUser[] {
  const byId = new Map<string, PublicUser>();
  for (const dm of channels) {
    if (dm.isGroup) continue;
    for (const user of dm.others) byId.set(user.id, user);
  }
  return Array.from(byId.values());
}
