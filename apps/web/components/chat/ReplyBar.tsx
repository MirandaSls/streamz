"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { displayNameOf } from "@newdisc/shared";
import { useMessages } from "@/stores/messages";

/**
 * Barra "Respondendo a X" que aparece colada acima do composer, como no
 * Discord — inclusive o interruptor "@ ligado/desligado", que decide se a
 * resposta menciona (e notifica) o autor da mensagem citada.
 */
export default function ReplyBar({ channelId }: { channelId: string }) {
  const alvo = useMessages((s) => s.replyTarget);
  const mention = useMessages((s) => s.replyMention);
  const cancelReply = useMessages((s) => s.cancelReply);
  const toggleReplyMention = useMessages((s) => s.toggleReplyMention);

  // Esc cancela a resposta mesmo com o foco fora do composer
  useEffect(() => {
    if (!alvo) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") cancelReply();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alvo, cancelReply]);

  if (!alvo || alvo.channelId !== channelId) return null;

  return (
    <div className="mx-4 -mb-2 flex h-[38px] items-center gap-2 rounded-t-lg bg-[#2b2d31] px-4 pb-2 text-sm text-txt-muted">
      <span className="min-w-0 truncate">
        Respondendo a{" "}
        <span className="font-medium text-txt-primary">{displayNameOf(alvo.message.author)}</span>
      </span>
      <button
        type="button"
        onClick={toggleReplyMention}
        aria-pressed={mention}
        className={`ml-auto shrink-0 rounded-[3px] px-1.5 py-0.5 text-xs font-bold uppercase transition ${
          mention
            ? "bg-accent text-white hover:bg-accent-hover"
            : "bg-transparent text-txt-muted hover:text-txt-primary"
        }`}
      >
        @ {mention ? "ligado" : "desligado"}
      </button>
      <button
        type="button"
        onClick={cancelReply}
        aria-label="Cancelar resposta"
        className="shrink-0 text-txt-muted transition hover:text-txt-primary"
      >
        <X size={16} />
      </button>
    </div>
  );
}
