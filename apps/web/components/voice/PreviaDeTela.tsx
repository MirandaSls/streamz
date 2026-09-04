"use client";

import { useEffect, useState } from "react";
import { Play } from "@/components/ui/icones";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import { VideoDaFaixa } from "@/components/voice/VoiceGrid";
import { telaPublicadaDe, useVoice } from "@/stores/voice";

/**
 * A miniatura **ao vivo** de quem está transmitindo, no hover da lista do canal.
 *
 * O ganho é decidir sem entrar: pelo nome não dá para saber se a pessoa está
 * jogando, mostrando um documento ou esqueceu a tela ligada. O Discord resolve
 * isso com este mesmo pop-up.
 *
 * O que ele **não** faz é baixar a transmissão de todo mundo o tempo todo: a
 * faixa é assinada em baixa qualidade só enquanto o pop-up está aberto
 * (`abrirPrevia` na store → `aplicarAssinaturasDeTela`), e desassinada ao
 * fechar. Sem isso, passar o mouse pela lista puxaria vídeo em alta de cada
 * pessoa por onde o cursor passasse.
 *
 * Tamanho não medido: não há print do Discord com este pop-up. 240×135 é o
 * 16:9 que cabe ao lado da coluna de canais sem tapar a conversa.
 */

/** Largura da miniatura; a altura vem do 16:9. */
const LARGURA = 240;
const ALTURA = Math.round((LARGURA * 9) / 16);
/** Folga entre a linha do canal e o cartão. */
const FOLGA = 8;

export interface AlvoDaPrevia {
  user: PublicUser;
  /** retângulo da linha, para ancorar o cartão ao lado dela. */
  rect: { top: number; bottom: number; right: number };
}

export default function PreviaDeTela({
  alvo,
  onFechar,
  onManter,
  onAssistir,
}: {
  alvo: AlvoDaPrevia;
  onFechar: () => void;
  /** o cursor entrou no cartão: cancela o fechamento agendado pela linha. */
  onManter: () => void;
  onAssistir: () => void;
}) {
  const { user, rect } = alvo;
  const abrirPrevia = useVoice((s) => s.abrirPrevia);
  // o `tick` é o que avisa que a faixa chegou: assinar é assíncrono, e sem
  // isto o cartão ficaria no "conectando…" até alguém mexer em outra coisa
  useVoice((s) => s.tick);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    abrirPrevia(user.id);
    setMontado(true);
    return () => abrirPrevia(null);
  }, [user.id, abrirPrevia]);

  const publicacao = montado ? telaPublicadaDe(user.id) : null;
  const nome = displayNameOf(user);

  // preso à janela: numa lista longa a linha pode estar embaixo, e o cartão
  // sairia da tela pelo rodapé
  const topo =
    typeof window === "undefined"
      ? rect.top
      : Math.min(
          Math.max(8, (rect.top + rect.bottom) / 2 - (ALTURA + 44) / 2),
          window.innerHeight - (ALTURA + 52),
        );

  return (
    <div
      role="dialog"
      aria-label={`Transmissão de ${nome}`}
      onPointerEnter={onManter}
      onPointerLeave={onFechar}
      style={{ left: rect.right + FOLGA, top: topo, width: LARGURA }}
      className="fixed z-50 overflow-hidden rounded-lg bg-overlay shadow-high anim-menu"
    >
      <div style={{ height: ALTURA }} className="relative w-full bg-black">
        {publicacao?.track ? (
          <VideoDaFaixa publication={publicacao} ajuste="object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-xs text-txt-muted">
            Carregando a transmissão…
          </span>
        )}
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-[4px] bg-red px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.02em] text-white">
          Ao vivo
        </span>
      </div>

      <div className="flex items-center gap-2 p-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt-primary">
          {nome}
        </span>
        <button
          type="button"
          onClick={onAssistir}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-[13px] font-semibold text-accent-ink transition hover:bg-accent-hover"
        >
          <Play size={14} aria-hidden="true" />
          Assistir
        </button>
      </div>
    </div>
  );
}
