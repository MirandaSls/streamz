"use client";

import { useEffect, useRef } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { CALL_RING_TIMEOUT_MS, displayNameOf, isGroupChannel } from "@newdisc/shared";
import Dialog from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { ringtoneDataUrl } from "@/lib/ringtone";
import { dmTitle, useDMs } from "@/stores/dms";
import { useVoice } from "@/stores/voice";

/**
 * Tela de chamada recebida: quem está ligando, aceitar e recusar.
 *
 * O toque é um `<audio loop>` com um WAV sintetizado (`lib/ringtone.ts`) e para
 * sozinho junto com a chamada. O relógio de 30 s é o mesmo do servidor: ele
 * também desiste, mas o cliente não pode ficar tocando à espera do evento —
 * uma conexão instável deixaria o telefone tocando para sempre.
 *
 * Autoplay: navegadores só deixam tocar som depois de alguma interação do
 * usuário na página. Quando bloqueiam, a chamada continua na tela em silêncio —
 * o modal é o aviso que importa.
 */
export default function IncomingCallModal() {
  const call = useVoice((s) => s.call);
  const accept = useVoice((s) => s.acceptCall);
  const decline = useVoice((s) => s.declineCall);
  const dispatchCall = useVoice((s) => s.dispatchCall);
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
  const onde = conversa && isGroupChannel(conversa) ? `em ${dmTitle(conversa)}` : "por voz";

  return (
    <Dialog title="Chamada recebida" onClose={decline} className="w-[360px]">
      <audio ref={audio} src={ringtoneDataUrl()} loop />
      <div className="flex flex-col items-center gap-3 py-2">
        <Avatar user={call.from} size="xl" surface="border-chat" />
        <p className="text-lg font-semibold text-txt-primary">{nome}</p>
        <p className="text-sm text-txt-muted">Chamando {onde}…</p>
      </div>
      <div className="flex justify-center gap-6 pt-2">
        <button
          type="button"
          onClick={decline}
          aria-label="Recusar chamada"
          className="grid h-14 w-14 place-items-center rounded-full bg-red text-white transition hover:bg-red-hover"
        >
          <PhoneOff size={22} />
        </button>
        <button
          type="button"
          data-autofocus
          onClick={() => void accept()}
          aria-label="Atender chamada"
          className="grid h-14 w-14 place-items-center rounded-full bg-green text-white transition hover:brightness-110"
        >
          <Phone size={22} />
        </button>
      </div>
    </Dialog>
  );
}
