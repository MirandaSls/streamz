"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Camera,
  Check,
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
import { explicarMidia, useVoiceDevices } from "@/stores/voiceDevices";
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
  const processamento = useVoice((s) => s.audio.processamento);
  const setAudioPref = useVoice((s) => s.setAudioPref);
  const ruidoAvancado = processamento.ruido === "avancada";
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

        {/* O botão alterna entre a supressão avançada e a **padrão**, nunca para
            "desligada": um clique de barra que remove toda a redução de ruído sem
            dizer nada é armadilha. Desligar de vez é escolha consciente, e mora
            nas configurações. Trocar aqui republica o microfone na hora (ver
            `setAudioPref`), então o efeito é imediato no meio da conversa. */}
        <BotaoDeChamada
          label={
            ruidoAvancado ? "Supressão de ruído avançada (ligada)" : "Supressão de ruído avançada"
          }
          tom={ruidoAvancado ? "ativo" : "neutro"}
          pressionado={ruidoAvancado}
          onClick={() =>
            setAudioPref({
              processamento: { ...processamento, ruido: ruidoAvancado ? "padrao" : "avancada" },
            })
          }
        >
          <AudioLines size={20} />
        </BotaoDeChamada>

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

/**
 * A lista de microfones da seta.
 *
 * Só entra na árvore com o menu aberto: `useVoiceDevices` pede permissão de
 * mídia para conseguir os **rótulos** dos dispositivos, e fazer isso na
 * montagem da barra faria o navegador perguntar sozinho no meio da chamada.
 */
function ListaDeMicrofones() {
  const devices = useVoiceDevices();
  return (
    <ListaDeFontes
      titulo="Microfone"
      icone={<Mic size={16} />}
      opcoes={devices.inputs}
      atual={devices.inputId}
      onEscolher={devices.setInput}
      aviso={explicarMidia(devices.motivo)}
    />
  );
}

function ListaDeCameras({ camLigada }: { camLigada: boolean }) {
  const devices = useVoiceDevices();
  return (
    <ListaDeFontes
      titulo="Câmera"
      icone={<Camera size={16} />}
      opcoes={devices.cameras}
      atual={devices.cameraId}
      onEscolher={devices.setCamera}
      aviso={
        explicarMidia(devices.motivo) ??
        // republicar vídeo no meio de uma frase pisca a imagem para todo mundo,
        // então a troca espera o próximo `setCameraEnabled` (ver `stores/voice`)
        (camLigada ? "A troca vale na próxima vez que você ligar a câmera." : null)
      }
    />
  );
}

/** Menu de escolha de dispositivo, com "padrão do sistema" sempre no topo. */
function ListaDeFontes({
  titulo,
  icone,
  opcoes,
  atual,
  onEscolher,
  aviso,
}: {
  titulo: string;
  icone: React.ReactNode;
  opcoes: MediaDeviceInfo[];
  atual: string | null;
  onEscolher: (id: string | null) => void;
  aviso: string | null;
}) {
  return (
    <>
      <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {icone}
        {titulo}
      </p>
      <Opcao rotulo="Padrão do sistema" escolhida={atual === null} onSelect={() => onEscolher(null)} />
      {opcoes.map((d, i) => (
        <Opcao
          key={d.deviceId}
          // sem permissão o `label` vem vazio: numerar é melhor que uma linha em branco
          rotulo={d.label || `${titulo} ${i + 1}`}
          escolhida={atual === d.deviceId}
          onSelect={() => onEscolher(d.deviceId)}
        />
      ))}
      {aviso && <p className="px-2 pb-1 pt-2 text-xs text-txt-muted">{aviso}</p>}
    </>
  );
}

function Opcao({
  rotulo,
  escolhida,
  onSelect,
}: {
  rotulo: string;
  escolhida: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={escolhida}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm text-txt-normal transition hover:bg-accent hover:text-accent-ink"
    >
      <span className="w-4 shrink-0">{escolhida && <Check size={16} />}</span>
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
    </button>
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
