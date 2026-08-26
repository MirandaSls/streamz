"use client";

import { HeadphoneOff, MicOff, MonitorUp, Video } from "lucide-react";
import { displayNameOf } from "@newdisc/shared";
import Avatar from "@/components/ui/Avatar";
import { useVoice } from "@/stores/voice";

/**
 * Quem está num canal de voz, listado sob ele na barra lateral.
 *
 * É a leitura do `voice.state` do gateway — o mesmo evento que a barra lateral
 * do agente B consome. Fica num componente próprio para que a `ChannelSidebar`
 * precise apenas montá-lo: a regra de quem aparece (e com quais ícones) mora
 * aqui, junto do resto da voz.
 */
export default function VoiceChannelMembers({ channelId }: { channelId: string }) {
  const estados = useVoice((s) => s.statesOf(channelId));
  if (estados.length === 0) return null;

  return (
    <ul aria-label="Na sala de voz" className="mb-1 ml-6 mr-2 mt-0.5 space-y-0.5">
      {estados.map((e) => (
        <li
          key={e.user.id}
          data-voice-member={e.user.id}
          className="flex h-[26px] items-center gap-1.5 rounded-[4px] px-1 text-sm text-txt-faint hover:bg-hov hover:text-txt-normal"
        >
          <Avatar user={e.user} size="sm" surface="border-panel" />
          <span className={`min-w-0 flex-1 truncate ${e.muted ? "opacity-50" : ""}`}>
            {displayNameOf(e.user)}
          </span>
          {e.screen && <MonitorUp size={14} className="shrink-0 text-green" aria-label="Compartilhando tela" />}
          {e.video && <Video size={14} className="shrink-0 text-green" aria-label="Com câmera" />}
          {e.deafened ? (
            <HeadphoneOff size={14} className="shrink-0 text-red" aria-label="Sem áudio" />
          ) : (
            e.muted && <MicOff size={14} className="shrink-0 text-red" aria-label="Mudo" />
          )}
        </li>
      ))}
    </ul>
  );
}
