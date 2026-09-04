import type { Channel, DMChannelView } from "@streamz/shared";

/**
 * "Eu li estes canais" — a parte pura do evento `channel.read`, testável sem
 * store.
 *
 * Leitura é da conta, não da aba: quando um aparelho abre a conversa, o outro
 * precisa apagar o badge sem F5. Quem originou a leitura já a aplicou de forma
 * otimista, então o eco chega a um estado que já é esse — por isso tudo aqui é
 * **idempotente**: aplicar duas vezes não muda nada e não pisca.
 *
 * `lastReadAt` só anda para a frente. Um evento atrasado (a resposta lenta de
 * uma leitura antiga) não pode desfazer uma leitura mais nova nem ressuscitar
 * um badge que já apagou.
 */

/** O canal (de servidor) lido até `at`: menções zeradas, `lastReadAt` no máximo. */
export function canalLido<T extends Pick<Channel, "lastReadAt" | "mentionCount">>(
  canal: T,
  at: string,
): T {
  if (canal.lastReadAt && canal.lastReadAt >= at) {
    // já lido depois disto: só garante que nada de menção ficou pendurado
    return canal.mentionCount === 0 ? canal : { ...canal, mentionCount: 0 };
  }
  return { ...canal, lastReadAt: at, mentionCount: 0 };
}

/** A conversa lida até `at` — como `canalLido`, mais o contador de não lidas. */
export function conversaLida<
  T extends Pick<DMChannelView, "lastReadAt" | "mentionCount" | "unreadCount">,
>(dm: T, at: string): T {
  if (dm.lastReadAt && dm.lastReadAt >= at) {
    return dm.mentionCount === 0 && dm.unreadCount === 0
      ? dm
      : { ...dm, mentionCount: 0, unreadCount: 0 };
  }
  return { ...dm, lastReadAt: at, mentionCount: 0, unreadCount: 0 };
}

/**
 * Aplica a leitura a uma lista inteira, mexendo só nos ids do lote. Devolve a
 * **mesma** lista quando nada mudou, para o zustand não notificar quem não
 * precisa redesenhar (é o que impede a piscada do eco).
 */
export function listaLida<T extends { id: string }>(
  lista: T[],
  ids: readonly string[],
  aplicar: (item: T) => T,
): T[] {
  const alvo = new Set(ids);
  let mudou = false;
  const nova = lista.map((item) => {
    if (!alvo.has(item.id)) return item;
    const depois = aplicar(item);
    if (depois !== item) mudou = true;
    return depois;
  });
  return mudou ? nova : lista;
}

/** Um servidor ainda tem canal não lido depois desta leitura? */
export function temNaoLido(
  canais: readonly Pick<Channel, "lastMessageAt" | "lastReadAt">[],
): boolean {
  return canais.some((c) => c.lastMessageAt && (!c.lastReadAt || c.lastMessageAt > c.lastReadAt));
}
