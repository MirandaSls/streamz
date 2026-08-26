"use client";

import { useEffect } from "react";
import { AlertTriangle, Users, Volume2 } from "lucide-react";
import type { Channel } from "@streamz/shared";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { useVoice } from "@/stores/voice";

/**
 * Painel de voz/vídeo/tela de um canal de VOZ (coluna 3).
 *
 * Aqui não há conexão nenhuma: quem conecta, guarda estado e fala com o
 * LiveKit é a store `stores/voice.ts`. Este componente só monta a tela em cima
 * do que ela expõe — o que permite ao painel ser fechado (trocar de canal de
 * texto) sem derrubar a call, que é como o Discord se comporta.
 *
 * Deve ser montado com `key={channelId}` para reiniciar a conexão ao trocar.
 */
export default function VoicePanel({
  channel,
  onLeave,
}: {
  channel: Pick<Channel, "id" | "guildId" | "name" | "type">;
  onLeave?: () => void;
}) {
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const conectadoEm = useVoice((s) => s.channelId);
  const telaCheia = useVoice((s) => s.telaCheia);
  const connect = useVoice((s) => s.connect);
  const disconnect = useVoice((s) => s.disconnect);
  const quantos = useVoice((s) => s.statesOf(channel.id).length);

  // entra na sala ao abrir o canal; sair é ação explícita (botão vermelho)
  useEffect(() => {
    if (useVoice.getState().channelId !== channel.id) void connect(channel);
    // `channel` é reconstruído a cada render pela página; o id é o que importa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, connect]);

  async function sair() {
    await disconnect();
    onLeave?.();
  }

  const conectado = conectadoEm === channel.id && status === "connected";

  return (
    <div
      className={`flex flex-col bg-chat ${telaCheia ? "fixed inset-0 z-40" : "h-full"}`}
      data-voice-panel={channel.id}
    >
      <header className="flex h-12 shrink-0 items-center justify-between px-4 shadow-header">
        <span className="flex items-center gap-2 font-semibold text-txt-primary">
          <Volume2 size={24} className="text-txt-muted" aria-hidden="true" />
          {channel.name ?? "voz"}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-txt-muted">
          <Users size={14} aria-hidden="true" />
          {status === "connecting" ? "Conectando…" : `${quantos} na sala`}
        </span>
      </header>

      {erro && (
        <p
          role="status"
          className="flex shrink-0 items-center gap-2 bg-panel px-4 py-2 text-sm text-txt-muted"
        >
          <AlertTriangle size={16} className="shrink-0 text-yellow" aria-hidden="true" />
          {erro}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {status === "connecting" ? (
          <div className="grid h-full place-items-center text-txt-muted">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
              <p>Entrando na sala…</p>
            </div>
          </div>
        ) : (
          <VoiceGrid channelId={channel.id} />
        )}
      </div>

      {conectado && <VoiceControls onLeave={() => void sair()} />}
    </div>
  );
}
