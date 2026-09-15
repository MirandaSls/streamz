"use client";

import type { Message } from "@streamz/shared";
import { Eye } from "@/components/ui/icones";
import { useMessages } from "@/stores/messages";

/**
 * ── j-bots ── O rodapé da mensagem efêmera: "Somente você pode ver isso ·
 * Dispensar mensagem".
 *
 * É a única coisa que distingue uma efêmera de uma resposta comum de bot na
 * tela, e por isso ela tem de estar sempre visível — não no hover, não dentro
 * de um menu. Sem ela a pessoa não tem como saber que o canal não viu aquilo, e
 * responderia a uma conversa que ninguém está tendo.
 *
 * **Medidas:** `.ephemeralMessage__124d2` (`css-bruto/631323.f995d*.css`) —
 * `color: --text-muted; font-size: 12px; font-weight: normal; margin-top: 4px`.
 * A captura de `docs/Reference/efemeras/` (com fonte em `FONTES.md`) confirma
 * a linha **abaixo** do conteúdo, um olho antes do texto e o "Dispensar" na cor
 * de link.
 *
 * "Dispensar" é local (ver `useMessages.dispensarEfemera`): a efêmera não está
 * no canal, então tirá-la da lista é tirá-la de onde ela existe.
 */
export default function RodapeEfemero({ message }: { message: Message }) {
  const dispensar = useMessages((s) => s.dispensarEfemera);

  return (
    /* `flex-wrap` + `whitespace-nowrap` nas duas partes: na coluna estreita do
       celular a linha não cabe (262px úteis contra ~280px de texto), e sem isto
       ela quebrava **no meio das frases** — "Somente você pode / ver isso". Com
       as partes indivisíveis, a quebra cai entre elas, e o `·` some quando
       deixa de separar coisa nenhuma. */
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs font-normal leading-4 text-text-muted">
      <Eye size={16} aria-hidden="true" className="shrink-0" />
      <span className="whitespace-nowrap">Somente você pode ver isso</span>
      <span aria-hidden="true" className="celular:hidden">
        ·
      </span>
      <button
        type="button"
        onClick={() => dispensar(message.channelId, message.id)}
        /* `celular:min-h-[44px]`: no telefone este é o único gesto que a
           efêmera tem, e um alvo de 16px de altura não é alvo. */
        className="whitespace-nowrap font-medium text-text-link hover:underline celular:min-h-[44px]"
      >
        Dispensar mensagem
      </button>
    </div>
  );
}
