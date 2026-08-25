"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp, MonitorUp, MonitorX } from "lucide-react";
import { SCREEN_QUALITY, type ScreenQuality } from "@newdisc/shared";
import Tooltip from "@/components/ui/Tooltip";
import { useVoice } from "@/stores/voice";

/**
 * Compartilhar tela — botão com seletor de qualidade.
 *
 * A qualidade é escolhida **antes** de compartilhar porque é o que o browser
 * pede ao capturar: trocar depois exigiria republicar a faixa. Por isso o
 * chevron abre o painel e o botão grande dispara a captura com o que estiver
 * marcado.
 */
export default function ScreenShareButton() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const screenOn = useVoice((s) => s.screenOn);
  const quality = useVoice((s) => s.screenQuality);
  const audio = useVoice((s) => s.screenAudio);
  const setQuality = useVoice((s) => s.setScreenQuality);
  const setAudio = useVoice((s) => s.setScreenAudio);
  const toggleScreen = useVoice((s) => s.toggleScreen);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <div className="flex items-center">
        <Tooltip label={screenOn ? "Parar compartilhamento" : "Compartilhar tela"}>
          <button
            type="button"
            onClick={() => void toggleScreen()}
            aria-label={screenOn ? "Parar compartilhamento" : "Compartilhar tela"}
            aria-pressed={screenOn}
            className={`grid h-12 w-12 place-items-center rounded-l-full transition ${
              screenOn ? "bg-green text-white hover:brightness-110" : "bg-[#4e5058] text-white hover:bg-[#6d6f78]"
            }`}
          >
            {screenOn ? <MonitorX size={20} /> : <MonitorUp size={20} />}
          </button>
        </Tooltip>
        <Tooltip label="Opções de compartilhamento">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-label="Opções de compartilhamento"
            aria-expanded={aberto}
            className="grid h-12 w-6 place-items-center rounded-r-full bg-[#4e5058] text-white transition hover:bg-[#6d6f78]"
          >
            <ChevronUp size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {aberto && (
        <div
          role="group"
          aria-label="Qualidade do compartilhamento"
          className="absolute bottom-14 right-0 w-56 rounded-[4px] bg-footer p-2 shadow-lg"
        >
          <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
            Qualidade
          </p>
          {(Object.keys(SCREEN_QUALITY) as ScreenQuality[]).map((q) => (
            <label
              key={q}
              className="flex cursor-pointer items-center gap-2 rounded-[2px] px-1 py-1.5 text-sm text-txt-normal transition hover:bg-accent hover:text-white"
            >
              <input
                type="radio"
                name="screen-quality"
                checked={quality === q}
                onChange={() => setQuality(q)}
                className="accent-accent"
              />
              {SCREEN_QUALITY[q].label}
            </label>
          ))}
          <span aria-hidden="true" className="my-1 block h-px bg-[#3f4147]" />
          <label className="flex cursor-pointer items-center gap-2 rounded-[2px] px-1 py-1.5 text-sm text-txt-normal transition hover:bg-accent hover:text-white">
            <input
              type="checkbox"
              checked={audio}
              onChange={(e) => setAudio(e.target.checked)}
              className="accent-accent"
            />
            Compartilhar áudio do sistema
          </label>
        </div>
      )}
    </div>
  );
}
