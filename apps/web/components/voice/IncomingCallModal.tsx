"use client";

import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video } from "@/components/ui/icones";
import { CALL_RING_TIMEOUT_MS, displayNameOf, isGroupChannel } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { ALVO_MINIMO } from "@/components/voice/palco-mobile";
import { useEhMobile } from "@/hooks/useEhMobile";
import { pararToque, prepararToque, tocarToque, toqueDeChamadaUrl } from "@/lib/ringtone";
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
 * O toque é um `<audio loop>` com o som de chamada do Discord (`lib/ringtone.ts`). O
 * relógio é o mesmo do servidor: ele também desiste, mas o cliente não pode
 * ficar tocando à espera do evento — uma conexão instável deixaria o telefone
 * tocando para sempre.
 *
 * Autoplay: navegadores só deixam tocar som depois de alguma interação do
 * usuário na página, e este é o som que mais precisa começar sem gesto nenhum
 * — o telefone toca com o app parado na bandeja. No desktop a flag do WebView2
 * resolve na raiz; aqui, se ainda assim `play()` for recusado, `tocarToque`
 * fica à espera do primeiro clique ou tecla e começa ali (`toque-com-gesto.ts`).
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
  const ehMobile = useEhMobile();
  // já estou numa sala de voz: no celular a barra "Voz conectada" ocupa 48px
  // logo acima da barra de abas, e o cartão tem de sentar em cima das duas
  const emOutraSala = useVoice((s) => !!s.channelId);

  const tocando = call.phase === "incoming";

  useEffect(() => {
    if (!tocando) return;
    const el = audio.current;
    if (prepararToque(el)) tocarToque(el);
    const t = window.setTimeout(() => dispatchCall({ type: "timeout" }), CALL_RING_TIMEOUT_MS);
    return () => {
      window.clearTimeout(t);
      pararToque(el);
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
      // **As duas medidas do ramo de desktop são do cromo do desktop**: 84 é a
      // largura do rail de servidores e 76 a altura do painel do usuário, que
      // no celular não existem. Num iPhone de 390 o cartão nascia colado à
      // direita (84 + 248 = 332 de 390) e caía **sobre a barra de abas**, que
      // mede 48 mais a área segura — o "Recusar" ficava debaixo do dedo que ia
      // trocar de aba. Aqui ele atravessa a largura, com 12 de margem, e senta
      // acima da barra: 48 dela + 8 de folga.
      style={
        ehMobile
          ? {
              // 48 da barra de abas + 8 de folga, mais os 48 da barra
              // "Voz conectada" quando ela está na tela
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${emOutraSala ? 104 : 56}px)`,
            }
          : undefined
      }
      className={`fixed z-40 rounded-lg bg-overlay p-3 shadow-high anim-modal ${
        ehMobile ? "inset-x-3" : "bottom-[76px] left-[84px] w-[248px]"
      }`}
    >
      <audio ref={audio} src={toqueDeChamadaUrl()} preload="auto" loop />
      <div className="flex items-center gap-3">
        <Avatar user={call.from} size="lg" surface="border-overlay" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-txt-primary">{nome}</span>
          <span className="block truncate text-xs text-txt-muted">
            {onde ? `Chamada recebida em ${onde}` : "Chamada recebida"}
          </span>
        </span>
      </div>

      {/* o verde vem primeiro: no cartão pequeno a ordem é a hierarquia.
          Os 36px de `h-9` são de mouse; no telefone atender e recusar são os
          dois botões mais caros de errar do app inteiro, e vão para os 44 de
          `ALVO_MINIMO` — em px, porque `h-11` desenharia 42,6 com a raiz de
          15,5 (ver `palco-mobile.ts`). */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void atender(false)}
          style={ehMobile ? { height: ALVO_MINIMO } : undefined}
          className={`flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-green text-sm font-semibold text-accent-ink transition hover:brightness-110 ${
            ehMobile ? "" : "h-9"
          }`}
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
              style={ehMobile ? { height: ALVO_MINIMO, width: ALVO_MINIMO } : undefined}
              className={`grid place-items-center rounded-[3px] bg-green/20 text-green transition hover:bg-green/30 ${
                ehMobile ? "" : "h-9 w-9"
              }`}
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
            style={ehMobile ? { height: ALVO_MINIMO, width: ALVO_MINIMO } : undefined}
            className={`grid place-items-center rounded-[3px] bg-red text-white transition hover:bg-red-hover ${
              ehMobile ? "" : "h-9 w-9"
            }`}
          >
            <PhoneOff size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
