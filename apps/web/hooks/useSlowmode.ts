"use client";

import { useEffect, useState } from "react";
import { slowmodeRemaining } from "@newdisc/shared";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useCanModerate } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";

export interface SlowmodeState {
  /** intervalo configurado no canal (0 = desligado). */
  seconds: number;
  /** segundos que ainda faltam para poder enviar (0 = liberado). */
  remaining: number;
  /** true enquanto o envio está bloqueado pelo modo lento. */
  blocked: boolean;
}

const LIVRE: SlowmodeState = { seconds: 0, remaining: 0, blocked: false };

/**
 * Estado do modo lento de um canal, na visão de quem está digitando.
 *
 * A conta é a mesma da API (`slowmodeRemaining`, no contrato compartilhado):
 * "quanto falta desde a minha última mensagem neste canal". A última mensagem
 * sai da própria timeline — inclusive a otimista —, então a contagem começa no
 * instante do envio, sem esperar a volta do servidor.
 *
 * Moderação é isenta, como na API. O relógio só corre enquanto há bloqueio: um
 * `setInterval` permanente por canal aberto seria trabalho à toa.
 */
export function useSlowmode(channelId: string | null): SlowmodeState {
  const user = useAuth((s) => s.user);
  const canModerate = useCanModerate(user?.id);
  const seconds = useChannels((s) =>
    channelId ? (s.channels.find((c) => c.id === channelId)?.slowmodeSeconds ?? 0) : 0,
  );
  const ultimaMinha = useMessages((s) => {
    if (!channelId || !user) return null;
    const itens = s.byChannel[channelId]?.items ?? [];
    for (let i = itens.length - 1; i >= 0; i--) {
      if (itens[i].author.id === user.id) return itens[i].createdAt;
    }
    return null;
  });

  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (seconds <= 0 || canModerate || !ultimaMinha) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(slowmodeRemaining(seconds, ultimaMinha));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [seconds, canModerate, ultimaMinha]);

  if (seconds <= 0 || canModerate) return LIVRE;
  return { seconds, remaining, blocked: remaining > 0 };
}
