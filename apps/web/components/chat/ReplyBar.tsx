"use client";

import { useEffect } from "react";
import { X } from "@/components/ui/icones";
import { displayNameOf } from "@streamz/shared";
import { useMessages } from "@/stores/messages";
import { useAuthorColor } from "@/stores/permissions";

/**
 * Barra "Respondendo a X" que aparece colada acima do composer, como no
 * Discord — inclusive o interruptor "@ ligado/desligado", que decide se a
 * resposta menciona (e notifica) o autor da mensagem citada.
 *
 * A altura total é 48px, dos quais 8px ficam escondidos atrás do canto
 * arredondado do composer: sobram os 40px visíveis do Discord.
 */
export default function ReplyBar({
  channelId,
  threadId = null,
}: {
  channelId: string;
  /** escopo: o painel de thread e o canal dividem o mesmo `channelId`. */
  threadId?: string | null;
}) {
  const alvo = useMessages((s) => s.replyTarget);
  const mention = useMessages((s) => s.replyMention);
  const cancelReply = useMessages((s) => s.cancelReply);
  const toggleReplyMention = useMessages((s) => s.toggleReplyMention);
  // o nome do citado sai na cor do cargo dele, como na timeline
  const cor = useAuthorColor(alvo?.message.author.id ?? "");

  // Esc cancela a resposta mesmo com o foco fora do composer
  useEffect(() => {
    if (!alvo) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") cancelReply();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alvo, cancelReply]);

  if (!alvo || alvo.channelId !== channelId || alvo.threadId !== threadId) return null;

  return (
    /* `celular:mx-3`: a barra tem que nascer alinhada com a cápsula do
       composer, que no telefone usa `px-3` — com o `mx-4` do desktop ela ficava
       4px para dentro de cada lado, e a diferença aparece porque as duas se
       tocam. */
    <div className="mx-4 celular:mx-3 -mb-2 flex h-12 items-center gap-2 rounded-t-lg bg-background-base-lowest px-4 celular:px-3 pb-2 text-xs text-text-muted">
      <span className="min-w-0 truncate">
        Respondendo a{" "}
        <span style={cor ? { color: cor } : undefined} className="font-medium text-text-strong">
          {displayNameOf(alvo.message.author)}
        </span>
      </span>
      <button
        type="button"
        onClick={toggleReplyMention}
        aria-pressed={mention}
        /* No celular o alvo vai a 44 de altura sem engordar a pílula: o
           desenho continua o de 20px do Discord e quem cresce é a área de
           toque (a mesma regra do `BotaoDeToque` de `components/mobile/
           pecas.tsx`). Medido antes: 67×19. */
        className={`ml-auto grid h-5 celular:h-[44px] shrink-0 place-items-center rounded-[3px] px-1.5 celular:px-3 text-[11px] font-bold uppercase leading-none transition ${
          mention
            ? "bg-brand-500 text-control-primary-text-default hover:bg-control-primary-background-hover"
            : "text-text-muted hover:text-text-strong"
        }`}
      >
        @ {mention ? "ligado" : "desligado"}
      </button>
      <button
        type="button"
        onClick={cancelReply}
        aria-label="Cancelar resposta"
        /* 23×23 no telefone, medido — e este × é o único jeito de desistir de
           uma resposta com o dedo (o Esc do teclado externo não conta). O
           glifo continua 16; cresce a área. */
        className="grid h-6 w-6 celular:h-[44px] celular:w-[44px] shrink-0 place-items-center rounded-[3px] text-text-muted transition hover:bg-interactive-background-hover hover:text-text-strong"
      >
        <X size={16} />
      </button>
    </div>
  );
}
