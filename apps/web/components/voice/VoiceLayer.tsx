"use client";

import { useEffect, useRef } from "react";
import IncomingCallModal from "@/components/voice/IncomingCallModal";
import VoiceHotkeys from "@/components/voice/VoiceHotkeys";
import { VoiceVolumePopoverHost } from "@/components/voice/VoiceGrid";
import { ringbackDataUrl } from "@/lib/ringtone";
import { useGuilds } from "@/stores/guilds";
import { useVoice } from "@/stores/voice";

/**
 * As peças de voz que precisam existir com o app inteiro, não só com o painel
 * aberto: atalhos de teclado, o cartão de chamada recebida, o popover de volume
 * e a carga do estado de voz dos servidores.
 *
 * O estado de voz precisa vir uma vez por servidor (`GET /guilds/:id/
 * voice-states`) porque o `voice.state` só conta o que muda **daqui para a
 * frente** — sem essa carga inicial quem entrasse depois não veria ninguém nas
 * salas. A carga é acumulativa: `loadGuild` troca só os canais do servidor
 * pedido e preserva o cache dos demais, então voltar a um servidor já visitado
 * mostra as salas cheias na hora, sem piscar vazio enquanto o fetch volta.
 */
export default function VoiceLayer() {
  const guildId = useGuilds((s) => s.activeGuildId);
  const fase = useVoice((s) => s.call.phase);
  const ringback = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (guildId) void useVoice.getState().loadGuild(guildId);
  }, [guildId]);

  // quem liga também precisa ouvir alguma coisa: silêncio absoluto do lado de
  // cá é indistinguível de chamada que não saiu
  useEffect(() => {
    const el = ringback.current;
    if (!el) return;
    if (fase === "outgoing") void el.play().catch(() => {});
    else {
      el.pause();
      el.currentTime = 0;
    }
  }, [fase]);

  return (
    <>
      <VoiceHotkeys />
      <VoiceVolumePopoverHost />
      <IncomingCallModal />
      <audio ref={ringback} src={ringbackDataUrl()} loop />
    </>
  );
}
