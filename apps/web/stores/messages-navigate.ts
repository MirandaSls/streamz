"use client";

import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { ui } from "@/stores/ui";

/**
 * "Ir para a mensagem", de qualquer lugar do app.
 *
 * Mora fora da store de mensagens de propósito: quem sabe trocar de servidor e
 * de canal são as stores de servidores/canais/conversas, e elas já importam a
 * de mensagens — o caminho inverso fecharia um ciclo. Aqui é o único ponto que
 * conhece as quatro e as coloca em ordem: servidor → canal → janela da
 * mensagem.
 */

/** Espera a lista de canais do servidor terminar de carregar (com desistência). */
function aoCarregarCanais(guildId: string, timeoutMs = 5000): Promise<void> {
  const pronto = () => {
    const s = useChannels.getState();
    return s.guildId === guildId && !s.loading;
  };
  if (pronto()) return Promise.resolve();
  return new Promise((resolve) => {
    const encerrar = () => {
      clearTimeout(timer);
      unsub();
      resolve();
    };
    const unsub = useChannels.subscribe(() => {
      if (pronto()) encerrar();
    });
    const timer = setTimeout(encerrar, timeoutMs);
  });
}

export interface ChannelTarget {
  /** null = conversa direta. */
  guildId: string | null;
  channelId: string;
}

export interface MessageTarget extends ChannelTarget {
  messageId: string;
}

/** Abre o canal, trocando de servidor (ou para o modo conversas) se preciso. */
export async function goToChannel({ guildId, channelId }: ChannelTarget): Promise<boolean> {
  if (guildId) {
    const guilds = useGuilds.getState();
    if (guilds.activeGuildId !== guildId) {
      const guild = guilds.guilds.find((g) => g.id === guildId);
      guilds.select(guild ?? { id: guildId, name: "" });
      await aoCarregarCanais(guildId);
    }
    ui.setView("guild");
    const canais = useChannels.getState();
    const canal = canais.channels.find((c) => c.id === channelId);
    if (!canal) {
      ui.toast("Você não tem mais acesso a esse canal", "error");
      return false;
    }
    if (canais.activeChannelId !== channelId) canais.select(canal);
  } else {
    // `abrirPorId` busca no servidor quando a conversa não está na lista — é o
    // caso de uma conversa fechada, que o `GET /dms` não devolve: antes o link
    // dizia "você não participa mais dessa conversa" para algo que era só um X.
    if (!(await useDMs.getState().abrirPorId(channelId))) {
      ui.toast("Você não participa mais dessa conversa", "error");
      return false;
    }
  }
  return true;
}

/** Abre o canal e pula até a mensagem, destacando-a. */
export async function goToMessage({ guildId, channelId, messageId }: MessageTarget): Promise<void> {
  if (!(await goToChannel({ guildId, channelId }))) return;
  await useMessages.getState().jumpTo(channelId, messageId);
}
