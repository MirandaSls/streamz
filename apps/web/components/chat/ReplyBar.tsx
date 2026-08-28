"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
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
    <div className="mx-4 -mb-2 flex h-12 items-center gap-2 rounded-t-lg bg-panel px-4 pb-2 text-xs text-txt-muted">
      <span className="min-w-0 truncate">
        Respondendo a{" "}
        <span style={cor ? { color: cor } : undefined} className="font-medium text-txt-primary">
          {displayNameOf(alvo.message.author)}
        </span>
      </span>
      <button
        type="button"
        onClick={toggleReplyMention}
        aria-pressed={mention}
        className={`ml-auto grid h-5 shrink-0 place-items-center rounded-[3px] px-1.5 text-[11px] font-bold uppercase leading-none transition ${
          mention
            ? "bg-accent text-accent-ink hover:bg-accent-hover"
            : "text-txt-muted hover:text-txt-primary"
        }`}
      >
        @ {mention ? "ligado" : "desligado"}
      </button>
      <button
        type="button"
        onClick={cancelReply}
        aria-label="Cancelar resposta"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-txt-muted transition hover:bg-hov hover:text-txt-primary"
      >
        <X size={16} />
      </button>
    </div>
  );
}
