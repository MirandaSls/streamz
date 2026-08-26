"use client";

import { useState } from "react";
import {
  Headphones,
  HeadphoneOff,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
} from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import { useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";
import ScreenShareButton from "@/components/voice/ScreenShareButton";
import VoiceSettingsPanel from "@/components/voice/VoiceSettingsPanel";
import Dialog from "@/components/modals/Dialog";

/**
 * Botão redondo da barra de controles (o padrão do Discord: 48px).
 *
 * O tom carrega o significado, e o vermelho é reservado: só microfone/áudio
 * cortados e o desligar. Câmera apagada não é erro — pintá-la de vermelho faria
 * o repouso da barra parecer um problema.
 */
function Controle({
  label,
  onClick,
  tom = "neutro",
  pressionado,
  children,
}: {
  label: string;
  onClick: () => void;
  tom?: "neutro" | "ativo" | "alerta" | "perigo";
  pressionado?: boolean;
  children: React.ReactNode;
}) {
  const cores = {
    neutro: "bg-border-strong text-white hover:bg-border-strong-hover",
    ativo: "bg-green text-accent-ink hover:brightness-110",
    alerta: "bg-red text-white hover:bg-red-hover",
    perigo: "bg-red text-white hover:bg-red-hover",
  }[tom];
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressionado}
        className={`grid h-12 w-12 place-items-center rounded-full transition ${cores}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Barra de controles do painel de voz: microfone, áudio, câmera, tela, sair. */
export default function VoiceControls({ onLeave }: { onLeave: () => void }) {
  const [ajustes, setAjustes] = useState(false);
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
      <Controle
        label={muted ? "Ativar microfone" : "Silenciar microfone"}
        tom={muted ? "alerta" : "neutro"}
        pressionado={muted}
        onClick={toggleMute}
      >
        {muted ? <MicOff size={20} /> : <Mic size={20} />}
      </Controle>
      <Controle
        label={deafened ? "Reativar áudio" : "Desativar áudio"}
        tom={deafened ? "alerta" : "neutro"}
        pressionado={deafened}
        onClick={toggleDeafen}
      >
        {deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
      </Controle>
      <Controle
        label={camOn ? "Desligar câmera" : "Ligar câmera"}
        tom={camOn ? "ativo" : "neutro"}
        pressionado={camOn}
        onClick={() => void toggleCam()}
      >
        {camOn ? <Video size={20} /> : <VideoOff size={20} />}
      </Controle>
      <ScreenShareButton />
      <Controle
        label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
        pressionado={telaCheia}
        onClick={toggleTelaCheia}
      >
        {telaCheia ? <Minimize size={20} /> : <Maximize size={20} />}
      </Controle>
      <Controle label="Ajustes de voz" onClick={() => setAjustes(true)}>
        <Settings size={20} />
      </Controle>
      <Controle label="Desconectar" tom="perigo" onClick={onLeave}>
        <PhoneOff size={20} />
      </Controle>

      {/* o mesmo painel da aba "Voz e vídeo": trocar de microfone no meio da
          call não pode exigir uma volta pelas configurações */}
      {ajustes && (
        <Dialog title="Voz e vídeo" onClose={() => setAjustes(false)} className="w-[420px]">
          <VoiceSettingsPanel />
        </Dialog>
      )}
    </div>
  );
}
