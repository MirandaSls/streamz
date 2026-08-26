"use client";

import { MonitorUp, MonitorX, PhoneOff, Signal, Video, VideoOff, Radio } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import { dmTitle, useDMs } from "@/stores/dms";
import { useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Barra "Voz conectada" — mora acima do painel do usuário, no rodapé da coluna
 * 2, como no Discord.
 *
 * Ela existe para o caso em que a call **não está na tela**: o usuário entrou
 * num canal de voz e foi ler outro canal de texto. Sem essa barra não haveria
 * como sair da call nem lembrar que ela existe.
 */
export default function VoiceConnectedBar() {
  const channelId = useVoice((s) => s.channelId);
  const guildId = useVoice((s) => s.guildId);
  const nomeDoCanal = useVoice((s) => s.channelName);
  const status = useVoice((s) => s.status);
  const midia = useVoice((s) => s.midiaDisponivel);
  const camOn = useVoice((s) => s.camOn);
  const screenOn = useVoice((s) => s.screenOn);
  const toggleCam = useVoice((s) => s.toggleCam);
  const toggleScreen = useVoice((s) => s.toggleScreen);
  const disconnect = useVoice((s) => s.disconnect);
  const conversas = useDMs((s) => s.channels);

  const pushToTalk = useVoicePrefs((s) => s.pushToTalk);
  const pttKey = useVoicePrefs((s) => s.pttKey);
  const pttAtivo = useVoicePrefs((s) => s.pttAtivo);

  if (!channelId) return null;

  const conversa = conversas.find((d) => d.id === channelId);
  const titulo = guildId ? nomeDoCanal || "voz" : conversa ? dmTitle(conversa) : "Chamada";

  return (
    <div className="flex shrink-0 flex-col gap-1 bg-footer px-2 pb-1 pt-2" data-voice-bar>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 overflow-hidden">
          <span
            className={`flex items-center gap-1 text-sm font-semibold ${
              status === "connected" && midia ? "text-green" : "text-yellow"
            }`}
          >
            <Signal size={16} className="shrink-0" aria-hidden="true" />
            {/* o texto precisa do próprio span: `truncate` num container flex
                corta sem reticências */}
            <span className="truncate">
              {status === "connecting"
                ? "Conectando…"
                : midia
                  ? "Voz conectada"
                  : "Voz não configurada"}
            </span>
          </span>
          <span className="block truncate text-xs text-txt-muted">{titulo}</span>
        </span>

        <Tooltip label={screenOn ? "Parar compartilhamento" : "Compartilhar tela"}>
          <button
            type="button"
            onClick={() => void toggleScreen()}
            aria-label={screenOn ? "Parar compartilhamento" : "Compartilhar tela"}
            aria-pressed={screenOn}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-[4px] transition hover:bg-hov ${
              screenOn ? "text-green" : "text-txt-secondary hover:text-txt-primary"
            }`}
          >
            {screenOn ? <MonitorX size={18} /> : <MonitorUp size={18} />}
          </button>
        </Tooltip>
        <Tooltip label={camOn ? "Desligar câmera" : "Ligar câmera"}>
          <button
            type="button"
            onClick={() => void toggleCam()}
            aria-label={camOn ? "Desligar câmera" : "Ligar câmera"}
            aria-pressed={camOn}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-[4px] transition hover:bg-hov ${
              camOn ? "text-green" : "text-txt-secondary hover:text-txt-primary"
            }`}
          >
            {camOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>
        </Tooltip>
        <Tooltip label="Desconectar">
          <button
            type="button"
            onClick={() => void disconnect()}
            aria-label="Desconectar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-red"
          >
            <PhoneOff size={18} />
          </button>
        </Tooltip>
      </div>

      {pushToTalk && (
        // sem tecla escolhida o PTT deixaria o microfone fechado para sempre —
        // o aviso é o que impede o usuário de achar que o microfone quebrou
        <span
          className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.02em] ${
            pttAtivo ? "text-green" : pttKey ? "text-txt-muted" : "text-yellow"
          }`}
        >
          <Radio size={12} aria-hidden="true" />
          {pttKey ? (pttAtivo ? "PTT · falando" : "PTT") : "PTT sem tecla definida"}
        </span>
      )}
    </div>
  );
}
