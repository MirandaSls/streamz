"use client";

import InvitesPanel from "@/components/modals/InvitesPanel";
import { TituloDaPagina } from "@/components/settings/server/pagina";

/**
 * Aba "Convites": o título da página mais o `InvitesPanel`, que é a mesma
 * tabela do modal de convites (atalho do menu do servidor). Duplicar a tabela
 * seria manter duas listas que envelhecem diferente; o que a aba acrescenta é o
 * `<h1>`, que no modal quem escreve é o `Dialog`.
 *
 * Sem subtítulo: o print `docs/Reference/Captura de tela 2026-09-04
 * 100706.png` não mostra frase nenhuma entre "Convites" e a linha de botões
 * do `InvitesPanel` — diferente de "Perfil do servidor"/"Emoji", que têm.
 *
 * "Pausar convites" existe no `InvitesPanel` como botão visível e
 * desabilitado, com a dica "(em breve)": a API não sabe suspender convite
 * (§6.6 do PROCESSO), e sumir com o controle escondia que o Discord tem essa
 * opção — ver o cabeçalho do `InvitesPanel` para a medida.
 */
export default function ConvitesTab({ guildId }: { guildId: string }) {
  return (
    <>
      <TituloDaPagina titulo="Convites" />
      <InvitesPanel guildId={guildId} />
    </>
  );
}
