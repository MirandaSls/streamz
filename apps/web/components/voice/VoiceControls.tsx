"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, MoreHorizontal, PhoneOff, Settings, Video, VideoOff } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import ScreenShareButton from "@/components/voice/ScreenShareButton";
import VoiceSettingsPanel from "@/components/voice/VoiceSettingsPanel";
import { useVoice } from "@/stores/voice";

/**
 * Botão redondo da barra de controles (o padrão do Discord: 48px).
 *
 * O tom carrega o significado, e o vermelho é reservado ao desligar. Câmera
 * apagada não é erro — pintá-la de vermelho faria o repouso da barra parecer um
 * problema.
 */
function Controle({
  label,
  onClick,
  tom = "neutro",
  pressionado,
  expandido,
  children,
}: {
  label: string;
  onClick: () => void;
  tom?: "neutro" | "ativo" | "desligar";
  pressionado?: boolean;
  expandido?: boolean;
  children: React.ReactNode;
}) {
  const cores = {
    neutro: "bg-border-strong text-white hover:bg-border-strong-hover",
    ativo: "bg-white text-rail hover:bg-white/90",
    desligar: "bg-red text-white hover:bg-red-hover",
  }[tom];
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressionado}
        aria-expanded={expandido}
        className={`grid h-12 w-12 place-items-center rounded-full transition ${cores}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Barra de controles do palco: câmera, tela, "mais" e desligar.
 *
 * Microfone e áudio **não** estão aqui de propósito: eles moram no painel do
 * usuário, valem fora de qualquer chamada e precisam estar sempre no mesmo
 * lugar — repeti-los no palco criaria dois interruptores para o mesmo estado.
 *
 * O desligar fica separado por uma folga maior que a dos outros: é o único
 * botão irreversível da fileira, e a distância é o que evita o clique errado.
 */
export default function VoiceControls({
  onLeave,
  leaveLabel = "Desconectar",
  oculto = false,
  telaCheia,
  onTelaCheia,
  moldura,
}: {
  onLeave: () => void;
  /** em conversa direta o botão vermelho "desliga", não "desconecta". */
  leaveLabel?: string;
  /** o palco pediu silêncio visual (mouse parado); ver `useOcultarInativo`. */
  oculto?: boolean;
  telaCheia: boolean;
  onTelaCheia: () => void;
  moldura?: { onPointerEnter: () => void; onPointerLeave: () => void };
}) {
  const [mais, setMais] = useState<null | "menu" | "ajustes">(null);
  const caixa = useRef<HTMLDivElement>(null);

  const camOn = useVoice((s) => s.camOn);
  const toggleCam = useVoice((s) => s.toggleCam);

  useEffect(() => {
    if (!mais) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setMais(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMais(null);
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [mais]);

  // com o menu aberto a barra não pode sumir debaixo do cursor
  const escondida = oculto && !mais;

  return (
    <div
      {...moldura}
      className={`absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-overlay/90 p-2 shadow-high backdrop-blur transition-opacity duration-200 ${
        escondida ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <Controle
        label={camOn ? "Desligar câmera" : "Ligar câmera"}
        tom={camOn ? "ativo" : "neutro"}
        pressionado={camOn}
        onClick={() => void toggleCam()}
      >
        {camOn ? <Video size={20} /> : <VideoOff size={20} />}
      </Controle>

      <ScreenShareButton />

      <div ref={caixa} className="relative">
        <Controle
          label="Mais"
          expandido={mais !== null}
          onClick={() => setMais((v) => (v ? null : "menu"))}
        >
          <MoreHorizontal size={20} />
        </Controle>

        {mais === "menu" && (
          <div
            role="menu"
            aria-label="Mais opções"
            className="absolute bottom-14 left-1/2 w-56 -translate-x-1/2 rounded-lg bg-overlay p-1.5 shadow-high anim-menu"
          >
            <ItemDoMenu
              onSelect={() => {
                setMais(null);
                onTelaCheia();
              }}
              icone={telaCheia ? <Minimize size={18} /> : <Maximize size={18} />}
            >
              {telaCheia ? "Sair da tela cheia" : "Tela cheia"}
            </ItemDoMenu>
            <ItemDoMenu onSelect={() => setMais("ajustes")} icone={<Settings size={18} />}>
              Ajustes de voz
            </ItemDoMenu>
          </div>
        )}

        {mais === "ajustes" && (
          // popover, não modal: escurecer o palco para trocar de microfone
          // esconderia justamente a call que se está tentando consertar
          <div
            role="dialog"
            aria-label="Ajustes de voz"
            className="absolute bottom-14 left-1/2 max-h-[60vh] w-[380px] -translate-x-1/2 overflow-y-auto rounded-lg bg-overlay p-4 shadow-high anim-menu"
          >
            <VoiceSettingsPanel compacto />
          </div>
        )}
      </div>

      {/* a folga maior é o que separa "ajustar a call" de "sair dela" */}
      <span aria-hidden="true" className="w-4" />

      <Controle label={leaveLabel} tom="desligar" onClick={onLeave}>
        <PhoneOff size={20} />
      </Controle>
    </div>
  );
}

function ItemDoMenu({
  children,
  icone,
  onSelect,
}: {
  children: React.ReactNode;
  icone: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm text-txt-normal transition hover:bg-accent hover:text-accent-ink"
    >
      {icone}
      {children}
    </button>
  );
}
