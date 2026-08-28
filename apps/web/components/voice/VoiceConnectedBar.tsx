"use client";

import { PhoneOff, RotateCw, Signal, SignalZero, Video } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import ScreenShareButton from "@/components/voice/ScreenShareButton";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Barra "Voz conectada" — mora acima do painel do usuário, no rodapé da coluna
 * 2, como no Discord.
 *
 * Ela existe para o caso em que a call **não está na tela**: o usuário entrou
 * num canal de voz e foi ler outro canal de texto. Sem essa barra não haveria
 * como voltar para a call, nem lembrar que ela existe.
 *
 * São duas linhas, e a divisão é deliberada: a de cima responde "onde eu estou
 * e como saio"; a de baixo é a fileira de ações largas, que precisam de alvo
 * grande porque são usadas no meio de uma conversa, sem olhar.
 */
export default function VoiceConnectedBar() {
  const channelId = useVoice((s) => s.channelId);
  const guildId = useVoice((s) => s.guildId);
  const nomeDoCanal = useVoice((s) => s.channelName);
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const camOn = useVoice((s) => s.camOn);
  const toggleCam = useVoice((s) => s.toggleCam);
  const disconnect = useVoice((s) => s.disconnect);
  const reconnect = useVoice((s) => s.reconnect);
  const conversas = useDMs((s) => s.channels);
  const guilds = useGuilds((s) => s.guilds);

  if (!channelId) return null;

  const conversa = conversas.find((d) => d.id === channelId);
  const titulo = guildId ? nomeDoCanal || "voz" : conversa ? dmTitle(conversa) : "Chamada";
  const servidor = guildId ? guilds.find((g) => g.id === guildId)?.name ?? null : null;
  const falhou = status === "error";

  /** Volta para o canal da call — o caminho de "onde isso está acontecendo?". */
  function irParaCall() {
    if (guildId) {
      const guild = guilds.find((g) => g.id === guildId);
      const canal = useChannels.getState().channels.find((c) => c.id === channelId);
      ui.setView("guild");
      if (guild) useGuilds.getState().select(guild);
      if (canal) useChannels.getState().select(canal);
      return;
    }
    ui.setView("dm");
    if (conversa) useDMs.getState().select(conversa);
  }

  return (
    <div className="flex shrink-0 flex-col gap-1 bg-footer px-2 pb-1 pt-2" data-voice-bar>
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 overflow-hidden">
          <span
            className={`flex items-center gap-1 text-sm font-semibold ${
              falhou ? "text-red" : status === "connecting" ? "text-txt-muted" : "text-green"
            }`}
          >
            {falhou ? (
              <SignalZero size={16} className="shrink-0" aria-hidden="true" />
            ) : (
              <Signal size={16} className="shrink-0" aria-hidden="true" />
            )}
            {/* o texto precisa do próprio span: `truncate` num container flex
                corta sem reticências */}
            <span className="truncate">
              {falhou ? "Erro de voz" : status === "connecting" ? "Conectando…" : "Voz conectada"}
            </span>
          </span>
          <button
            type="button"
            onClick={irParaCall}
            className="block max-w-full truncate text-left text-xs text-txt-muted hover:underline"
          >
            {titulo}
            {servidor && <span className="text-txt-faint"> / {servidor}</span>}
          </button>
        </span>

        {/* sem botão de chat aqui: o nome do canal logo acima já leva à call, e
            o chat do canal de voz tem o próprio alternador no cabeçalho dele */}
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

      {falhou && (
        // erro real (a queda da mídia), não "não configurado": só aqui faz
        // sentido gastar vermelho e oferecer a repetição
        <div className="flex items-center gap-2 rounded-[4px] bg-red/15 px-2 py-1.5 text-xs text-red">
          <span className="min-w-0 flex-1 truncate">{erro}</span>
          <button
            type="button"
            onClick={() => void reconnect()}
            className="flex shrink-0 items-center gap-1 font-semibold hover:underline"
          >
            <RotateCw size={12} aria-hidden="true" />
            Tentar de novo
          </button>
        </div>
      )}

      <div className="flex items-stretch gap-1 pb-1">
        <button
          type="button"
          onClick={() => void toggleCam()}
          aria-pressed={camOn}
          className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[4px] text-xs font-semibold transition ${
            camOn
              ? "bg-border-strong-hover text-txt-primary"
              : "bg-border-strong/60 text-txt-secondary hover:bg-border-strong hover:text-txt-primary"
          }`}
        >
          <Video size={16} aria-hidden="true" />
          Vídeo
        </button>
        <ScreenShareButton variante="largo" />
      </div>
    </div>
  );
}
