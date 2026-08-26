"use client";

import { useEffect } from "react";
import VoiceHotkeys from "@/components/voice/VoiceHotkeys";
import { VoiceParticipantMenuHost } from "@/components/voice/VoiceGrid";
import { useGuilds } from "@/stores/guilds";
import { useVoice } from "@/stores/voice";

/**
 * As peças de voz que precisam existir com o app inteiro, não só com o painel
 * aberto: atalhos de teclado, o menu de participante e a carga do estado de voz
 * do servidor ativo.
 *
 * O estado de voz precisa vir uma vez por servidor (`GET /guilds/:id/
 * voice-states`) porque o `voice.state` só conta o que muda **daqui para a
 * frente** — sem essa carga inicial quem entrasse depois não veria ninguém nas
 * salas.
 */
export default function VoiceLayer() {
  const guildId = useGuilds((s) => s.activeGuildId);

  useEffect(() => {
    if (guildId) void useVoice.getState().loadGuild(guildId);
  }, [guildId]);

  return (
    <>
      <VoiceHotkeys />
      <VoiceParticipantMenuHost />
    </>
  );
}
