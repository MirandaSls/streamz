"use client";

import type { VoiceStateEvent } from "@streamz/shared";
import { useAuth } from "@/stores/auth";
import { useVoice } from "@/stores/voice";

/** Meu silêncio de servidor (mute/deafen imposto por um moderador) — ausente = false. */
export interface SilencioDoServidor {
  serverMute: boolean;
  serverDeaf: boolean;
}

const SILENCIO_PADRAO: SilencioDoServidor = { serverMute: false, serverDeaf: false };

/**
 * A mesma conta de `useSilencioDoServidor`, fora do hook — para quem já está
 * dentro de uma store e tem `states`/`channelId` à mão via `getState()` (não
 * dá para chamar um hook ali).
 *
 * Cruza pelo `userId` do evento, não pela posição na lista: `states[channelId]`
 * é reordenado por nome a cada entrada/saída de participante (`statesOf`).
 */
export function silencioDoServidorDe(
  states: Record<string, VoiceStateEvent[]>,
  channelId: string | null,
  meuId: string | null | undefined,
): SilencioDoServidor {
  if (!channelId || !meuId) return SILENCIO_PADRAO;
  const meu = states[channelId]?.find((e) => e.user.id === meuId);
  if (!meu) return SILENCIO_PADRAO;
  return { serverMute: meu.serverMute ?? false, serverDeaf: meu.serverDeaf ?? false };
}

/**
 * Meu mute/deafen de servidor no canal de voz em que estou agora.
 *
 * Só há o que consultar enquanto estou conectado a uma sala — fora dela volta
 * ao padrão (não silenciado). A barra de controles usa isto para mostrar o
 * cadeado do mute de moderador, distinto do mudo que eu mesmo escolhi.
 *
 * As duas seleções da `useVoice` devolvem cada uma um **primitivo**
 * (`boolean`), não o objeto `SilencioDoServidor` inteiro: a igualdade padrão
 * do zustand é `Object.is`, e um objeto novo a cada notificação da store —
 * mesmo com os mesmos dois campos — reentraria em loop de render.
 */
export function useSilencioDoServidor(): SilencioDoServidor {
  const meuId = useAuth((s) => s.user?.id);
  const channelId = useVoice((s) => s.channelId);
  const serverMute = useVoice((s) => silencioDoServidorDe(s.states, channelId, meuId).serverMute);
  const serverDeaf = useVoice((s) => silencioDoServidorDe(s.states, channelId, meuId).serverDeaf);
  return { serverMute, serverDeaf };
}
