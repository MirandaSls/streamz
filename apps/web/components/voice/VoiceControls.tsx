"use client";

import {
  Headphones,
  HeadphoneOff,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import { useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";
import ScreenShareButton from "@/components/voice/ScreenShareButton";

/** Botão redondo da barra de controles (o padrão do Discord: 48px). */
function Controle({
  label,
  onClick,
  ligado = false,
  perigo = false,
  children,
}: {
  label: string;
  onClick: () => void;
  /** false pinta de vermelho: é o estado "desligado" (mudo, câmera off). */
  ligado?: boolean;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={!perigo ? ligado : undefined}
        className={`grid h-12 w-12 place-items-center rounded-full transition ${
          perigo
            ? "bg-red text-white hover:bg-red-hover"
            : ligado
              ? "bg-[#4e5058] text-white hover:bg-[#6d6f78]"
              : "bg-red text-white hover:bg-red-hover"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Barra de controles do painel de voz: microfone, áudio, câmera, tela, sair. */
export default function VoiceControls({ onLeave }: { onLeave: () => void }) {
  const muted = useVoicePrefs((s) => s.muted);
  const deafened = useVoicePrefs((s) => s.deafened);
  const toggleMute = useVoicePrefs((s) => s.toggleMute);
  const toggleDeafen = useVoicePrefs((s) => s.toggleDeafen);

  const camOn = useVoice((s) => s.camOn);
  const toggleCam = useVoice((s) => s.toggleCam);
  const telaCheia = useVoice((s) => s.telaCheia);
  const toggleTelaCheia = useVoice((s) => s.toggleTelaCheia);

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-t border-black/20 px-4 py-3">
      <Controle label={muted ? "Ativar microfone" : "Silenciar microfone"} ligado={!muted} onClick={toggleMute}>
        {muted ? <MicOff size={20} /> : <Mic size={20} />}
      </Controle>
      <Controle
        label={deafened ? "Reativar áudio" : "Desativar áudio"}
        ligado={!deafened}
        onClick={toggleDeafen}
      >
        {deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
      </Controle>
      <Controle
        label={camOn ? "Desligar câmera" : "Ligar câmera"}
        ligado={camOn}
        onClick={() => void toggleCam()}
      >
        {camOn ? <Video size={20} /> : <VideoOff size={20} />}
      </Controle>
      <ScreenShareButton />
      <Controle
        label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
        ligado
        onClick={toggleTelaCheia}
      >
        {telaCheia ? <Minimize size={20} /> : <Maximize size={20} />}
      </Controle>
      <Controle label="Desconectar" perigo onClick={onLeave}>
        <PhoneOff size={20} />
      </Controle>
    </div>
  );
}
