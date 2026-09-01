"use client";

import { useEffect, useRef, useState } from "react";
import {
  Maximize,
  Mic,
  MicOff,
  Minimize,
  MoreHorizontal,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
} from "lucide-react";
import ScreenShareButton from "@/components/voice/ScreenShareButton";
import VoiceSettingsPanel from "@/components/voice/VoiceSettingsPanel";
import {
  BotaoDeChamada,
  BotaoDeDesligar,
  Capsula,
  SplitDeDispositivo,
} from "@/components/voice/controles-de-chamada";
import { ListaDeCameras, ListaDeMicrofones } from "@/components/voice/listas-de-dispositivos";
import { useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Barra de controles do palco, em três cápsulas: o que sai de mim (microfone e
 * câmera, cada um com a seta de trocar dispositivo), o que eu acrescento à sala
 * (tela, supressão de ruído, mais) e o desligar, sozinho do lado de fora.
 *
 * **O microfone voltou para cá.** Ele morava só no painel do usuário, com o
 * argumento de que vale fora de qualquer chamada e repeti-lo criaria dois
 * interruptores para o mesmo estado. O argumento continua verdadeiro e ainda
 * assim está errado: são dois botões para **um** estado (o `voicePrefs` é o
 * mesmo), e durante uma chamada a mão está na barra, não no rodapé a 500px dali.
 * É onde o Discord põe, e procurar o mudo em outro canto é a diferença que se
 * sente mais rápido numa call.
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
  const muted = useVoicePrefs((s) => s.muted);
  const toggleMute = useVoicePrefs((s) => s.toggleMute);

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
      className={`absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 transition-opacity duration-200 ${
        escondida ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <Capsula>
        <SplitDeDispositivo
          label={muted ? "Desativar mudo" : "Silenciar"}
          labelDaSeta="Escolher microfone"
          tom={muted ? "mudo" : "neutro"}
          pressionado={muted}
          onClick={toggleMute}
          menu={() => <ListaDeMicrofones />}
        >
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </SplitDeDispositivo>

        <SplitDeDispositivo
          label={camOn ? "Desligar câmera" : "Ligar câmera"}
          labelDaSeta="Escolher câmera"
          tom={camOn ? "ativo" : "neutro"}
          pressionado={camOn}
          onClick={() => void toggleCam()}
          menu={() => <ListaDeCameras camLigada={camOn} />}
        >
          {camOn ? <Video size={20} /> : <VideoOff size={20} />}
        </SplitDeDispositivo>
      </Capsula>

      <Capsula>
        <ScreenShareButton />

        {/* A supressão de ruído **não** mora aqui: no Discord ela é o ícone de
            ondas do painel "Voz conectada", ao lado do desligar (ver
            `VoiceConnectedBar`). Ali ela fica ao alcance mesmo com o palco fora
            da tela, que é quando mais se mexe nela. */}

        <div ref={caixa} className="relative">
          <BotaoDeChamada
            label="Mais"
            expandido={mais !== null}
            onClick={() => setMais((v) => (v ? null : "menu"))}
          >
            <MoreHorizontal size={20} />
          </BotaoDeChamada>

          {mais === "menu" && (
            <div
              role="menu"
              aria-label="Mais opções"
              className="absolute bottom-12 left-1/2 w-56 -translate-x-1/2 rounded-lg bg-overlay p-1.5 shadow-high anim-menu"
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
              className="absolute bottom-12 left-1/2 max-h-[60vh] w-[380px] -translate-x-1/2 overflow-y-auto rounded-lg bg-overlay p-4 shadow-high anim-menu"
            >
              <VoiceSettingsPanel compacto />
            </div>
          )}
        </div>
      </Capsula>

      <BotaoDeDesligar label={leaveLabel} onClick={onLeave}>
        <PhoneOff size={22} />
      </BotaoDeDesligar>
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
