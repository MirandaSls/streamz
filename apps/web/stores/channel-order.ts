import type { Category, CategoryPosition, Channel, ChannelPosition } from "@streamz/shared";

/**
 * Ordem da barra lateral: como os canais se distribuem nas categorias e o que
 * muda quando alguém arrasta um deles.
 *
 * É lógica pura de propósito — a barra lateral só desenha o resultado e manda
 * a lista de posições para a API. Assim o cálculo (que é onde erra) tem teste
 * sem precisar de DOM, store nem servidor.
 */

export interface CategoryGroup {
  /** null = bloco dos canais sem categoria, que o Discord desenha no topo. */
  category: Category | null;
  channels: Channel[];
}

/** Ordena canais como a barra lateral mostra: posição e, no empate, nome. */
function porPosicao(a: Channel, b: Channel): number {
  if (a.position !== b.position) return a.position - b.position;
  return (a.name ?? "").localeCompare(b.name ?? "");
}

/**
 * Agrupa os canais nas categorias, na ordem de desenho: primeiro os soltos,
 * depois cada categoria pela sua posição. Canal cuja categoria não existe
 * (evento fora de ordem, categoria recém-apagada) cai no bloco dos soltos em
 * vez de sumir da tela.
 */
export function groupByCategory(channels: Channel[], categories: Category[]): CategoryGroup[] {
  const ordenadas = [...categories].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  );
  const conhecidas = new Set(ordenadas.map((c) => c.id));
  const soltos = channels.filter((c) => !c.categoryId || !conhecidas.has(c.categoryId));

  const grupos: CategoryGroup[] = [{ category: null, channels: soltos.sort(porPosicao) }];
  for (const categoria of ordenadas) {
    grupos.push({
      category: categoria,
      channels: channels.filter((c) => c.categoryId === categoria.id).sort(porPosicao),
    });
  }
  return grupos;
}

/**
 * Nova ordem depois de soltar um canal na posição `targetIndex` da categoria
 * `targetCategoryId` (null = bloco dos soltos).
 *
 * Devolve só os canais dos blocos que realmente mudaram (o de origem e o de
 * destino), renumerados de 0 em diante — mandar a lista inteira do servidor a
 * cada arrastar seria escrita à toa.
 */
export function moveChannel(
  channels: Channel[],
  categories: Category[],
  channelId: string,
  targetCategoryId: string | null,
  targetIndex: number,
): ChannelPosition[] {
  const grupos = groupByCategory(channels, categories);
  const canal = channels.find((c) => c.id === channelId);
  if (!canal) return [];

  const idDe = (g: CategoryGroup) => g.category?.id ?? null;
  const origem = grupos.find((g) => g.channels.some((c) => c.id === channelId));
  const destino = grupos.find((g) => idDe(g) === targetCategoryId);
  if (!origem || !destino) return [];

  const listaOrigem = origem.channels.filter((c) => c.id !== channelId);
  const listaDestino = origem === destino ? listaOrigem : [...destino.channels];
  const indice = Math.max(0, Math.min(targetIndex, listaDestino.length));
  listaDestino.splice(indice, 0, canal);

  const saida: ChannelPosition[] = [];
  const emitir = (lista: Channel[], categoryId: string | null) => {
    lista.forEach((c, i) => saida.push({ id: c.id, position: i, categoryId }));
  };
  if (origem !== destino) emitir(listaOrigem, idDe(origem));
  emitir(listaDestino, targetCategoryId);
  return saida;
}

/** Nova ordem das categorias depois de soltar uma delas em `targetIndex`. */
export function moveCategory(
  categories: Category[],
  categoryId: string,
  targetIndex: number,
): CategoryPosition[] {
  const ordenadas = [...categories].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  );
  const atual = ordenadas.findIndex((c) => c.id === categoryId);
  if (atual < 0) return [];
  const [movida] = ordenadas.splice(atual, 1);
  // o alvo foi medido na lista *com* a categoria arrastada: descontar a
  // remoção evita o clássico "arrastei para baixo e ele voltou ao mesmo lugar"
  const indice = Math.max(0, Math.min(targetIndex > atual ? targetIndex - 1 : targetIndex, ordenadas.length));
  ordenadas.splice(indice, 0, movida);
  return ordenadas.map((c, i) => ({ id: c.id, position: i }));
}

/**
 * Aplica localmente as posições que acabamos de mandar para a API, para a lista
 * não "pular de volta" enquanto o `channel.updated` não chega.
 */
export function applyPositions(channels: Channel[], positions: ChannelPosition[]): Channel[] {
  if (positions.length === 0) return channels;
  const mapa = new Map(positions.map((p) => [p.id, p]));
  return channels.map((c) => {
    const p = mapa.get(c.id);
    return p ? { ...c, position: p.position, categoryId: p.categoryId } : c;
  });
}
