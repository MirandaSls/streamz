import type { Guild } from "@streamz/shared";

/**
 * A parte pura de "entrei num servidor" — a lista do rail depois do evento
 * `guild.joined`.
 *
 * Existe separada da store porque é ela que o defeito atinge: entrar num
 * servidor pelo site não aparecia no desktop até reiniciar. O evento agora sai
 * para todas as conexões da conta (`emitToUser`), e é esta função que decide o
 * que a lista vira quando ele chega.
 *
 * Duas garantias:
 *  - **idempotente**: a sessão que fez o pedido recebe o próprio evento de
 *    volta (a sala do usuário inclui quem pediu) e não pode duplicar o item;
 *  - **não regride o não-lido**: o evento chega com `unread: false` e
 *    `mentionCount: 0` porque servidor recém-entrado não tem nada por ler; se o
 *    servidor já estava na lista (corrida com o `GET /guilds` do boot), o que
 *    vale é o que a lista já sabia sobre nome, ícone e contadores.
 */
export function comServidorNovo(lista: Guild[], guild: Guild): Guild[] {
  const atual = lista.find((g) => g.id === guild.id);
  if (!atual) return [...lista, guild];
  return lista.map((g) =>
    g.id === guild.id
      ? { ...guild, unread: atual.unread, mentionCount: atual.mentionCount }
      : g,
  );
}
