import { MAX_MESSAGE_LENGTH } from "@newdisc/shared";
import type { Attachment, Message, MessageReplyRef, PublicUser } from "@newdisc/shared";

/**
 * Regras puras da timeline de um canal — sem React, sem socket, sem fetch.
 * Ficam separadas da store para poderem ser testadas isoladamente (é aqui que
 * mora a lógica errável: casar o eco do nonce, não duplicar mensagem, manter o
 * contador de respostas e segurar o tamanho do array).
 */

/** Mensagem na tela: a do contrato + o estado local do envio otimista. */
export type ChatMessage = Message & {
  /** true enquanto o servidor não ecoou o `message.new` com este nonce. */
  pending?: boolean;
  /** true quando o eco não chegou no prazo — dá para reenviar ou descartar. */
  failed?: boolean;
};

/**
 * Teto de mensagens mantidas em memória por canal.
 *
 * Escolhemos janela de retenção em vez de virtualização
 * (`@tanstack/react-virtual`): as linhas têm altura muito variável (anexos,
 * reações, formulário de edição inline, link de thread) e um virtualizador
 * precisaria medir cada uma, o que briga com o auto-scroll e com as ações no
 * `group-hover`. Com 500 linhas o DOM já fica limitado, sem dependência nova e
 * sem mudar nada no visual. O que sai do topo continua alcançável: `loadOlder`
 * pagina pelo id da primeira mensagem ainda em memória.
 */
export const RETENTION_LIMIT = 500;

/** Limite de caracteres por mensagem — o mesmo que o gateway valida. */
export { MAX_MESSAGE_LENGTH };

/** Corta o excesso pelo topo (o mais antigo é o que dá para repaginar). */
export function trim(items: ChatMessage[], limit = RETENTION_LIMIT): ChatMessage[] {
  return items.length > limit ? items.slice(items.length - limit) : items;
}

/** Monta a mensagem otimista que aparece na tela antes da confirmação. */
export function optimisticMessage(input: {
  nonce: string;
  channelId: string;
  guildId?: string | null;
  author: PublicUser;
  content: string;
  attachments?: Attachment[];
  parentId?: string | null;
  /** referência da mensagem respondida, para a linha aparecer já no otimista. */
  replyTo?: MessageReplyRef | null;
  replyMention?: boolean;
}): ChatMessage {
  return {
    id: `pending:${input.nonce}`,
    channelId: input.channelId,
    guildId: input.guildId ?? null,
    author: input.author,
    content: input.content,
    createdAt: new Date().toISOString(),
    editedAt: null,
    reactions: [],
    parentId: input.parentId ?? null,
    replyCount: 0,
    attachments: input.attachments ?? [],
    type: "DEFAULT",
    replyTo: input.replyTo ?? null,
    replyMention: input.replyMention ?? false,
    thread: null,
    pinned: false,
    nonce: input.nonce,
    pending: true,
  };
}

/**
 * Insere a mensagem que chegou do servidor.
 *
 * Ordem de resolução: (1) se casa com um nonce pendente, substitui no lugar —
 * a mensagem não "pula" para o fim; (2) se o id já está na lista, atualiza (o
 * mesmo evento pode chegar duas vezes numa reconexão); (3) senão, entra no fim.
 */
export function reconcile(items: ChatMessage[], incoming: Message): ChatMessage[] {
  if (incoming.nonce) {
    const i = items.findIndex((m) => m.pending && m.nonce === incoming.nonce);
    if (i >= 0) {
      const next = items.slice();
      next[i] = { ...incoming };
      return next;
    }
  }
  const byId = items.findIndex((m) => m.id === incoming.id);
  if (byId >= 0) {
    const next = items.slice();
    next[byId] = { ...items[byId], ...incoming, pending: false, failed: false };
    return next;
  }
  return trim([...items, { ...incoming }]);
}

/** Aplica uma edição/reação vinda de `message.updated`. */
export function applyUpdate(items: ChatMessage[], updated: Message): ChatMessage[] {
  let touched = false;
  const next = items.map((m) => {
    if (m.id !== updated.id) return m;
    touched = true;
    // preserva o replyCount local: `message.updated` não conhece respostas
    // criadas depois que a mensagem foi carregada.
    return { ...updated, replyCount: Math.max(updated.replyCount, m.replyCount) };
  });
  return touched ? next : items;
}

/** Remove a mensagem apagada e devolve o contador da raiz ao valor certo. */
export function applyDelete(
  items: ChatMessage[],
  messageId: string,
  parentId: string | null,
): ChatMessage[] {
  const filtered = items.filter((m) => m.id !== messageId);
  if (!parentId) return filtered.length === items.length ? items : filtered;
  return filtered.map((m) =>
    m.id === parentId ? { ...m, replyCount: Math.max(0, m.replyCount - 1) } : m,
  );
}

/** Soma `delta` ao contador de respostas da mensagem raiz. */
export function bumpReplyCount(
  items: ChatMessage[],
  parentId: string,
  delta: number,
): ChatMessage[] {
  return items.map((m) =>
    m.id === parentId ? { ...m, replyCount: Math.max(0, m.replyCount + delta) } : m,
  );
}

/** Marca a mensagem otimista como não entregue (o eco não chegou). */
export function markFailed(items: ChatMessage[], nonce: string): ChatMessage[] {
  return items.map((m) =>
    m.nonce === nonce && m.pending ? { ...m, pending: false, failed: true } : m,
  );
}

/** Volta uma mensagem falha para "enviando" (reenvio). */
export function markPending(items: ChatMessage[], nonce: string): ChatMessage[] {
  return items.map((m) =>
    m.nonce === nonce ? { ...m, pending: true, failed: false } : m,
  );
}

/** Descarta a mensagem otimista (o usuário desistiu do reenvio). */
export function dropByNonce(items: ChatMessage[], nonce: string): ChatMessage[] {
  return items.filter((m) => m.nonce !== nonce);
}

/** Junta uma página de mensagens antigas no topo, sem repetir o que já existe. */
export function prependOlder(items: ChatMessage[], older: Message[]): ChatMessage[] {
  const known = new Set(items.map((m) => m.id));
  const fresh = older.filter((m) => !known.has(m.id));
  if (fresh.length === 0) return items;
  // Sem `trim` aqui de propósito: cortar pelo fim jogaria fora justamente as
  // mensagens novas que chegam ao vivo, e o topo é o que o usuário pediu.
  return [...fresh, ...items];
}
