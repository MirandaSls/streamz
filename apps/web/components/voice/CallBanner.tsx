"use client";

import { Phone, PhoneOff, Video } from "lucide-react";
import { displayNameOf } from "@newdisc/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useVoice } from "@/stores/voice";

/**
 * Barra "Chamada em andamento" no topo de uma conversa.
 *
 * Aparece sempre que **alguém** está na chamada daquele canal, não só quando eu
 * estou: é assim que quem chegou depois descobre que a conversa tem uma call
 * rolando e consegue entrar sem que ninguém precise ligar de novo.
 */
export default function CallBanner({ channelId }: { channelId: string }) {
  const estados = useVoice((s) => s.statesOf(channelId));
  const conectadoAqui = useVoice((s) => s.channelId === channelId);
  const startCall = useVoice((s) => s.startCall);
  const endCall = useVoice((s) => s.endCall);

  if (estados.length === 0) return null;

  return (
    <div
      role="status"
      data-call-banner={channelId}
      className="flex shrink-0 items-center gap-3 border-b border-black/20 bg-panel px-4 py-2"
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-green">
        <Phone size={16} aria-hidden="true" />
        Chamada em andamento
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-1">
        {estados.slice(0, 8).map((e) => (
          <Tooltip key={e.user.id} label={displayNameOf(e.user)}>
            <span>
              <Avatar user={e.user} size="sm" surface="border-panel" />
            </span>
          </Tooltip>
        ))}
        {estados.length > 8 && (
          <span className="text-xs text-txt-muted">+{estados.length - 8}</span>
        )}
      </span>

      {conectadoAqui ? (
        <button
          type="button"
          onClick={() => void endCall()}
          className="flex h-8 items-center gap-1.5 rounded-[3px] bg-red px-3 text-sm font-medium text-white transition hover:bg-red-hover"
        >
          <PhoneOff size={16} aria-hidden="true" />
          Desligar
        </button>
      ) : (
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => void startCall(channelId, false)}
            className="flex h-8 items-center gap-1.5 rounded-[3px] bg-green px-3 text-sm font-medium text-white transition hover:brightness-110"
          >
            <Phone size={16} aria-hidden="true" />
            Entrar
          </button>
          <button
            type="button"
            onClick={() => void startCall(channelId, true)}
            aria-label="Entrar com vídeo"
            className="grid h-8 w-8 place-items-center rounded-[3px] bg-[#4e5058] text-white transition hover:bg-[#6d6f78]"
          >
            <Video size={16} />
          </button>
        </span>
      )}
    </div>
  );
}
