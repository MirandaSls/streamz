"use client";

import { create } from "zustand";
import { isUnread } from "@streamz/shared";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useMessages } from "@/stores/messages";

/**
 * Fronteira do "não lido" de cada canal — o que desenha o divisor vermelho
 * **NOVO** na timeline e a barra "Você tem mensagens não lidas".
 *
 * O ponto difícil: abrir o canal já o marca como lido (`channels.select` e
 * `dms.show` chamam `markRead` na hora), então quando a lista monta o
 * `lastReadAt` do canal **já é agora** e a informação de onde a leitura tinha
 * parado se perdeu. Por isso a fronteira é capturada por uma assinatura das
 * duas stores: ao ver `lastReadAt` mudar, guardamos o valor **anterior**.
 *
 * E ela é decidida **uma vez por visita**: a primeira transição depois de
 * entrar no canal manda, e as marcações seguintes (mensagem nova chegando com
 * o canal aberto) não empurram o divisor para baixo — no Discord a linha
 * vermelha fica onde estava enquanto você continua lendo, e só some quando você
 * sai e volta, ou clica em "Marcar como lidas".
 */

interface Estado {
  /** channelId → instante em que a leitura parou (null = nunca leu). */
  fronteiras: Record<string, string | null>;
  congelar: (channelId: string, iso: string | null) => void;
  /** Some com o divisor sem reabrir a decisão desta visita. */
  esquecer: (channelId: string) => void;
  /** Sair do canal: a próxima visita volta a decidir do zero. */
  sair: (channelId: string) => void;
  /** Põe a fronteira logo antes de uma mensagem ("marcar como não lida"). */
  marcarNaoLidaAPartirDe: (channelId: string, createdAt: string) => void;
}

/**
 * Canais cuja fronteira já foi decidida nesta visita. Fora do estado reativo de
 * propósito: é memória de controle, e não muda nada do que se desenha.
 */
const decididos = new Set<string>();

export const useMarcadorNaoLido = create<Estado>((set) => ({
  fronteiras: {},

  congelar: (channelId, iso) => {
    if (decididos.has(channelId)) return;
    decididos.add(channelId);
    set((s) => ({ fronteiras: { ...s.fronteiras, [channelId]: iso } }));
  },

  esquecer: (channelId) => {
    decididos.add(channelId);
    set((s) => {
      if (!(channelId in s.fronteiras)) return s;
      const fronteiras = { ...s.fronteiras };
      delete fronteiras[channelId];
      return { fronteiras };
    });
  },

  sair: (channelId) => {
    decididos.delete(channelId);
    set((s) => {
      if (!(channelId in s.fronteiras)) return s;
      const fronteiras = { ...s.fronteiras };
      delete fronteiras[channelId];
      return { fronteiras };
    });
  },

  marcarNaoLidaAPartirDe: (channelId, createdAt) => {
    decididos.add(channelId);
    set((s) => ({
      // 1 ms antes: a fronteira é exclusiva, então a própria mensagem cai do
      // lado "não lido" e o divisor aparece acima dela
      fronteiras: {
        ...s.fronteiras,
        [channelId]: new Date(new Date(createdAt).getTime() - 1).toISOString(),
      },
    }));
  },
}));

/** A fronteira do canal, ou `undefined` quando não há divisor a desenhar. */
export function useFronteiraNaoLida(channelId: string | undefined): string | null | undefined {
  return useMarcadorNaoLido((s) => (channelId ? s.fronteiras[channelId] : undefined));
}

// ── captura da fronteira ────────────────────────────────────────────────────

type Lido = { id: string; lastReadAt: string | null; lastMessageAt: string | null };

/** Último `lastReadAt` visto por canal, para reconhecer a transição. */
const visto = new Map<string, string | null>();

function observar(lista: Lido[]) {
  const ativo = useMessages.getState().activeChannelId;
  const { congelar } = useMarcadorNaoLido.getState();
  for (const c of lista) {
    const antes = visto.get(c.id);
    visto.set(c.id, c.lastReadAt);
    if (antes === undefined || antes === c.lastReadAt) continue;
    // só a marcação que acontece ao **entrar** no canal vira fronteira: um
    // "marcar como lido" pelo menu da barra lateral não deve deixar um divisor
    // pendurado para a próxima visita
    if (c.id !== ativo) continue;
    if (!isUnread({ lastMessageAt: c.lastMessageAt, lastReadAt: antes })) continue;
    congelar(c.id, antes);
  }
}

if (typeof window !== "undefined") {
  useChannels.subscribe((s) => observar(s.channels));
  useDMs.subscribe((s) => observar(s.channels));
}
