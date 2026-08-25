"use client";

import { useEffect } from "react";
import {
  WS_EVENTS,
  type DirectMessage,
  type GuildRemovedEvent,
  type Message,
  type MessageDeletedEvent,
  type PresenceUpdatePayload,
} from "@newdisc/shared";
import { notify } from "@/lib/desktop";
import { on, onReconnect, rejoinChannel } from "@/stores/socket-adapter";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
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
 */
export function useRealtime(currentUserId?: string): void {
  useEffect(() => {
    const unsubscribe = [
      on<Message>(WS_EVENTS.MESSAGE_NEW, (message) => {
        useMessages.getState().handleNew(message);
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

      on<DirectMessage>(WS_EVENTS.DM_NEW, (message) => {
        useDMs.getState().handleNew(message);
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
        void useMessages.getState().resyncActive();
        const dms = useDMs.getState();
        const active = dms.channels.find((d) => d.id === dms.activeId);
        if (active) void dms.select(active);
      }),
    ];

    return () => {
      for (const off of unsubscribe) off();
    };
  }, [currentUserId]);
}

/** Notifica só o que o usuário perderia: mensagem de outro com a janela fora. */
function notifyIfAway(message: Message, currentUserId?: string) {
  if (message.author.id === currentUserId) return;
  if (typeof document === "undefined" || document.visibilityState === "visible") return;
  const channel = useChannels
    .getState()
    .channels.find((c) => c.id === message.channelId);
  void notify(`#${channel?.name ?? "canal"}`, `${message.author.username}: ${message.content}`);
}
