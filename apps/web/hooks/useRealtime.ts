"use client";

import { useEffect } from "react";
import {
  WS_EVENTS,
  type GuildRemovedEvent,
  type Message,
  type MessageDeletedEvent,
  type PresenceUpdatePayload,
} from "@newdisc/shared";
import { notify } from "@/lib/desktop";
import { on, onReconnect, rejoinChannel } from "@/stores/socket-adapter";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { usePresence } from "@/stores/presence";
import { ui } from "@/stores/ui";

/**
 * Único ponto de assinatura dos eventos do gateway.
 *
 * Antes cada `useEffect` da tela registrava o seu listener e se re-registrava a
 * cada mudança de canal/DM — o que abria janelas em que um evento chegava sem
 * ninguém escutando (ou com uma closure velha). Aqui os listeners entram uma vez
 * e apenas repassam para a store dona do assunto, que lê o estado na hora.
 *
 * Também é aqui que tratamos a reconexão: o servidor esquece as salas quando a
 * conexão cai, então reentramos na sala do canal e recarregamos o histórico —
 * sem isso o que chegou durante a queda ficaria faltando para sempre.
 *
 * Conversa direta é canal (ADR-0001): `message.new` serve para as duas coisas.
 * Se a mensagem é de um canal que a tela não conhece, é uma conversa que alguém
 * acabou de abrir com o usuário — recarregamos a lista de DMs para ela aparecer.
 */
export function useRealtime(currentUserId?: string): void {
  useEffect(() => {
    const unsubscribe = [
      on<Message>(WS_EVENTS.MESSAGE_NEW, (message) => {
        useMessages.getState().handleNew(message);
        if (isUnknownChannel(message.channelId) && message.author.id !== currentUserId) {
          void useDMs.getState().refreshList();
        }
        notifyIfAway(message, currentUserId);
      }),

      on<Message>(WS_EVENTS.MESSAGE_UPDATED, (message) => {
        useMessages.getState().handleUpdated(message);
      }),

      on<MessageDeletedEvent>(WS_EVENTS.MESSAGE_DELETED, (event) => {
        useMessages.getState().handleDeleted(event);
      }),

      on<PresenceUpdatePayload>(WS_EVENTS.PRESENCE_UPDATE, ({ userId, status }) => {
        usePresence.getState().apply(userId, status);
      }),

      on<GuildRemovedEvent>(WS_EVENTS.GUILD_REMOVED, ({ guildId, reason }) => {
        useGuilds.getState().handleRemoved(guildId);
        ui.toast(
          reason === "banned" ? "Você foi banido do servidor." : "Você foi removido do servidor.",
          "error",
        );
      }),

      // erros de escrita voltam por um canal só do gateway (`emitError`)
      on<{ message?: string }>("ws.error", (payload) => {
        ui.toast(payload?.message || "Não foi possível concluir a ação", "error");
      }),

      onReconnect(() => {
        rejoinChannel();
        // cobre canal de servidor e conversa: o ativo é um só, em useMessages
        void useMessages.getState().resyncActive();
      }),
    ];

    return () => {
      for (const off of unsubscribe) off();
    };
  }, [currentUserId]);
}

/** Canal que não está nem no servidor aberto nem na lista de conversas. */
function isUnknownChannel(channelId: string): boolean {
  return (
    !useChannels.getState().channels.some((c) => c.id === channelId) &&
    !useDMs.getState().channels.some((d) => d.id === channelId)
  );
}

/** Título para a notificação: `#canal` no servidor, nome da conversa em DM. */
function channelTitle(channelId: string): string {
  const dm = useDMs.getState().channels.find((d) => d.id === channelId);
  if (dm) return dmTitle(dm);
  const channel = useChannels.getState().channels.find((c) => c.id === channelId);
  return `#${channel?.name ?? "canal"}`;
}

/** Notifica só o que o usuário perderia: mensagem de outro com a janela fora. */
function notifyIfAway(message: Message, currentUserId?: string) {
  if (message.author.id === currentUserId) return;
  if (typeof document === "undefined" || document.visibilityState === "visible") return;
  void notify(channelTitle(message.channelId), `${message.author.username}: ${message.content}`);
}
