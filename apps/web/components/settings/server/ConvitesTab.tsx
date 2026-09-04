"use client";

import InvitesPanel from "@/components/modals/InvitesPanel";
import { TituloDaPagina } from "@/components/settings/server/pagina";

/**
 * Aba "Convites": o título da página mais o `InvitesPanel`, que é a mesma
 * tabela do modal de convites (atalho do menu do servidor). Duplicar a tabela
 * seria manter duas listas que envelhecem diferente; o que a aba acrescenta é o
 * `<h1>`, que no modal quem escreve é o `Dialog`.
 *
 * "Pausar convites" não existe: não há como suspender convites na API, e um
 * botão inerte ao lado do que cria seria armadilha.
 */
export default function ConvitesTab({ guildId }: { guildId: string }) {
  return (
    <>
      <TituloDaPagina titulo="Convites" />
      <InvitesPanel guildId={guildId} />
    </>
  );
}
