"use client";

import { nomeParaMim, type PublicUser } from "@streamz/shared";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";

// Re-exportada: a função pura vive em `@streamz/shared` (`packages/shared/src/menus.ts`,
// escrita pelo cartão CONTRATO) porque a mesma precedência vale para a compat
// com o Discord e para qualquer outro consumidor do contrato — não é lógica de
// tela. Este arquivo é a fronteira do lado da web: o hook que resolve os dois
// apelidos das stores para quem só tem o `PublicUser` e, quando o contexto é
// um servidor, o `guildId`.
export { nomeParaMim };

/**
 * O nome a mostrar para `user` na **minha** tela, já resolvendo os apelidos
 * das stores (`docs/CONTRATO-MENUS.md` §3): apelido de amigo (`useFriends`,
 * vale em qualquer contexto) > apelido no servidor (`useGuilds.members`, só
 * quando `guildId` é o servidor carregado) > nome de exibição > usuário.
 *
 * `guildId` ausente (DM, popover sem servidor) é o mesmo que estar fora do
 * servidor carregado: o apelido de servidor não entra na conta, como a função
 * pura já prevê com `apelidoNoServidor: undefined`.
 */
export function useNomeParaMim(
  user: Pick<PublicUser, "id" | "username" | "displayName">,
  guildId?: string,
): string {
  const apelidoDeAmigo = useFriends((s) => s.apelidos?.[user.id]);
  const apelidoNoServidor = useGuilds((s) =>
    guildId && guildId === s.activeGuildId
      ? (s.members.find((m) => m.user.id === user.id)?.nickname ?? undefined)
      : undefined,
  );
  return nomeParaMim(user, { apelidoDeAmigo, apelidoNoServidor });
}
