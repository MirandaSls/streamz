"use client";

import { Phone } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { useVoice } from "@/stores/voice";

/**
 * Faixa "há uma chamada rolando aqui", no topo da conversa.
 *
 * Ela é para quem está **fora** da chamada: quem já está dentro tem o palco e
 * os controles, e uma segunda barra de desligar seria um botão vermelho a mais
 * onde já há um. Por isso o componente some quando eu entro.
 *
 * A ordem — caras, depois texto, depois ação — é o que faz a faixa ser lida de
 * relance: são as pessoas que decidem se você entra, não a palavra "chamada".
 */
export default function CallBanner({ channelId }: { channelId: string }) {
  const estados = useVoice((s) => s.statesOf(channelId));
  const conectadoAqui = useVoice((s) => s.channelId === channelId);
  const startCall = useVoice((s) => s.startCall);

  if (conectadoAqui || estados.length === 0) return null;

  const nomes = estados.map((e) => e.user.username);
  const texto =
    nomes.length === 1
      ? `${nomes[0]} está numa chamada`
      : nomes.length === 2
        ? `${nomes[0]} e ${nomes[1]} estão numa chamada`
        : `${nomes[0]} e mais ${nomes.length - 1} estão numa chamada`;
  const excedente = estados.length - 3;

  return (
    <div
      data-call-banner={channelId}
      className="flex shrink-0 items-center gap-3 bg-green/15 px-4 py-2"
    >
      <span className="flex shrink-0 items-center -space-x-2">
        {estados.slice(0, 3).map((e) => (
          <Avatar
            key={e.user.id}
            user={e.user}
            size="sm"
            className="rounded-full ring-2 ring-chat"
          />
        ))}
        {excedente > 0 && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-panel text-[10px] font-bold text-txt-normal ring-2 ring-chat">
            +{excedente}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm font-medium text-txt-normal">{texto}</span>

      <button
        type="button"
        onClick={() => void startCall(channelId, false)}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] bg-green px-3 text-sm font-semibold text-accent-ink transition hover:brightness-110"
      >
        <Phone size={14} aria-hidden="true" />
        Entrar
      </button>
    </div>
  );
}
