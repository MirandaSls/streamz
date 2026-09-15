import { create } from "zustand";
import { WS_EVENTS, type Poll, type PollAck } from "@streamz/shared";
import { api } from "@/lib/api";
import { aplicarVoto, mesclarContagem, reconciliarLote, type VotoEmVoo } from "@/stores/polls-core";
import { emitComAck, errorMessage } from "@/stores/socket-adapter";
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

/**
 * Votos em voo por enquete (ver `reconciliarLote`). Fora do estado do zustand
 * porque nada na tela lê isto: é contabilidade do ack, e mudar aqui não pode
 * renderizar o card de novo.
 */
const lotes = new Map<string, { base: Poll; votos: VotoEmVoo[]; servidor?: Poll; erro?: string }>();

/** O ack que falhou vira texto de toast; timeout e conexão caída também. */
function falhaDoAck(resposta: PollAck | undefined, e?: unknown): string | null {
  if (e !== undefined) return errorMessage(e, "Não foi possível falar com o servidor");
  if (!resposta) return "Não foi possível concluir a ação";
  return resposta.ok ? null : resposta.error || "Não foi possível concluir a ação";
}

interface PollsState {
  polls: Record<string, Poll>;
  /** canais cujos votos do usuário já foram buscados. */
  loadedChannels: string[];

  /** Guarda a enquete que veio na mensagem, sem sobrescrever versão mais nova. */
  seed: (poll: Poll) => void;
  /** Busca meus votos do canal e marca as opções (uma vez por canal). */
  loadMine: (channelId: string) => Promise<void>;
  /**
   * Vota/desvota: aplica na hora e manda o comando. Se o servidor recusar (ou
   * não responder), desfaz na tela e avisa num toast.
   */
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
    // sem a enquete na store não há otimista a desfazer: só manda e avisa
    if (!poll) {
      emitComAck<PollAck>(WS_EVENTS.POLL_VOTE, { messageId, optionIndex }).then(
        (r) => {
          const erro = falhaDoAck(r);
          if (erro) ui.toast(erro, "error");
        },
        (e) => ui.toast(falhaDoAck(undefined, e) ?? "", "error"),
      );
      return;
    }

    // o primeiro voto do lote guarda a enquete de antes; os seguintes entram
    // na fila do mesmo lote
    const lote = lotes.get(messageId) ?? { base: poll, votos: [] };
    lotes.set(messageId, lote);
    const voto: VotoEmVoo = { indice: optionIndex };
    lote.votos.push(voto);
    set((s) => ({ polls: { ...s.polls, [messageId]: aplicarVoto(poll, optionIndex) } }));

    const terminar = (erro: string | null) => {
      voto.ok = erro === null;
      if (erro && !lote.erro) lote.erro = erro;
      if (lote.votos.some((v) => v.ok === undefined)) return;
      lotes.delete(messageId);
      if (lote.votos.every((v) => v.ok)) return;
      set((s) => ({
        polls: { ...s.polls, [messageId]: reconciliarLote(lote.base, lote.votos, lote.servidor) },
      }));
      ui.toast(lote.erro ?? "Não foi possível registrar o voto", "error");
    };
    emitComAck<PollAck>(WS_EVENTS.POLL_VOTE, { messageId, optionIndex }).then(
      (r) => terminar(falhaDoAck(r)),
      (e) => terminar(falhaDoAck(undefined, e)),
    );
  },

  close: async (messageId) => {
    const ok = await ui.confirm({
      title: "Encerrar esta enquete?",
      message: "Ninguém mais poderá votar. Os resultados continuam visíveis.",
      confirmLabel: "Encerrar",
      danger: true,
    });
    if (!ok) return;
    // sem otimista aqui: o card só mostra "encerrada" quando o `poll.updated`
    // chega — a falha, antes muda, agora vira toast
    let erro: string | null;
    try {
      erro = falhaDoAck(await emitComAck<PollAck>(WS_EVENTS.POLL_CLOSE, { messageId }));
    } catch (e) {
      erro = falhaDoAck(undefined, e);
    }
    if (erro) ui.toast(erro, "error");
  },

  handleUpdated: (poll) => {
    // contagem do servidor chegando com voto meu em voo: guarda para o caso de
    // o lote precisar ser refeito (é a contagem certa, ver `reconciliarLote`)
    const lote = lotes.get(poll.messageId);
    if (lote) lote.servidor = poll;
    set((s) => ({
      polls: { ...s.polls, [poll.messageId]: mesclarContagem(s.polls[poll.messageId], poll) },
    }));
  },

  clear: () => {
    lotes.clear();
    set({ polls: {}, loadedChannels: [] });
  },
}));

/**
 * Manda criar a enquete pelo gateway (ela nasce como mensagem no canal, e chega
 * a todos pelo `message.new`). Resolve com o texto do erro, ou `null` quando o
 * servidor aceitou — o modal fica em "carregando" até lá e só fecha no sucesso.
 */
export async function criarEnquete(input: {
  channelId: string;
  question: string;
  options: string[];
  /** emoji de cada opção, na mesma posição; null = sem emoji. */
  optionEmojis?: (string | null)[];
  multi: boolean;
  durationHours?: number;
}): Promise<string | null> {
  try {
    return falhaDoAck(await emitComAck<PollAck>(WS_EVENTS.POLL_CREATE, input));
  } catch (e) {
    return falhaDoAck(undefined, e);
  }
}

/** A enquete a mostrar: a versão ao vivo, se houver; senão a que veio na mensagem. */
export function usePoll(fromMessage: Poll | null | undefined): Poll | null {
  const live = usePolls((s) => (fromMessage ? s.polls[fromMessage.messageId] : undefined));
  return live ?? fromMessage ?? null;
}
