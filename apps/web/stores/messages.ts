import { create } from "zustand";
import {
  WS_EVENTS,
  type Attachment,
  type Message,
  type MessageDeletedEvent,
  type PublicUser,
  type Sticker,
} from "@newdisc/shared";
import { api } from "@/lib/api";
import { emit, errorMessage, joinChannel } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import {
  applyDelete,
  applyUpdate,
  bumpReplyCount,
  dropByNonce,
  markFailed,
  markPending,
  optimisticMessage,
  prependOlder,
  reconcile,
  trim,
  type ChatMessage,
  MAX_MESSAGE_LENGTH,
} from "@/stores/messages-core";

/**
 * Timeline de mensagens por canal: fetch, paginação por cursor, envio otimista
 * e os handlers dos eventos de mensagem. Quem desenha só lê daqui.
 */

/** Tamanho da página do histórico (espelha o `take` do MessagesService). */
const PAGE_SIZE = 50;
/** Sem eco em 10s tratamos o envio como perdido e oferecemos reenviar. */
const ACK_TIMEOUT_MS = 10_000;
/** Canais cujo histórico fica em memória depois de fechados (LRU simples). */
const CACHED_CHANNELS = 5;

export interface ChannelSlice {
  items: ChatMessage[];
  /** há histórico mais antigo no servidor. */
  hasMore: boolean;
  loading: boolean;
  loadingOlder: boolean;
}

const EMPTY_SLICE: ChannelSlice = {
  items: [],
  hasMore: true,
  loading: false,
  loadingOlder: false,
};

/**
 * Contador por canal: toda carga de histórico anota o número da vez e só
 * escreve no estado se ainda for a última. É o que impede o histórico de uma
 * troca de canal anterior (ou de um reconnect) de sobrescrever o atual.
 */
const seqByChannel = new Map<string, number>();
function nextSeq(channelId: string): number {
  const n = (seqByChannel.get(channelId) ?? 0) + 1;
  seqByChannel.set(channelId, n);
  return n;
}
function isCurrent(channelId: string, seq: number): boolean {
  return seqByChannel.get(channelId) === seq;
}

/** Envios ainda sem eco, por nonce — guardados para permitir reenvio. */
interface OutboxEntry {
  channelId: string;
  content: string;
  attachmentIds: string[];
  parentId?: string;
  stickerId?: string;
}
const outbox = new Map<string, OutboxEntry>();
const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();

function newNonce(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export interface SendInput {
  channelId: string;
  /** servidor do canal (null em DM) — só para a mensagem otimista ficar completa. */
  guildId?: string | null;
  author: PublicUser;
  content: string;
  attachments?: Attachment[];
  /** preenchido quando é uma resposta dentro de uma thread. */
  parentId?: string;
  /** figurinha: vai sozinha na mensagem (g-emojis-midia). */
  sticker?: Sticker | null;
}

interface MessagesState {
  byChannel: Record<string, ChannelSlice>;
  activeChannelId: string | null;
  /** ordem de uso dos canais, do mais recente para o mais antigo. */
  recent: string[];

  threadParentId: string | null;
  threadItems: ChatMessage[];
  threadLoading: boolean;

  searchQuery: string;
  searchResults: Message[] | null;
  searching: boolean;

  /** `sticky`: a sala não é abandonada ao trocar de canal (conversas diretas). */
  open: (channelId: string, opts?: { sticky?: boolean }) => Promise<void>;
  closeChannel: () => void;
  /** Recarrega o histórico do canal ativo (usado após reconexão). */
  resyncActive: () => Promise<void>;
  loadOlder: (channelId: string) => Promise<void>;

  send: (input: SendInput) => void;
  retry: (nonce: string) => void;
  discard: (nonce: string) => void;
  edit: (messageId: string, content: string) => void;
  remove: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string, userId?: string) => void;

  openThread: (channelId: string, parent: Message) => Promise<void>;
  closeThread: () => void;

  setSearchQuery: (query: string) => void;
  runSearch: (channelId: string) => Promise<void>;
  clearSearch: () => void;

  handleNew: (message: Message) => void;
  handleUpdated: (message: Message) => void;
  handleDeleted: (event: MessageDeletedEvent) => void;
  clearAll: () => void;
}

export const useMessages = create<MessagesState>((set, get) => {
  /** Atualiza o slice de um canal já conhecido, sem criar slices à toa. */
  function patchSlice(channelId: string, patch: Partial<ChannelSlice>) {
    set((s) => {
      const current = s.byChannel[channelId];
      if (!current) return s;
      return { byChannel: { ...s.byChannel, [channelId]: { ...current, ...patch } } };
    });
  }

  function mapItems(channelId: string, fn: (items: ChatMessage[]) => ChatMessage[]) {
    set((s) => {
      const current = s.byChannel[channelId];
      if (!current) return s;
      const items = fn(current.items);
      if (items === current.items) return s;
      return { byChannel: { ...s.byChannel, [channelId]: { ...current, items } } };
    });
  }

  /** Mantém em memória só os últimos `CACHED_CHANNELS` canais visitados. */
  function touchChannel(channelId: string) {
    set((s) => {
      const recent = [channelId, ...s.recent.filter((id) => id !== channelId)];
      if (recent.length <= CACHED_CHANNELS) {
        return { recent, byChannel: { ...s.byChannel, [channelId]: s.byChannel[channelId] ?? EMPTY_SLICE } };
      }
      const keep = new Set(recent.slice(0, CACHED_CHANNELS));
      const byChannel: Record<string, ChannelSlice> = {};
      for (const [id, slice] of Object.entries(s.byChannel)) {
        if (keep.has(id)) byChannel[id] = slice;
      }
      byChannel[channelId] = s.byChannel[channelId] ?? EMPTY_SLICE;
      return { recent: recent.slice(0, CACHED_CHANNELS), byChannel };
    });
  }

  function clearAck(nonce?: string) {
    if (!nonce) return;
    const timer = ackTimers.get(nonce);
    if (timer) clearTimeout(timer);
    ackTimers.delete(nonce);
  }

  function armAck(nonce: string, channelId: string, parentId?: string) {
    clearAck(nonce);
    ackTimers.set(
      nonce,
      setTimeout(() => {
        ackTimers.delete(nonce);
        if (parentId) {
          set((s) => ({ threadItems: markFailed(s.threadItems, nonce) }));
        } else {
          mapItems(channelId, (items) => markFailed(items, nonce));
        }
      }, ACK_TIMEOUT_MS),
    );
  }

  function emitCreate(nonce: string, entry: OutboxEntry) {
    emit(WS_EVENTS.MESSAGE_CREATE, {
      channelId: entry.channelId,
      content: entry.content,
      nonce,
      ...(entry.parentId ? { parentId: entry.parentId } : {}),
      ...(entry.attachmentIds.length ? { attachmentIds: entry.attachmentIds } : {}),
      ...(entry.stickerId ? { stickerId: entry.stickerId } : {}),
    });
    armAck(nonce, entry.channelId, entry.parentId);
  }

  /** Carrega a primeira página do canal (usado ao abrir e ao ressincronizar). */
  async function fetchHistory(channelId: string) {
    const seq = nextSeq(channelId);
    patchSlice(channelId, { loading: true });
    try {
      const history = (await api.history(channelId)) as Message[];
      if (!isCurrent(channelId, seq)) return;
      patchSlice(channelId, {
        items: trim(history as ChatMessage[]),
        hasMore: history.length >= PAGE_SIZE,
        loading: false,
        loadingOlder: false,
      });
    } catch (e) {
      if (!isCurrent(channelId, seq)) return;
      patchSlice(channelId, { loading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar o histórico"), "error");
    }
  }

  return {
    byChannel: {},
    activeChannelId: null,
    recent: [],
    threadParentId: null,
    threadItems: [],
    threadLoading: false,
    searchQuery: "",
    searchResults: null,
    searching: false,

    open: async (channelId, opts = {}) => {
      if (get().activeChannelId === channelId) {
        joinChannel(channelId, opts); // idempotente; só garante a marcação sticky
        return;
      }
      set({
        activeChannelId: channelId,
        threadParentId: null,
        threadItems: [],
        threadLoading: false,
        searchQuery: "",
        searchResults: null,
        searching: false,
      });
      touchChannel(channelId);
      joinChannel(channelId, opts);
      await fetchHistory(channelId);
    },

    closeChannel: () => {
      set({
        activeChannelId: null,
        threadParentId: null,
        threadItems: [],
        searchQuery: "",
        searchResults: null,
      });
    },

    resyncActive: async () => {
      const channelId = get().activeChannelId;
      if (!channelId) return;
      await fetchHistory(channelId);
      // a thread aberta também pode ter perdido respostas durante a queda
      const parentId = get().threadParentId;
      if (parentId) {
        const parent = get().byChannel[channelId]?.items.find((m) => m.id === parentId);
        if (parent) await get().openThread(channelId, parent);
      }
    },

    loadOlder: async (channelId) => {
      const slice = get().byChannel[channelId];
      if (!slice || slice.loadingOlder || !slice.hasMore || slice.items.length === 0) return;
      patchSlice(channelId, { loadingOlder: true });
      const cursor = slice.items[0].id;
      try {
        const older = (await api.history(channelId, cursor)) as Message[];
        mapItems(channelId, (items) => prependOlder(items, older));
        patchSlice(channelId, {
          loadingOlder: false,
          hasMore: older.length >= PAGE_SIZE,
        });
      } catch (e) {
        patchSlice(channelId, { loadingOlder: false });
        ui.toast(errorMessage(e, "Não foi possível carregar mais mensagens"), "error");
      }
    },

    send: ({ channelId, guildId, author, content, attachments, parentId, sticker }) => {
      const text = content.trim().slice(0, MAX_MESSAGE_LENGTH);
      const list = attachments ?? [];
      // figurinha sozinha já é mensagem — o contrato aceita conteúdo vazio nesse caso
      if (!text && list.length === 0 && !sticker) return;
      const nonce = newNonce();
      const optimistic = optimisticMessage({
        nonce,
        channelId,
        guildId,
        author,
        content: text,
        attachments: list,
        parentId,
        sticker,
      });
      if (parentId) {
        set((s) => ({ threadItems: [...s.threadItems, optimistic] }));
        // o contador da raiz sobe na hora; o eco não soma de novo (ver handleNew)
        mapItems(channelId, (items) => bumpReplyCount(items, parentId, 1));
      } else {
        mapItems(channelId, (items) => trim([...items, optimistic]));
      }
      const entry: OutboxEntry = {
        channelId,
        content: text,
        attachmentIds: list.map((a) => a.id),
        parentId,
        stickerId: sticker?.id,
      };
      outbox.set(nonce, entry);
      emitCreate(nonce, entry);
    },

    retry: (nonce) => {
      const entry = outbox.get(nonce);
      if (!entry) return;
      if (entry.parentId) {
        set((s) => ({ threadItems: markPending(s.threadItems, nonce) }));
      } else {
        mapItems(entry.channelId, (items) => markPending(items, nonce));
      }
      emitCreate(nonce, entry);
    },

    discard: (nonce) => {
      const entry = outbox.get(nonce);
      clearAck(nonce);
      outbox.delete(nonce);
      if (!entry) return;
      if (entry.parentId) {
        set((s) => ({ threadItems: dropByNonce(s.threadItems, nonce) }));
        mapItems(entry.channelId, (items) => bumpReplyCount(items, entry.parentId!, -1));
      } else {
        mapItems(entry.channelId, (items) => dropByNonce(items, nonce));
      }
    },

    edit: (messageId, content) => {
      const text = content.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text) return;
      emit(WS_EVENTS.MESSAGE_EDIT, { messageId, content: text });
    },

    remove: async (messageId) => {
      const ok = await ui.confirm({
        title: "Apagar esta mensagem?",
        message: "A mensagem some para todo mundo no canal.",
        confirmLabel: "Apagar",
        danger: true,
      });
      if (!ok) return;
      emit(WS_EVENTS.MESSAGE_DELETE, { messageId });
    },

    toggleReaction: (messageId, emoji, userId) => {
      const state = get();
      const channelId = state.activeChannelId;
      const pool = [
        ...(channelId ? state.byChannel[channelId]?.items ?? [] : []),
        ...state.threadItems,
      ];
      const group = pool
        .find((m) => m.id === messageId)
        ?.reactions.find((r) => r.emoji === emoji);
      const mine = userId ? group?.userIds.includes(userId) : false;
      emit(mine ? WS_EVENTS.REACTION_REMOVE : WS_EVENTS.REACTION_ADD, {
        messageId,
        emoji,
      });
    },

    openThread: async (channelId, parent) => {
      set({ threadParentId: parent.id, threadItems: [], threadLoading: true });
      try {
        const items = (await api.thread(channelId, parent.id)) as Message[];
        // pode ter trocado de thread (ou fechado) durante o fetch
        if (get().threadParentId !== parent.id) return;
        set({ threadItems: items as ChatMessage[], threadLoading: false });
      } catch (e) {
        if (get().threadParentId !== parent.id) return;
        set({ threadItems: [], threadLoading: false });
        ui.toast(errorMessage(e, "Não foi possível abrir a thread"), "error");
      }
    },

    closeThread: () => set({ threadParentId: null, threadItems: [], threadLoading: false }),

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    runSearch: async (channelId) => {
      const query = get().searchQuery.trim();
      if (!query) {
        set({ searchResults: null });
        return;
      }
      const seq = nextSeq(`search:${channelId}`);
      set({ searching: true });
      try {
        const results = (await api.searchMessages(channelId, query)) as Message[];
        if (!isCurrent(`search:${channelId}`, seq)) return;
        set({ searchResults: results, searching: false });
      } catch (e) {
        if (!isCurrent(`search:${channelId}`, seq)) return;
        set({ searching: false });
        ui.toast(errorMessage(e, "A busca falhou"), "error");
      }
    },

    clearSearch: () => set({ searchQuery: "", searchResults: null, searching: false }),

    handleNew: (message) => {
      clearAck(message.nonce);
      const ours = message.nonce ? outbox.delete(message.nonce) : false;
      if (message.parentId) {
        const parentId = message.parentId;
        set((s) =>
          s.threadParentId === parentId
            ? { threadItems: reconcile(s.threadItems, message) }
            : s,
        );
        // o autor já somou 1 ao abrir o envio otimista — só os outros somam aqui
        if (!ours) mapItems(message.channelId, (items) => bumpReplyCount(items, parentId, 1));
        return;
      }
      mapItems(message.channelId, (items) => reconcile(items, message));
    },

    handleUpdated: (message) => {
      mapItems(message.channelId, (items) => applyUpdate(items, message));
      set((s) => {
        const threadItems = applyUpdate(s.threadItems, message);
        return threadItems === s.threadItems ? s : { threadItems };
      });
    },

    handleDeleted: ({ messageId, channelId, parentId }) => {
      mapItems(channelId, (items) => applyDelete(items, messageId, parentId));
      set((s) => ({ threadItems: applyDelete(s.threadItems, messageId, null) }));
      // apagaram a raiz da thread aberta → não há mais o que mostrar
      if (get().threadParentId === messageId) get().closeThread();
    },

    clearAll: () => {
      for (const timer of ackTimers.values()) clearTimeout(timer);
      ackTimers.clear();
      outbox.clear();
      seqByChannel.clear();
      set({
        byChannel: {},
        recent: [],
        activeChannelId: null,
        threadParentId: null,
        threadItems: [],
        threadLoading: false,
        searchQuery: "",
        searchResults: null,
        searching: false,
      });
    },
  };
});

/** Slice do canal ativo — o que a área de chat renderiza. */
export function useActiveSlice(): ChannelSlice {
  return useMessages((s) =>
    s.activeChannelId ? s.byChannel[s.activeChannelId] ?? EMPTY_SLICE : EMPTY_SLICE,
  );
}

export { MAX_MESSAGE_LENGTH };
export type { ChatMessage };
