/**
 * Busca do quick switcher (Ctrl+K).
 *
 * Lógica pura: quem monta a lista de candidatos é o modal, quem ordena é aqui.
 * O ranqueamento é o do Discord — prefixo ganha de "começo de palavra", que
 * ganha de "contém", que ganha de subsequência ("gr" casa "geral") — e os
 * prefixos `#`, `@` e `*` filtram por tipo em vez de virarem texto de busca.
 */

export type QuickKind = "channel" | "dm" | "guild";

export interface QuickItem {
  id: string;
  kind: QuickKind;
  /** o que o usuário lê e pelo que buscamos. */
  label: string;
  /** contexto à direita (nome do servidor, "conversa"…). */
  hint?: string;
}

/** Prefixo digitado → tipo que ele filtra. */
const PREFIXOS: Record<string, QuickKind> = { "#": "channel", "@": "dm", "*": "guild" };

export interface QuickQuery {
  /** tipo pedido pelo prefixo, ou null para "qualquer um". */
  kind: QuickKind | null;
  /** o texto sem o prefixo, normalizado. */
  text: string;
}

/** Tira acento e caixa: "Geral" e "gerál" têm de casar com "geral". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Separa o prefixo de tipo (`#`, `@`, `*`) do texto buscado. */
export function parseQuery(raw: string): QuickQuery {
  const texto = raw.trimStart();
  const kind = PREFIXOS[texto[0] ?? ""] ?? null;
  return { kind, text: normalize(kind ? texto.slice(1) : texto) };
}

/**
 * Pontuação de um candidato (maior = melhor); null quando não casa.
 *
 * Os patamares são separados por 1000 para que o desempate por posição/tamanho
 * nunca faça um "contém" passar na frente de um prefixo.
 */
export function score(label: string, query: string): number | null {
  if (!query) return 0;
  const alvo = normalize(label);
  if (alvo.startsWith(query)) return 4000 - alvo.length;

  const emPalavra = alvo.split(/[\s\-_/.]+/).some((p) => p.startsWith(query));
  if (emPalavra) return 3000 - alvo.length;

  const posicao = alvo.indexOf(query);
  if (posicao >= 0) return 2000 - posicao * 10 - alvo.length;

  return subsequencia(alvo, query) ? 1000 - alvo.length : null;
}

/** true se as letras da busca aparecem em ordem no alvo ("gr" em "geral"). */
function subsequencia(alvo: string, query: string): boolean {
  let i = 0;
  for (const c of alvo) {
    if (c === query[i]) i += 1;
    if (i === query.length) return true;
  }
  return query.length === 0;
}

/** Ordem entre tipos quando a pontuação empata (canal primeiro, como no Discord). */
const ORDEM_TIPO: Record<QuickKind, number> = { channel: 0, dm: 1, guild: 2 };

/**
 * Filtra e ordena os candidatos. Com a busca vazia devolve os `recentes` na
 * ordem em que vieram (o modal passa os últimos abertos), limitados a `limit`.
 */
export function rank(
  items: readonly QuickItem[],
  raw: string,
  { limit = 25, recentes = [] as readonly string[] } = {},
): QuickItem[] {
  const { kind, text } = parseQuery(raw);
  const candidatos = kind ? items.filter((i) => i.kind === kind) : items;

  if (!text) {
    const porId = new Map(candidatos.map((i) => [i.id, i]));
    const recentesFiltrados = recentes
      .map((id) => porId.get(id))
      .filter((i): i is QuickItem => Boolean(i));
    return (recentesFiltrados.length > 0 ? recentesFiltrados : candidatos).slice(0, limit);
  }

  return candidatos
    .map((item) => ({ item, pontos: score(item.label, text) }))
    .filter((r): r is { item: QuickItem; pontos: number } => r.pontos !== null)
    .sort(
      (a, b) =>
        b.pontos - a.pontos ||
        ORDEM_TIPO[a.item.kind] - ORDEM_TIPO[b.item.kind] ||
        a.item.label.localeCompare(b.item.label),
    )
    .slice(0, limit)
    .map((r) => r.item);
}
