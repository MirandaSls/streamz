// Helper puro do select de canal (`type: 8`, `SelectDeBot.tsx`): a tabela
// `type` do Discord → `ChannelType` do Streamz, e o filtro por
// `channel_types` que o bot manda. Sem React — testado em
// `select-canais.test.ts`.
//
// A tabela é a mesma de `apps/api/.../traducao/canal.ts` (proibido tocar
// nesta onda; API interna, não exportada por `@streamz/shared`), só que
// invertida e restrita a `GuildChannelType`: um select de canal só lista
// canais de servidor (a store `channels` já é escopada a um servidor), nunca
// DM/GROUP, que não têm `type` numérico aplicável aqui.
//
// **Categoria (4, `GUILD_CATEGORY`) fica de fora.** O Discord aceita
// `channel_types: [4]`, mas o Streamz não guarda categoria em `Channel[]` —
// ela mora na store `categories`, fora da lista que este componente recebe.
// Um bot que peça só categorias veria a lista sempre vazia; ver "faltando" da
// entrega do cartão.

import type { Channel, GuildChannelType } from "@streamz/shared";
import { filtrarPorTexto } from "./select-opcoes";

/** `type` numérico do Discord por `GuildChannelType` (espelha `traducao/canal.ts`). */
export const TIPO_DE_CANAL_NO_DISCORD: Record<GuildChannelType, number> = {
  TEXT: 0,
  VOICE: 2,
  ANNOUNCEMENT: 5,
};

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

/** Canais do servidor que servem a este select (`channel_types` + busca), ordenados como a lista de canais. */
export function canaisFiltrados(
  channels: readonly Channel[],
  channelTypes: readonly number[] | undefined,
  busca: string,
): Channel[] {
  const doTipo = channels.filter((c) => canalCombinaComTipos(c, channelTypes));
  const comBusca = filtrarPorTexto(doTipo, busca, (c) => c.name ?? "");
  return comBusca.sort((a, b) => a.position - b.position);
}
