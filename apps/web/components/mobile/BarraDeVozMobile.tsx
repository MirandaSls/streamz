"use client";

import { Mic, MicOff, PhoneOff, Signal, SignalZero } from "@/components/ui/icones";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { mobile, useMobile } from "@/stores/mobile";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Barra compacta "Voz conectada", entre o conteúdo e a barra de abas.
 *
 * É o par móvel da `VoiceConnectedBar` do desktop, e existe pelo mesmo motivo:
 * a chamada continua quando a tela dela sai da frente, e sem uma barra não
 * haveria como lembrar disso nem como voltar. O que muda é a forma — no
 * desktop são duas linhas com seis controles, porque ali sobra coluna; aqui é
 * **uma linha de 48px** com o que se usa sem olhar: voltar para a call
 * (tocando na barra), mudo e desligar.
 *
 * Ela não aparece quando o palco já está na tela: repetir a informação em cima
 * dela mesma só rouba altura da grade.
 */
export default function BarraDeVozMobile() {
  const channelId = useVoice((s) => s.channelId);
  const guildId = useVoice((s) => s.guildId);
  const nomeDoCanal = useVoice((s) => s.channelName);
  const status = useVoice((s) => s.status);
  const disconnect = useVoice((s) => s.disconnect);
  const conversas = useDMs((s) => s.channels);
  const guilds = useGuilds((s) => s.guilds);
  const muted = useVoicePrefs((s) => s.muted);
  const toggleMute = useVoicePrefs((s) => s.toggleMute);
  const aba = useMobile((s) => s.aba);
  const pilhas = useMobile((s) => s.pilhas);

  if (!channelId) return null;
  // o palco já está na frente: a barra seria a mesma coisa duas vezes
  if (pilhas[aba][pilhas[aba].length - 1] === "voz") return null;

  const conversa = conversas.find((d) => d.id === channelId);
  const titulo = guildId ? nomeDoCanal || "voz" : conversa ? dmTitle(conversa) : "Chamada";
  const falhou = status === "error";

  /** Leva de volta ao canal da chamada — o mesmo caminho da barra do desktop. */
  function irParaCall() {
    if (guildId) {
      const guild = guilds.find((g) => g.id === guildId);
      const canal = useChannels.getState().channels.find((c) => c.id === channelId);
      ui.setView("guild");
      if (guild) useGuilds.getState().select(guild);
      if (canal) useChannels.getState().select(canal);
      mobile.irParaAba("servidores");
      mobile.empilhar("voz");
      return;
    }
    ui.setView("dm");
    if (conversa) useDMs.getState().select(conversa);
    mobile.irParaAba("mensagens");
    mobile.empilhar("conversa");
  }

  return (
    <div className="relative z-20 flex h-12 shrink-0 items-center gap-1 border-t border-border bg-footer pl-3 pr-1">
      <button
        type="button"
        onClick={irParaCall}
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
            falhou ? "bg-red/15 text-red" : status === "connecting" ? "bg-hov text-txt-muted" : "bg-green/15 text-green"
          }`}
          aria-hidden="true"
        >
          {falhou ? <SignalZero size={16} /> : <Signal size={16} />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span
            className={`truncate text-xs font-semibold leading-tight ${
              falhou ? "text-red" : status === "connecting" ? "text-txt-muted" : "text-green"
            }`}
          >
            {falhou ? "Erro de voz" : status === "connecting" ? "Conectando…" : "Voz conectada"}
          </span>
          <span className="truncate text-xs leading-tight text-txt-muted">{titulo}</span>
        </span>
      </button>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Desativar mudo" : "Silenciar"}
        aria-pressed={muted}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg transition ${
          muted ? "text-red" : "text-txt-secondary"
        }`}
      >
        {muted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>
      <button
        type="button"
        onClick={() => void disconnect()}
        aria-label="Desconectar"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-txt-secondary transition active:text-red"
      >
        <PhoneOff size={20} />
      </button>
    </div>
  );
}
