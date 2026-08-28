"use client";

import { useState } from "react";
import { MonitorUp, MonitorX, Radio } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import ScreenSharePicker from "@/components/voice/ScreenSharePicker";
import { useVoice } from "@/stores/voice";

/**
 * Compartilhar tela: abre o seletor próprio (ver `ScreenSharePicker`) e, no ar,
 * vira o botão de parar.
 *
 * A qualidade não fica mais num popover antes do clique — ela mora dentro do
 * seletor, junto da prévia, que é onde a escolha faz sentido: dá para ver o que
 * 1080p60 muda naquilo que você está prestes a transmitir.
 */
export default function ScreenShareButton({
  variante = "redondo",
}: {
  /** `largo` é o botão de largura total da barra "Voz conectada". */
  variante?: "redondo" | "largo";
}) {
  const [seletor, setSeletor] = useState(false);
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);

  const label = screenOn ? "Parar transmissão" : "Compartilhar tela";
  const acionar = () => (screenOn ? void pararTela() : setSeletor(true));

  return (
    <>
      {variante === "largo" ? (
        // "Compartilhar tela" não cabe na metade de uma coluna de 240px e
        // truncava com reticências, desalinhando do botão de vídeo ao lado. O
        // rótulo curto cabe inteiro; o nome completo vive no tooltip.
        <Tooltip label={label} className="min-w-0 flex-1">
          <button
            type="button"
            onClick={acionar}
            aria-label={label}
            aria-pressed={screenOn}
            className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-[4px] text-xs font-semibold transition ${
              screenOn
                ? "bg-red/20 text-red hover:bg-red/30"
                : "bg-border-strong/60 text-txt-secondary hover:bg-border-strong hover:text-txt-primary"
            }`}
          >
            {screenOn ? <MonitorX size={16} /> : <MonitorUp size={16} />}
            {screenOn ? "Parar" : "Tela"}
          </button>
        </Tooltip>
      ) : (
        <Tooltip label={label}>
          <button
            type="button"
            onClick={acionar}
            aria-label={label}
            aria-pressed={screenOn}
            className={`grid h-12 w-12 place-items-center rounded-full transition ${
              screenOn
                ? "bg-red text-white hover:bg-red-hover"
                : "bg-border-strong text-white hover:bg-border-strong-hover"
            }`}
          >
            {screenOn ? <MonitorX size={20} /> : <MonitorUp size={20} />}
          </button>
        </Tooltip>
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

  return (
    <div className="flex items-center gap-2 rounded-full bg-red/15 py-1 pl-3 pr-1 text-xs font-semibold text-red">
      <Radio size={14} aria-hidden="true" />
      Você está ao vivo
      <button
        type="button"
        onClick={() => void pararTela()}
        className="rounded-full bg-red px-2 py-1 text-[11px] font-bold text-white transition hover:bg-red-hover"
      >
        Parar transmissão
      </button>
    </div>
  );
}
