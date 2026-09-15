// Helper puro do select de canal (`type: 8`, `SelectDeBot.tsx` e o campo de
// select do `ModalDeBot.tsx`): a tabela `type` do Discord → `ChannelType` do
// Streamz, e o filtro por `channel_types` que o bot manda. Sem React — testado
// em `select-canais.test.ts`.
//
// A tabela é a mesma de `apps/api/.../traducao/canal.ts` (API interna, não
// exportada por `@streamz/shared`), só que invertida e restrita a
// `GuildChannelType`: um select de canal só lista canais de servidor (a store
// `channels` já é escopada a um servidor), nunca DM/GROUP, que não têm `type`
// numérico aplicável aqui.
//
// ## Categoria (4, `GUILD_CATEGORY`)
//
// No Discord categoria é canal; no Streamz é outra tabela (`Category`, store
// `categories`). Por isso `canaisFiltrados` recebe as categorias do mesmo
// servidor à parte e as devolve como itens `tipo: "categoria"` misturados aos
// canais, na ordem da barra lateral.
//
// Decisão da rodada de correção: a categoria só entra quando o bot pede `4`
// **explicitamente** em `channel_types`. Sem `channel_types` a lista continua
// só de canais — o `resolverValorDeSelect` da API (interactions.service.ts)
// procura o cuid só em `Channel` e recusaria a categoria com 400, então
// oferecê-la num select comum trocaria um select que funciona por "Esta
// interação falhou". Ver "faltando" da entrega do cartão.

import type { Category, Channel, GuildChannelType } from "@streamz/shared";
import { filtrarPorTexto } from "./select-opcoes";

/** `type` numérico do Discord por `GuildChannelType` (espelha `traducao/canal.ts`). */
export const TIPO_DE_CANAL_NO_DISCORD: Record<GuildChannelType, number> = {
  TEXT: 0,
  VOICE: 2,
  ANNOUNCEMENT: 5,
};

/** `GUILD_CATEGORY` — o mesmo número de `TIPO_DE_CATEGORIA_NO_DISCORD` da API. */
export const TIPO_DE_CATEGORIA_NO_DISCORD = 4;

/**
 * `channel.type` cabe em `channelTypes`? Lista vazia/ausente = qualquer tipo
 * (o Discord, sem `channel_types`, mostra todos os canais do servidor).
 */
export function canalCombinaComTipos(
  channel: Pick<Channel, "type">,
  channelTypes: readonly number[] | undefined,
): boolean {
  if (!channelTypes || channelTypes.length === 0) return true;
  const numero = (TIPO_DE_CANAL_NO_DISCORD as Partial<Record<Channel["type"], number>>)[channel.type];
  return numero !== undefined && channelTypes.includes(numero);
}

/** O select pede categorias? Só com `4` explícito — ver "Categoria" no topo do arquivo. */
export function selectAceitaCategoria(channelTypes: readonly number[] | undefined): boolean {
  return !!channelTypes && channelTypes.includes(TIPO_DE_CATEGORIA_NO_DISCORD);
}

/** Um item da lista do select de canal: um canal de verdade ou uma categoria (o "canal 4" do Discord). */
export type ItemDoSelectDeCanal =
  | { tipo: "canal"; id: string; nome: string; canal: Channel }
  | { tipo: "categoria"; id: string; nome: string; categoria: Category };

function porPosicao<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

/**
 * Canais (e categorias, quando pedidas) que servem a este select, com
 * `channel_types` + busca, na ordem da barra lateral: primeiro os canais sem
 * categoria, depois cada categoria seguida dos canais dela — cada grupo por
 * `position`. Canal cuja `categoryId` não está em `categories` (a store de
 * categorias ainda não carregou, por exemplo) cai no grupo sem categoria.
 *
 * A busca coteja o nome de cada item: uma categoria que casa não puxa junto os
 * canais dela, e um canal que casa aparece mesmo que a categoria dele não case
 * (nem esteja na lista, se `4` não foi pedido).
 */
export function canaisFiltrados(
  channels: readonly Channel[],
  channelTypes: readonly number[] | undefined,
  busca: string,
  categories: readonly Category[] = [],
): ItemDoSelectDeCanal[] {
  const comCategoria = selectAceitaCategoria(channelTypes);
  const categoriasOrdenadas = [...categories].sort(porPosicao);
  const idsDeCategoria = new Set(categoriasOrdenadas.map((c) => c.id));

  const doTipo = channels.filter((c) => canalCombinaComTipos(c, channelTypes));
  const canaisComBusca = filtrarPorTexto(doTipo, busca, (c) => c.name ?? "");
  const categoriasComBusca = new Set(comCategoria ? filtrarPorTexto(categoriasOrdenadas, busca, (c) => c.name) : []);

  const semGrupo = (c: Channel) => !c.categoryId || !idsDeCategoria.has(c.categoryId);
  const itensDeCanal = (lista: Channel[]) =>
    lista.sort(porPosicao).map((c): ItemDoSelectDeCanal => ({ tipo: "canal", id: c.id, nome: c.name ?? "", canal: c }));

  const saida: ItemDoSelectDeCanal[] = itensDeCanal(canaisComBusca.filter(semGrupo));
  for (const categoria of categoriasOrdenadas) {
    if (categoriasComBusca.has(categoria)) {
      saida.push({ tipo: "categoria", id: categoria.id, nome: categoria.name, categoria });
    }
    saida.push(...itensDeCanal(canaisComBusca.filter((c) => c.categoryId === categoria.id)));
  }
  return saida;
}
