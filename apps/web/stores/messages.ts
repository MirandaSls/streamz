import { create } from "zustand";
import {
  WS_EVENTS,
  replySnippet,
  type Attachment,
  type Message,
  type MessageDeletedEvent,
  type MessageReplyRef,
  type PublicUser,
  type Sticker,
} from "@streamz/shared";
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
/** Por quanto tempo a mensagem alcançada por um "ir para" fica destacada. */
const HIGHLIGHT_MS = 2000;

export interface ChannelSlice {
  items: ChatMessage[];
  /** há histórico mais antigo no servidor. */
  hasMore: boolean;
  loading: boolean;
  loadingOlder: boolean;
  /**
   * A última página mais antiga falhou. Fica no slice, e não num aviso solto,
   * porque no Discord o erro de paginação é uma barra dentro da própria
   * timeline (`.messagesErrorBar`), com "tentar de novo" — quem a desenha é o
   * `MessageList`. Volta a `false` quando `loadOlder` recomeça.
   */
  loadingOlderError: boolean;
}

const EMPTY_SLICE: ChannelSlice = {
  items: [],
  hasMore: true,
  loading: false,
  loadingOlder: false,
  loadingOlderError: false,
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
  /** id da mensagem citada (reply) e se ela menciona o autor original. */
  replyToId?: string;
  replyMention?: boolean;
  stickerId?: string;
}
const outbox = new Map<string, OutboxEntry>();
const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Última busca pedida, para o "Tentar de novo" do painel: o painel só conhece
 * o `guildId`, e a consulta no campo pode já ter mudado desde o pedido.
 */
let ultimaBusca: { channelId: string; guildId: string | null; query: string } | null = null;

/** Timer do destaque do "ir para": um só, o último jump manda. */
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

/** Referência curta de uma mensagem citada, no formato que a API devolve. */
function referenciaDe(m: Message): MessageReplyRef {
  return {
    id: m.id,
    author: m.author,
    content: replySnippet(m.content),
    hasAttachments: m.attachments.length > 0,
  };
}

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
  /**
   * Texto do erro da última busca, ou `null`. O Discord desenha a falha dentro
   * do painel de resultados (`.errorMessage_a98f3b`), não num aviso flutuante;
   * zera ao começar uma busca e em `clearSearch`.
   */
  searchError: string | null;
  /** onde a busca corre: só no canal aberto ou no servidor inteiro. */
  searchScope: "channel" | "guild";

  /**
   * Mensagem sendo respondida (barra acima do composer). `threadId` diz **em
   * qual composer** a barra aparece: a thread compartilha o `channelId` com o
   * canal, então sem ele as duas barras acenderiam ao mesmo tempo.
   */
  replyTarget: { channelId: string; message: Message; threadId: string | null } | null;
  /** "@ ligado": a resposta menciona o autor da original (padrão do Discord). */
  replyMention: boolean;
  /** mensagem alcançada por um "ir para" — fica destacada por 2 s. */
  highlightId: string | null;
  /**
   * Mensagem aberta para edição **na timeline**. Fica na store porque quem
   * dispara a edição pelo `↑` é o composer, e no Discord o campo de envio não
   * muda de papel: quem vira caixa de edição é a própria mensagem.
   */
  editingId: string | null;

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
  /** `semConfirmar` = Shift no clique de apagar (atalho do Discord). */
  remove: (messageId: string, semConfirmar?: boolean) => Promise<void>;
  startEditing: (messageId: string) => void;
  stopEditing: () => void;
  toggleReaction: (messageId: string, emoji: string, userId?: string) => void;

  /** `parent` só precisa do id: a lista de threads não tem a mensagem em mãos. */
  openThread: (channelId: string, parent: Pick<Message, "id">) => Promise<void>;
  closeThread: () => void;

  setSearchQuery: (query: string) => void;
  /** busca no servidor quando há `guildId`; senão, só na conversa. */
  runSearch: (target: { channelId: string; guildId: string | null }) => Promise<void>;
  /** Refaz a última busca pedida (consulta e alvo) — o "Tentar de novo" do erro. */
  retrySearch: () => Promise<void>;
  clearSearch: () => void;

  startReply: (message: Message, threadId?: string | null) => void;
  cancelReply: () => void;
  toggleReplyMention: () => void;

  /** Carrega a janela em volta da mensagem, rola até ela e destaca. */
  jumpTo: (channelId: string, messageId: string) => Promise<void>;
  clearHighlight: () => void;

  handleNew: (message: Message) => void;
  handleUpdated: (message: Message) => void;
  handleDeleted: (event: MessageDeletedEvent) => void;
  /**
   * ── j-bots ── "Dispensar mensagem" numa efêmera.
   *
   * **Só local, e não há rota.** A efêmera não está no canal: tirá-la da lista
   * é tirá-la de onde ela existe. Uma chamada ao servidor só serviria para
   * apagar antes da hora uma linha que a faxina apaga sozinha, e daria ao
   * cliente uma rota nova para escrever — sem nada em troca.
   *
   * Dispensar é definitivo dentro desta sessão: um `message.updated` posterior
   * do bot não a traz de volta, porque `applyUpdate` só mexe no que já está na
   * lista. É o que o Discord faz.
   */
  dispensarEfemera: (channelId: string, messageId: string) => void;
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
      ...(entry.replyToId
        ? { replyToId: entry.replyToId, replyMention: entry.replyMention ?? true }
        : {}),
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
        loadingOlderError: false,
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
    searchError: null,
    searchScope: "channel",
    replyTarget: null,
    replyMention: true,
    highlightId: null,
    editingId: null,

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
        searchError: null,
        // responder é por canal: a barra não pode sobreviver à troca
        replyTarget: null,
        highlightId: null,
        editingId: null,
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
        searchError: null,
        replyTarget: null,
        highlightId: null,
        editingId: null,
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
      patchSlice(channelId, { loadingOlder: true, loadingOlderError: false });
      const cursor = slice.items[0].id;
      try {
        const older = (await api.history(channelId, cursor)) as Message[];
        mapItems(channelId, (items) => prependOlder(items, older));
        patchSlice(channelId, {
          loadingOlder: false,
          hasMore: older.length >= PAGE_SIZE,
        });
      } catch {
        // sem aviso: a falha vira a barra de erro dentro da timeline
        // (`loadingOlderError`, desenhada pelo `MessageList`)
        patchSlice(channelId, { loadingOlder: false, loadingOlderError: true });
      }
    },

    send: ({ channelId, guildId, author, content, attachments, parentId, sticker }) => {
      const text = content.trim().slice(0, MAX_MESSAGE_LENGTH);
      const list = attachments ?? [];
      // figurinha sozinha já é mensagem — o contrato aceita conteúdo vazio nesse caso
      if (!text && list.length === 0 && !sticker) return;
      const nonce = newNonce();
      // a barra "Respondendo a X" só vale para o canal **e o escopo** em que foi
      // aberta: a thread divide o channelId com o canal, e sem comparar o
      // `threadId` uma resposta iniciada no canal viajaria junto com a da thread
      const alvo = get().replyTarget;
      const mesmoEscopo =
        !!alvo && alvo.channelId === channelId && alvo.threadId === (parentId ?? null);
      const respondendo = mesmoEscopo ? alvo!.message : null;
      const replyMention = get().replyMention;
      const optimistic = optimisticMessage({
        nonce,
        channelId,
        guildId,
        author,
        content: text,
        attachments: list,
        parentId,
        replyTo: respondendo ? referenciaDe(respondendo) : null,
        replyMention: respondendo ? replyMention : false,
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
        ...(respondendo ? { replyToId: respondendo.id, replyMention } : {}),
        stickerId: sticker?.id,
      };
      outbox.set(nonce, entry);
      emitCreate(nonce, entry);
      if (respondendo) set({ replyTarget: null, replyMention: true });
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

    remove: async (messageId, semConfirmar = false) => {
      // Shift no clique pula a caixa — é o atalho do Discord para quem está
      // limpando várias mensagens seguidas. Textos do Discord (ESPEC): título,
      // corpo e botão exatamente como na caixa deles.
      if (!semConfirmar) {
        const ok = await ui.confirm({
          title: "Excluir mensagem",
          message: "Tem certeza que deseja excluir esta mensagem?",
          // a caixa desenha a própria mensagem: confirmar sem ver o que se
          // apaga é como o erro acontece
          preview: messageId,
          confirmLabel: "Excluir",
          danger: true,
          // "não perguntar de novo": é esta chave que `MessageItem.tsx`
          // confere com `confirmacaoLembrada("apagar-mensagem")` antes de
          // pular a caixa — sem ela aqui, o checkbox nunca aparecia e a
          // marcação nunca acontecia.
          chaveDeLembrar: "apagar-mensagem",
        });
        if (!ok) return;
      }
      emit(WS_EVENTS.MESSAGE_DELETE, { messageId });
    },

    startEditing: (messageId) => set({ editingId: messageId }),
    stopEditing: () => set({ editingId: null }),

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

    runSearch: async ({ channelId, guildId }) => {
      const query = get().searchQuery.trim();
      const chave = `search:${guildId ?? channelId}`;
      if (!query) {
        // consulta vazia é o X do campo: além de fechar o painel, invalida a
        // busca em curso — sem o `nextSeq`, a resposta atrasada passava no
        // `isCurrent` e trazia os resultados de volta depois do X
        nextSeq(chave);
        set({ searchResults: null, searching: false, searchError: null });
        return;
      }
      ultimaBusca = { channelId, guildId, query };
      // no servidor a busca corre no servidor inteiro (como no Discord); numa
      // conversa direta não há servidor, então ela corre só no canal
      const escopo = guildId ? "guild" : "channel";
      const seq = nextSeq(chave);
      set({ searching: true, searchScope: escopo, searchError: null });
      try {
        const results = (await (guildId
          ? api.searchGuild(guildId, query)
          : api.searchMessages(channelId, query))) as Message[];
        if (!isCurrent(chave, seq)) return;
        set({ searchResults: results, searching: false });
      } catch (e) {
        if (!isCurrent(chave, seq)) return;
        // sem aviso: o erro aparece dentro do painel. `searchResults` fica como
        // estava — a `TelaDeBusca` do celular deduz a falha comparando antes e
        // depois (`desfechoDaBusca`), e zerar aqui esconderia essa falha lá
        set({ searching: false, searchError: errorMessage(e, "A busca falhou.") });
      }
    },

    retrySearch: async () => {
      const alvo = ultimaBusca;
      if (!alvo) return;
      set({ searchQuery: alvo.query });
      await get().runSearch({ channelId: alvo.channelId, guildId: alvo.guildId });
    },

    clearSearch: () => {
      // invalida a busca em curso pelo mesmo motivo do ramo vazio do `runSearch`
      if (ultimaBusca) nextSeq(`search:${ultimaBusca.guildId ?? ultimaBusca.channelId}`);
      set({ searchQuery: "", searchResults: null, searching: false, searchError: null });
    },

    startReply: (message, threadId = null) =>
      set({
        replyTarget: { channelId: message.channelId, message, threadId },
        replyMention: true,
      }),

    cancelReply: () => set({ replyTarget: null }),

    toggleReplyMention: () => set((s) => ({ replyMention: !s.replyMention })),

    jumpTo: async (channelId, messageId) => {
      const naTela = get().byChannel[channelId]?.items.some((m) => m.id === messageId);
      if (!naTela) {
        touchChannel(channelId);
        const seq = nextSeq(channelId);
        patchSlice(channelId, { loading: true });
        try {
          const janela = (await api.around(channelId, messageId)) as Message[];
          if (!isCurrent(channelId, seq)) return;
          patchSlice(channelId, {
            items: janela as ChatMessage[],
            // a janela é um recorte no meio do histórico: sempre há o que
            // carregar para trás
            hasMore: true,
            loading: false,
            loadingOlder: false,
            loadingOlderError: false,
          });
        } catch (e) {
          if (isCurrent(channelId, seq)) patchSlice(channelId, { loading: false });
          ui.toast(errorMessage(e, "Não foi possível abrir a mensagem"), "error");
          return;
        }
      }
      set({ highlightId: messageId });
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        highlightTimer = null;
        set((s) => (s.highlightId === messageId ? { highlightId: null } : s));
      }, HIGHLIGHT_MS);
    },

    clearHighlight: () => set({ highlightId: null }),

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

    dispensarEfemera: (channelId, messageId) => {
      mapItems(channelId, (items) => applyDelete(items, messageId, null));
    },

    clearAll: () => {
      for (const timer of ackTimers.values()) clearTimeout(timer);
      ackTimers.clear();
      outbox.clear();
      seqByChannel.clear();
      ultimaBusca = null;
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
        searchError: null,
        replyTarget: null,
        replyMention: true,
        highlightId: null,
        editingId: null,
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
