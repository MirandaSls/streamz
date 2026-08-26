import { create } from "zustand";
import { WS_EVENTS, type Poll } from "@newdisc/shared";
import { api } from "@/lib/api";
import { aplicarVoto, mesclarContagem } from "@/stores/polls-core";
import { emit } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Enquetes, por mensagem.
 *
 * A enquete chega junto da mensagem (`message.poll`), mas as contagens mudam ao
 * vivo — e uma mensagem já renderizada não é refeita. Esta store é a *camada de
 * cima*: o card lê daqui quando há uma versão mais nova, e cai no que veio na
 * mensagem enquanto não há.
 *
 * O `poll.updated` é um broadcast: ele vale para todo mundo na sala e por isso
 * **não pode** dizer "eu votei aqui" — quem recebe preserva a própria marcação
 * (`me`) e aproveita só as contagens. A verdade do `me` vem de dois lugares: do
 * clique (otimista) e de `GET /channels/:id/polls/votes` ao abrir o canal.
 */

interface PollsState {
  polls: Record<string, Poll>;
  /** canais cujos votos do usuário já foram buscados. */
  loadedChannels: string[];

  /** Guarda a enquete que veio na mensagem, sem sobrescrever versão mais nova. */
  seed: (poll: Poll) => void;
  /** Busca meus votos do canal e marca as opções (uma vez por canal). */
  loadMine: (channelId: string) => Promise<void>;
  /** Vota/desvota: aplica na hora e manda o comando. */
  vote: (messageId: string, optionIndex: number) => void;
  close: (messageId: string) => Promise<void>;
  /** Contagem nova vinda do gateway; preserva o `me` local. */
  handleUpdated: (poll: Poll) => void;
  clear: () => void;
}

export const usePolls = create<PollsState>((set, get) => ({
  polls: {},
  loadedChannels: [],

  seed: (poll) =>
    set((s) => (s.polls[poll.messageId] ? s : { polls: { ...s.polls, [poll.messageId]: poll } })),

  loadMine: async (channelId) => {
    if (get().loadedChannels.includes(channelId)) return;
    set((s) => ({ loadedChannels: [...s.loadedChannels, channelId] }));
    try {
      const meus = await api.myPollVotes(channelId);
      if (meus.length === 0) return;
      set((s) => {
        const polls = { ...s.polls };
        for (const { messageId, optionIndexes } of meus) {
          const poll = polls[messageId];
          if (!poll) continue;
          polls[messageId] = {
            ...poll,
            options: poll.options.map((o) => ({ ...o, me: optionIndexes.includes(o.index) })),
          };
        }
        return { polls };
      });
    } catch {
      // sem os meus votos a enquete ainda mostra as contagens; tenta de novo
      // na próxima abertura do canal
      set((s) => ({ loadedChannels: s.loadedChannels.filter((id) => id !== channelId) }));
    }
  },

  vote: (messageId, optionIndex) => {
    const poll = get().polls[messageId];
    if (poll) {
      set((s) => ({ polls: { ...s.polls, [messageId]: aplicarVoto(poll, optionIndex) } }));
    }
    emit(WS_EVENTS.POLL_VOTE, { messageId, optionIndex });
  },

  close: async (messageId) => {
    const ok = await ui.confirm({
      title: "Encerrar esta enquete?",
      message: "Ninguém mais poderá votar. Os resultados continuam visíveis.",
      confirmLabel: "Encerrar",
      danger: true,
    });
    if (!ok) return;
    emit(WS_EVENTS.POLL_CLOSE, { messageId });
  },

  handleUpdated: (poll) =>
    set((s) => ({
      polls: { ...s.polls, [poll.messageId]: mesclarContagem(s.polls[poll.messageId], poll) },
    })),

  clear: () => set({ polls: {}, loadedChannels: [] }),
}));

/** Manda criar a enquete pelo gateway (ela nasce como mensagem no canal). */
export function criarEnquete(input: {
  channelId: string;
  question: string;
  options: string[];
  multi: boolean;
  durationHours?: number;
}) {
  emit(WS_EVENTS.POLL_CREATE, input);
}

/** A enquete a mostrar: a versão ao vivo, se houver; senão a que veio na mensagem. */
export function usePoll(fromMessage: Poll | null | undefined): Poll | null {
  const live = usePolls((s) => (fromMessage ? s.polls[fromMessage.messageId] : undefined));
  return live ?? fromMessage ?? null;
}
