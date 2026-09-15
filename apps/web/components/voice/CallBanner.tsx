"use client";

import { useState } from "react";
import { Phone } from "@/components/ui/icones";
import Avatar from "@/components/ui/Avatar";
import { Button } from "@/components/ui/primitivos";
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
  // `startCall` negocia o token de voz antes de ligar — não é instantâneo como
  // atender (que já muda de fase antes da rede responder). Sem isto o botão
  // ficava mudo entre o clique e a sala abrir, e um clique duplo emitia dois
  // pedidos de entrada. `startCall` já mostra erro por toast (mesmo caminho de
  // quem entra por um canal de voz) — aqui só falta não travar o botão se a
  // tentativa falhar.
  const [entrando, setEntrando] = useState(false);

  if (conectadoAqui || estados.length === 0) return null;

  async function entrar() {
    setEntrando(true);
    try {
      await startCall(channelId, false);
    } finally {
      setEntrando(false);
    }
  }

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
      className="flex shrink-0 items-center gap-3 bg-status-positive/15 px-4 py-2"
    >
      <span className="flex shrink-0 items-center -space-x-2">
        {estados.slice(0, 3).map((e) => (
          <Avatar
            key={e.user.id}
            user={e.user}
            size="sm"
            className="rounded-full ring-2 ring-background-base-lower"
          />
        ))}
        {excedente > 0 && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-background-base-lowest text-[10px] font-bold text-text-default ring-2 ring-background-base-lower">
            +{excedente}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-default">{texto}</span>

      <Button
        variante="positivo"
        tamanho="sm"
        icone={<Phone size={14} aria-hidden="true" />}
        onClick={() => void entrar()}
        carregando={entrando}
        className="shrink-0"
      >
        Entrar
      </Button>
    </div>
  );
}
