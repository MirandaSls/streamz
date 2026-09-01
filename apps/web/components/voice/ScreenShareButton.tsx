"use client";

import { useState } from "react";
import { MonitorUp, MonitorX, Radio } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import ScreenSharePicker from "@/components/voice/ScreenSharePicker";
import { BotaoDeChamada } from "@/components/voice/controles-de-chamada";
import { useVoice } from "@/stores/voice";

/**
 * Compartilhar tela: abre o seletor próprio (ver `ScreenSharePicker`) e, no ar,
 * vira o botão de parar.
 *
 * A qualidade não fica mais num popover antes do clique — ela mora dentro do
 * seletor, junto da prévia, que é onde a escolha faz sentido: dá para ver o que
 * 1080p60 muda naquilo que você está prestes a transmitir.
 *
 * No ar o botão fica **verde**, não vermelho. Vermelho cheio na barra é o
 * desligar, e só ele: transmitindo, o botão está *ligado*, não em erro — quem
 * lê a fileira de longe precisa achar um vermelho só, o que encerra a chamada.
 */
export default function ScreenShareButton({
  variante = "barra",
}: {
  /** `largo` é o botão de largura total da barra "Voz conectada". */
  variante?: "barra" | "largo";
}) {
  const [seletor, setSeletor] = useState(false);
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);

  const label = screenOn ? "Parar transmissão" : "Compartilhar tela";
  const acionar = () => (screenOn ? void pararTela() : setSeletor(true));

  return (
    <>
      {variante === "largo" ? (
        // Só ícone, como no painel do Discord: o rótulo comia mais da metade da
        // largura do botão e ainda precisava ser abreviado ("Tela") para caber
        // numa coluna de 240px. O nome inteiro vive no tooltip.
        <Tooltip label={label} className="min-w-0 flex-1">
          <button
            type="button"
            onClick={acionar}
            aria-label={label}
            aria-pressed={screenOn}
            className={`grid h-8 w-full place-items-center rounded-[4px] transition ${
              screenOn
                ? "bg-green/20 text-green hover:bg-green/30"
                : "bg-border-strong/60 text-txt-secondary hover:bg-border-strong hover:text-txt-primary"
            }`}
          >
            {screenOn ? <MonitorX size={16} /> : <MonitorUp size={16} />}
          </button>
        </Tooltip>
      ) : (
        <BotaoDeChamada
          label={label}
          onClick={acionar}
          tom={screenOn ? "aoVivo" : "neutro"}
          pressionado={screenOn}
        >
          {screenOn ? <MonitorX size={20} /> : <MonitorUp size={20} />}
        </BotaoDeChamada>
      )}

      {seletor && <ScreenSharePicker onClose={() => setSeletor(false)} />}
    </>
  );
}

/**
 * Selo "Você está ao vivo" — o lembrete que impede alguém de continuar
 * transmitindo sem perceber. Fica no palco, não no botão: o botão pode estar
 * fora da tela, e o palco não.
 */
export function AoVivoIndicador() {
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);
  if (!screenOn) return null;

  // `w-max` + `nowrap`: o mesmo selo é usado no cabeçalho do palco e no do
  // painel de canal, contêineres de larguras bem diferentes. Sem isto ele se
  // deixava espremer, quebrava "Você está ao vivo" uma palavra por linha e o
  // botão subia por cima do texto.
  return (
    <div className="flex w-max items-center gap-2 rounded-full bg-red/15 py-1 pl-3 pr-1 text-xs font-semibold text-red">
      <Radio size={14} className="shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">Você está ao vivo</span>
      <button
        type="button"
        onClick={() => void pararTela()}
        className="shrink-0 whitespace-nowrap rounded-full bg-red px-2 py-1 text-[11px] font-bold text-white transition hover:bg-red-hover"
      >
        Parar transmissão
      </button>
    </div>
  );
}
