"use client";

import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video } from "@/components/ui/icones";
import { CALL_RING_TIMEOUT_MS, displayNameOf, isGroupChannel } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { ringtoneDataUrl } from "@/lib/ringtone";
import { dmTitle, useDMs } from "@/stores/dms";
import { useVoice } from "@/stores/voice";

/**
 * Chamada recebida: um cartão flutuante no canto inferior esquerdo, acima do
 * painel do usuário.
 *
 * **Não é modal.** Uma chamada não pode sequestrar a interface: quem está
 * escrevendo em outro canal continua escrevendo, e decide atender quando
 * decidir. Como consequência, também não existe "dispensar" — Esc e clique fora
 * não recusam nada (recusar é uma resposta, e responder por engano é pior do
 * que deixar tocar). A chamada sai da tela por ação explícita ou pelos 30 s.
 *
 * O toque é um `<audio loop>` com um WAV sintetizado (`lib/ringtone.ts`). O
 * relógio é o mesmo do servidor: ele também desiste, mas o cliente não pode
 * ficar tocando à espera do evento — uma conexão instável deixaria o telefone
 * tocando para sempre.
 *
 * Autoplay: navegadores só deixam tocar som depois de alguma interação do
 * usuário na página. Quando bloqueiam, a chamada continua na tela em silêncio.
 */
export default function IncomingCallModal() {
  const call = useVoice((s) => s.call);
  const accept = useVoice((s) => s.acceptCall);
  const decline = useVoice((s) => s.declineCall);
  const toggleCam = useVoice((s) => s.toggleCam);
  const dispatchCall = useVoice((s) => s.dispatchCall);
  const estados = useVoice((s) => s.statesOf(call.channelId ?? ""));
  const conversas = useDMs((s) => s.channels);
  const audio = useRef<HTMLAudioElement>(null);

  const tocando = call.phase === "incoming";

  useEffect(() => {
    if (!tocando) return;
    const el = audio.current;
    // pode ser bloqueado pelo autoplay: o catch mantém a chamada silenciosa
    void el?.play().catch(() => {});
    const t = window.setTimeout(() => dispatchCall({ type: "timeout" }), CALL_RING_TIMEOUT_MS);
    return () => {
      window.clearTimeout(t);
      el?.pause();
    };
  }, [tocando, dispatchCall]);

  if (!tocando || !call.from) return null;

  const conversa = conversas.find((d) => d.id === call.channelId);
  const nome = displayNameOf(call.from);
  // numa conversa de dois o título é o próprio nome de quem liga: repeti-lo
  // ("fulano chamando em fulano") só faria barulho
  const onde = conversa && isGroupChannel(conversa) ? dmTitle(conversa) : null;
  // o contrato do toque não diz se a chamada é de vídeo; quem diz é o estado de
  // voz de quem ligou — se a câmera dele já está no ar, atender com vídeo faz
  // sentido como opção
  const comVideo = estados.some((e) => e.video);

  async function atender(video: boolean) {
    await accept();
    if (video) await toggleCam();
  }

  return (
    <div
      role="alertdialog"
      aria-label={`Chamada recebida de ${nome}`}
      className="fixed bottom-[76px] left-[84px] z-40 w-[248px] rounded-lg bg-overlay p-3 shadow-high anim-modal"
    >
      <audio ref={audio} src={ringtoneDataUrl()} loop />
      <div className="flex items-center gap-3">
        <Avatar user={call.from} size="lg" surface="border-overlay" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-txt-primary">{nome}</span>
          <span className="block truncate text-xs text-txt-muted">
            {onde ? `Chamada recebida em ${onde}` : "Chamada recebida"}
          </span>
        </span>
      </div>

      {/* o verde vem primeiro: no cartão pequeno a ordem é a hierarquia */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void atender(false)}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[3px] bg-green text-sm font-semibold text-accent-ink transition hover:brightness-110"
        >
          <Phone size={16} aria-hidden="true" />
          Atender
        </button>
        {comVideo && (
          <Tooltip label="Atender com vídeo">
            <button
              type="button"
              onClick={() => void atender(true)}
              aria-label="Atender com vídeo"
              className="grid h-9 w-9 place-items-center rounded-[3px] bg-green/20 text-green transition hover:bg-green/30"
            >
              <Video size={16} />
            </button>
          </Tooltip>
        )}
        <Tooltip label="Recusar">
          <button
            type="button"
            onClick={decline}
            aria-label="Recusar chamada"
            className="grid h-9 w-9 place-items-center rounded-[3px] bg-red text-white transition hover:bg-red-hover"
          >
            <PhoneOff size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
