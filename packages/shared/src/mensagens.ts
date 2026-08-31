// Mensagens: envio, fixadas, threads, busca, caixa de entrada e comandos de barra.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── a-mensagens ──────────────────────────────────────────────

export { MAX_MESSAGE_LENGTH } from "./internos";

import { mentionsUser } from "./dominio";
import type { ChannelType, PublicUser } from "./dominio";
import type { Attachment, Message } from "./midia";

/**
 * Tipo da mensagem. `DEFAULT` é a mensagem escrita por alguém; as `SYSTEM_*`
 * são narração renderizada como uma linha discreta, sem avatar nem ações:
 * fixar (`SYSTEM_PIN`), entrada de membro (`SYSTEM_JOIN`, emitida pela
 * moderação) e os eventos de grupo de DM. O autor é sempre *quem fez* a ação;
 * o `content` guarda o alvo (username) ou o valor novo (nome do grupo).
 *
 * União única de propósito: o enum do banco tem exatamente estes literais, e a
 * equivalência é travada em `apps/api/src/common/enums.ts`.
 */
export type MessageType =
  | "DEFAULT"
  | "SYSTEM_PIN"
  | "SYSTEM_JOIN"
  | "SYSTEM_MEMBER_ADDED"
  | "SYSTEM_MEMBER_REMOVED"
  | "SYSTEM_MEMBER_LEFT"
  | "SYSTEM_GROUP_RENAMED"
  | "SYSTEM_GROUP_ICON"
  | "SYSTEM_MOD_NOTICE";

/** true para mensagem narrada pelo sistema (sem avatar, sem ações de autor). */
export function isSystemMessage(m: Pick<Message, "type">): boolean {
  return m.type !== "DEFAULT";
}

/** Tamanho do trecho citado na linha de referência de uma resposta. */
export const MESSAGE_REPLY_SNIPPET = 100;

/** Achata e corta o conteúdo citado para caber numa linha só. */
export function replySnippet(content: string, limit = MESSAGE_REPLY_SNIPPET): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/** Referência curta à mensagem respondida — o que a linha acima da resposta mostra. */
export interface MessageReplyRef {
  id: string;
  author: PublicUser;
  /** trecho já achatado, de até `MESSAGE_REPLY_SNIPPET` caracteres. */
  content: string;
  /** true quando a original tinha anexo (o trecho pode vir vazio). */
  hasAttachments: boolean;
}

/**
 * Menção a mim: `@usuario` no texto **ou** ser o autor da mensagem respondida
 * com "@ ligado" — a mesma regra do Discord. Vale para o destaque na timeline
 * e para o contador de menções do não-lido, que é onde ela erra caro.
 */
export function mentionsMe(
  m: Pick<Message, "content" | "replyTo" | "replyMention" | "author">,
  me: Pick<PublicUser, "id" | "username"> & { roleIds?: readonly string[] },
): boolean {
  if (m.author.id === me.id) return false;
  if (mentionsUser(m.content, me.username, me.roleIds ?? [])) return true;
  return Boolean(m.replyMention && m.replyTo && m.replyTo.author.id === me.id);
}

/** Quantas mensagens antes e depois `GET .../messages/around/:id` devolve. */
export const MESSAGE_AROUND_RADIUS = 25;

/** Caminho da rota que abre o canal e pula até a mensagem ("copiar link"). */
export function messageLinkPath(
  guildId: string | null,
  channelId: string,
  messageId: string,
): string {
  return `/app/channels/${guildId ?? "@me"}/${channelId}/${messageId}`;
}

// ── Fixadas ──────────────────────────────────────────────────

/** Teto de mensagens fixadas por canal (o mesmo do Discord). */
export const MAX_PINS_PER_CHANNEL = 50;

export interface PinnedMessage {
  message: Message;
  pinnedBy: PublicUser;
  pinnedAt: string;
}

export interface MessagePinnedEvent {
  channelId: string;
  pin: PinnedMessage;
}

export interface MessageUnpinnedEvent {
  channelId: string;
  messageId: string;
}

// ── Threads nomeadas ─────────────────────────────────────────

export const MAX_THREAD_NAME = 100;

/**
 * Thread na visão da mensagem raiz (o "ver thread" da timeline). O id é o da
 * própria mensagem raiz: uma raiz tem no máximo uma thread, e respostas antigas
 * (`parentId` sem `Thread`) continuam sendo uma thread sem nome.
 */
export interface ThreadSummary {
  id: string;
  name: string;
  archived: boolean;
  messageCount: number;
  /** primeiros participantes, para os avatares empilhados. */
  participants: PublicUser[];
  lastMessageAt: string | null;
}

/** Thread na lista do painel do cabeçalho. */
export interface ThreadView extends ThreadSummary {
  channelId: string;
  createdBy: PublicUser;
  createdAt: string;
}

/** Thread criada, renomeada ou (des)arquivada. */
export interface ThreadUpdatedEvent {
  channelId: string;
  thread: ThreadView;
}

// ── Caixa de entrada ─────────────────────────────────────────

/** Uma menção não lida na aba "Para você". */
export interface InboxMention {
  message: Message;
  /** nome do canal (null em DM 1-a-1: o título vem dos participantes). */
  channelName: string | null;
  channelType: ChannelType;
  guildId: string | null;
  guildName: string | null;
}

/** Um canal com não-lido, dentro do grupo do servidor. */
export interface InboxUnreadChannel {
  channelId: string;
  channelName: string | null;
  channelType: ChannelType;
  mentionCount: number;
  lastMessageAt: string | null;
}

/** Não-lidos agrupados por servidor (`guildId` null = mensagens diretas). */
export interface InboxUnreadGroup {
  guildId: string | null;
  guildName: string;
  channels: InboxUnreadChannel[];
}

// ── Busca avançada ───────────────────────────────────────────

export const SEARCH_HAS_VALUES = ["link", "image", "file"] as const;
export type SearchHas = (typeof SEARCH_HAS_VALUES)[number];

/** Filtros de uma busca, já separados do texto livre. */
export interface SearchFilters {
  /** o que sobrou depois de tirar os filtros — busca por conteúdo. */
  text: string;
  /** `from:@fulano` — autor. */
  from: string | null;
  /** `in:#canal` — canal (só na busca do servidor inteiro). */
  in: string | null;
  /** `has:link|image|file` — pode repetir; todos precisam valer. */
  has: SearchHas[];
  /** `before:AAAA-MM-DD` — mensagens antes deste dia (exclusivo). */
  before: string | null;
  /** `after:AAAA-MM-DD` — mensagens depois deste dia (exclusivo). */
  after: string | null;
  /** `mentions:@fulano` — mensagens que mencionam alguém. */
  mentions: string | null;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  text: "",
  from: null,
  in: null,
  has: [],
  before: null,
  after: null,
  mentions: null,
};

const SEARCH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** true quando `AAAA-MM-DD` existe no calendário (rejeita 2026-02-31). */
function isCalendarDate(value: string): boolean {
  if (!SEARCH_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Separa `from:`, `in:`, `has:`, `before:`, `after:` e `mentions:` do texto
 * livre da busca. Token com valor inválido (data que não existe, `has:xpto`)
 * **volta a ser texto** em vez de virar filtro silencioso — assim a busca não
 * devolve "nada encontrado" por um erro de digitação invisível.
 */
export function parseSearchQuery(raw: string): SearchFilters {
  const out: SearchFilters = { ...EMPTY_SEARCH_FILTERS, has: [] };
  const livre: string[] = [];

  for (const token of raw.trim().split(/\s+/)) {
    if (!token) continue;
    const m = /^(from|in|has|before|after|mentions):(.*)$/i.exec(token);
    if (!m) {
      livre.push(token);
      continue;
    }
    const chave = m[1].toLowerCase();
    const valor = m[2].trim();
    if (!valor) {
      livre.push(token);
      continue;
    }
    switch (chave) {
      case "from":
        out.from = valor.replace(/^@/, "");
        break;
      case "mentions":
        out.mentions = valor.replace(/^@/, "");
        break;
      case "in":
        out.in = valor.replace(/^#/, "");
        break;
      case "has": {
        const v = valor.toLowerCase() as SearchHas;
        if (SEARCH_HAS_VALUES.includes(v)) {
          if (!out.has.includes(v)) out.has.push(v);
        } else {
          livre.push(token);
        }
        break;
      }
      case "before":
      case "after":
        if (isCalendarDate(valor)) out[chave] = valor;
        else livre.push(token);
        break;
    }
  }

  out.text = livre.join(" ");
  return out;
}

/** true quando não há nem texto nem filtro — não há o que consultar. */
export function isEmptySearch(f: SearchFilters): boolean {
  return (
    !f.text.trim() &&
    !f.from &&
    !f.in &&
    !f.mentions &&
    !f.before &&
    !f.after &&
    f.has.length === 0
  );
}

// ── Comandos de barra (`/`) ──────────────────────────────────
/** O que um comando `/` faz com o texto que o segue. */
export type ComandoBarraTipo =
  /** acrescenta um sufixo fixo ao texto (/shrug, /tableflip, /unflip) */
  | "texto"
  /** envia como ação, em itálico (/me) */
  | "acao"
  /** envolve tudo em ||spoiler|| (/spoiler) */
  | "spoiler"
  /** abre o seletor de GIF já com o termo digitado (/giphy) */
  | "gif"
  /** muda o apelido no servidor (/nick) — depende do agente de cargos */
  | "apelido";

export interface ComandoBarra {
  nome: string;
  descricao: string;
  tipo: ComandoBarraTipo;
  /** rótulo do argumento no autocomplete ("mensagem", "termo"…). */
  argumento?: string;
}

/** Comandos do composer, na ordem em que o autocomplete os mostra. */
export const COMANDOS_BARRA: readonly ComandoBarra[] = [
  { nome: "shrug", descricao: "Acrescenta ¯\\_(ツ)_/¯ à mensagem", tipo: "texto", argumento: "mensagem" },
  { nome: "tableflip", descricao: "Acrescenta (╯°□°)╯︵ ┻━┻ à mensagem", tipo: "texto", argumento: "mensagem" },
  { nome: "unflip", descricao: "Acrescenta ┬─┬ ノ( ゜-゜ノ) à mensagem", tipo: "texto", argumento: "mensagem" },
  { nome: "me", descricao: "Envia a mensagem como ação, em itálico", tipo: "acao", argumento: "mensagem" },
  { nome: "spoiler", descricao: "Marca a mensagem inteira como spoiler", tipo: "spoiler", argumento: "mensagem" },
  { nome: "giphy", descricao: "Procura um GIF para enviar", tipo: "gif", argumento: "termo" },
  { nome: "nick", descricao: "Muda seu apelido neste servidor", tipo: "apelido", argumento: "apelido" },
];

/** Sufixo de cada comando que só acrescenta texto. */
export const SUFIXOS_COMANDO: Record<string, string> = {
  shrug: "¯\\_(ツ)_/¯",
  tableflip: "(╯°□°)╯︵ ┻━┻",
  unflip: "┬─┬ ノ( ゜-゜ノ)",
};

/** Prefixo que marca um anexo como spoiler (o Discord usa o mesmo). */
export const SPOILER_PREFIX = "SPOILER_";

/** true se o anexo deve entrar borrado (nome começa com `SPOILER_`). */
export function isSpoilerAttachment(a: Pick<Attachment, "filename">): boolean {
  return a.filename.startsWith(SPOILER_PREFIX);
}

/** Nome do anexo sem o prefixo de spoiler, para mostrar na tela. */
export function attachmentDisplayName(a: Pick<Attachment, "filename">): string {
  return isSpoilerAttachment(a) ? a.filename.slice(SPOILER_PREFIX.length) : a.filename;
}
