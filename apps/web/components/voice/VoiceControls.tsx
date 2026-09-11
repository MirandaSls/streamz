"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, MoreHorizontal, PhoneOff, Settings, Video, VideoOff } from "@/components/ui/icones";
import BotaoDeSons from "@/components/voice/BotaoDeSons";
import ControlesMobile from "@/components/voice/ControlesMobile";
import ScreenShareButton from "@/components/voice/ScreenShareButton";
import VoiceSettingsPanel from "@/components/voice/VoiceSettingsPanel";
import {
  BotaoDeChamada,
  BotaoDeDesligar,
  Capsula,
  SplitDeDispositivo,
} from "@/components/voice/controles-de-chamada";
import { ListaDeCameras } from "@/components/voice/listas-de-dispositivos";
import { MenuDeEntrada } from "@/components/voice/menus-de-audio";
import { microfoneAbrindo } from "@/components/voice/estado-do-microfone";
import { useEhMobile } from "@/hooks/useEhMobile";
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
  moldura,
}: {
  onLeave: () => void;
  /** em conversa direta o botão vermelho "desliga", não "desconecta". */
  leaveLabel?: string;
  /** o palco pediu silêncio visual (mouse parado); ver `useOcultarInativo`. */
  oculto?: boolean;
  moldura?: { onPointerEnter: () => void; onPointerLeave: () => void };
}) {
  const [mais, setMais] = useState<null | "menu" | "ajustes">(null);
  const caixa = useRef<HTMLDivElement>(null);
  const ehMobile = useEhMobile();

  const camOn = useVoice((s) => s.camOn);
  const toggleCam = useVoice((s) => s.toggleCam);
  const muted = useVoicePrefs((s) => s.muted);
  const toggleMute = useVoicePrefs((s) => s.toggleMute);
  // a faixa ainda não subiu: a sala já me ouviria, mas não há o que ouvir.
  // Desde o #144 a entrada não espera pelo microfone, e este é o intervalo em
  // que a pessoa já está na call e ainda não pode falar
  const abrindoMicrofone = useVoice(microfoneAbrindo);

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

  // No celular a fileira é outra: cápsula única de 68pt com seis botões
  // redondos, medida em `docs/Reference/mobile/MEDIDAS.md` §12. As cápsulas
  // agrupadas, as setinhas de dispositivo e o menu "…" não sobrevivem a 390pt
  // — a seta de escolher microfone tem 26px de largura, metade de um alvo de
  // toque. Ver `ControlesMobile`.
  if (ehMobile) return <ControlesMobile onLeave={onLeave} leaveLabel={leaveLabel} oculto={oculto} />;

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
        {/* Enquanto a faixa sobe o botão mostra o **mudo**, e o rótulo diz por
            quê. Mostrar o microfone aberto antes de ele existir seria a mentira
            pior: a pessoa fala e ninguém ouve. O clique continua valendo — o
            dono da faixa reaplica o mudo escolhido assim que ela nasce (ver
            `publicarMicrofone`). Sem cor nova: é o mesmo tom "mudo" de sempre. */}
        <SplitDeDispositivo
          label={
            abrindoMicrofone
              ? "Ativando microfone…"
              : muted
                ? "Desativar mudo"
                : "Silenciar"
          }
          labelDaSeta="Escolher microfone"
          tom={muted || abrindoMicrofone ? "mudo" : "neutro"}
          pressionado={muted}
          onClick={toggleMute}
          menu={() => <MenuDeEntrada />}
        >
          {muted || abrindoMicrofone ? <MicOff size={22} /> : <Mic size={22} />}
        </SplitDeDispositivo>

        <SplitDeDispositivo
          label={camOn ? "Desligar câmera" : "Ligar câmera"}
          labelDaSeta="Escolher câmera"
          tom={camOn ? "ativo" : "neutro"}
          pressionado={camOn}
          onClick={() => void toggleCam()}
          menu={() => <ListaDeCameras camLigada={camOn} />}
        >
          {camOn ? <Video size={22} /> : <VideoOff size={22} />}
        </SplitDeDispositivo>
      </Capsula>

      <Capsula>
        <ScreenShareButton />

        {/* Efeitos sonoros ao lado da tela: os dois são "o que eu acrescento à
            sala", que é o critério desta cápsula. Na barra do palco o botão do
            painel de sons é o segundo, como no Discord. */}
        <BotaoDeSons />

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
            <MoreHorizontal size={22} />
          </BotaoDeChamada>

          {/* `bottom-[52px]` é a altura do botão (44) mais os 8 de folga que a
              caixa sempre teve; era `bottom-12` quando o botão media 40. */}
          {mais === "menu" && (
            <div
              role="menu"
              aria-label="Mais opções"
              className="absolute bottom-[52px] left-1/2 w-56 -translate-x-1/2 rounded-lg bg-background-surface-higher p-1.5 shadow-popout anim-menu"
            >
              {/* tela cheia saiu daqui: no print ela é ícone solto no canto do
                  palco, junto do pop-out — ver `IconesDoCanto` */}
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
              className="absolute bottom-[52px] left-1/2 max-h-[60vh] w-[380px] -translate-x-1/2 overflow-y-auto rounded-lg bg-background-surface-higher p-4 shadow-popout anim-menu"
            >
              <VoiceSettingsPanel compacto />
            </div>
          )}
        </div>
      </Capsula>

      <BotaoDeDesligar label={leaveLabel} onClick={onLeave}>
        <PhoneOff size={24} />
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
      className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm text-text-default transition hover:bg-brand-500 hover:text-control-primary-text-default"
    >
      {icone}
      {children}
    </button>
  );
}
