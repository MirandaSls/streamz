"use client";

import { useEffect } from "react";
import {
  WS_EVENTS,
  displayNameOf,
  mentionsUser,
  type Channel,
  type ChannelDeletedEvent,
  type GuildRemovedEvent,
  type MemberJoinedEvent,
  type MemberLeftEvent,
  type MemberUpdatedEvent,
  type Message,
  type MessageDeletedEvent,
  type EmojiUpdatedEvent,
  type PresenceUpdatePayload,
  type PublicUser,
  type StickerUpdatedEvent,
} from "@newdisc/shared";
import { notify } from "@/lib/desktop";
import { useAuth } from "@/stores/auth";
import { on, onReconnect, rejoinChannel } from "@/stores/socket-adapter";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { usePresence } from "@/stores/presence";
import { useTyping } from "@/stores/typing";
import { ui } from "@/stores/ui";

/**
 * Único ponto de assinatura dos eventos do gateway.
 *
 * Os listeners entram uma vez e apenas repassam para a store dona do assunto,
 * que lê o estado na hora — sem closure velha nem janela sem ouvinte.
 *
 * O socket está em todas as salas que o usuário pode ver (o gateway faz isso
 * no connect), então `message.new` chega para qualquer canal: o do servidor
 * aberto, os dos outros servidores (rail) e as conversas. Cada um atualiza
 * seu "não lido"; o canal na tela, com a janela visível, é marcado como lido.
 *
 * Reconexão: o servidor esquece as salas quando a conexão cai, então
 * recarregamos o histórico do canal ativo e as listas — sem isso o que chegou
 * durante a queda ficaria faltando.
 */
export function useRealtime(currentUserId?: string): void {
  useEffect(() => {
    const unsubscribe = [
      on<Message>(WS_EVENTS.MESSAGE_NEW, (message) => {
        useMessages.getState().handleNew(message);
        onMessageArrived(message, currentUserId);
      }),

      on<Message>(WS_EVENTS.MESSAGE_UPDATED, (message) => {
        useMessages.getState().handleUpdated(message);
      }),

      on<MessageDeletedEvent>(WS_EVENTS.MESSAGE_DELETED, (event) => {
        useMessages.getState().handleDeleted(event);
      }),

      on<PresenceUpdatePayload>(WS_EVENTS.PRESENCE_UPDATE, ({ userId, status }) => {
        usePresence.getState().apply(userId, status);
        const me = useAuth.getState().user;
        if (me && me.id === userId) useAuth.getState().setUser({ ...me, status });
      }),

      on<PublicUser>(WS_EVENTS.USER_UPDATED, (user) => {
        usePresence.getState().applyProfile(user);
        const me = useAuth.getState().user;
        if (me && me.id === user.id) useAuth.getState().setUser(user);
      }),

      on<{ channelId: string; user: Pick<PublicUser, "id" | "username"> }>(
        WS_EVENTS.TYPING,
        ({ channelId, user }) => {
          useTyping.getState().apply(channelId, user);
        },
      ),

      on<Channel>(WS_EVENTS.CHANNEL_CREATED, (channel) => {
        if (channel.guildId) useChannels.getState().handleCreated(channel);
        else void useDMs.getState().refreshList();
      }),
      on<Channel>(WS_EVENTS.CHANNEL_UPDATED, (channel) => {
        if (channel.guildId) useChannels.getState().handleUpdated(channel);
        else void useDMs.getState().refreshList();
      }),
      on<ChannelDeletedEvent>(WS_EVENTS.CHANNEL_DELETED, ({ channelId, guildId }) => {
        if (guildId) useChannels.getState().handleDeleted(channelId);
        else useDMs.getState().handleDeleted(channelId);
      }),

      on<MemberJoinedEvent>(WS_EVENTS.MEMBER_JOINED, ({ guildId, member }) => {
        useGuilds.getState().handleMemberJoined(guildId, member);
      }),
      on<MemberLeftEvent>(WS_EVENTS.MEMBER_LEFT, ({ guildId, userId }) => {
        useGuilds.getState().handleMemberLeft(guildId, userId);
      }),

      on<MemberUpdatedEvent>(WS_EVENTS.MEMBER_UPDATED, ({ guildId, userId, role }) => {
        useGuilds.getState().handleMemberUpdated(guildId, userId, role);
        if (userId === currentUserId) {
          ui.toast(role === "ADMIN" ? "Você agora é administrador." : "Você deixou de ser administrador.");
          // o que eu enxergo pode ter mudado (canais privados)
          if (useGuilds.getState().activeGuildId === guildId) {
            void useChannels.getState().loadForGuild(guildId);
          }
        }
      }),

      on<GuildRemovedEvent>(WS_EVENTS.GUILD_REMOVED, ({ guildId, reason }) => {
        useGuilds.getState().handleRemoved(guildId);
        const texto = {
          banned: "Você foi banido do servidor.",
          kicked: "Você foi removido do servidor.",
          deleted: "O servidor foi apagado.",
          left: null,
        }[reason];
        if (texto) ui.toast(texto, "error");
      }),

      // erros de escrita voltam por um canal só do gateway (`emitError`)
      on<{ message?: string }>(WS_EVENTS.ERROR, (payload) => {
        ui.toast(payload?.message || "Não foi possível concluir a ação", "error");
      }),

      // ── g-emojis-midia ──
      on<EmojiUpdatedEvent>(WS_EVENTS.EMOJI_UPDATED, ({ guildId, emojis }) => {
        useEmojis.getState().applyEmojis(guildId, emojis);
      }),
      on<StickerUpdatedEvent>(WS_EVENTS.STICKER_UPDATED, ({ guildId, stickers }) => {
        useEmojis.getState().applyStickers(guildId, stickers);
      }),

      onReconnect(() => {
        rejoinChannel();
        void useMessages.getState().resyncActive();
        void useGuilds.getState().load();
        void useDMs.getState().refreshList();
        // emoji/figurinha podem ter mudado enquanto a conexão esteve fora
        void useEmojis.getState().load();
      }),
    ];

    return () => {
      for (const off of unsubscribe) off();
    };
  }, [currentUserId]);
}

/** Não lido, menções, "subir a conversa" e notificação — para uma mensagem que chegou. */
function onMessageArrived(message: Message, currentUserId?: string) {
  const me = useAuth.getState().user;
  const mine = message.author.id === currentUserId;
  const mention = !mine && !!me && mentionsUser(message.content, me.username);
  const activeChannelId = useMessages.getState().activeChannelId;
  const visivel = typeof document !== "undefined" && document.visibilityState === "visible";
  const naTela = message.channelId === activeChannelId && visivel;

  if (message.guildId) {
    const channels = useChannels.getState();
    if (channels.guildId === message.guildId) {
      channels.bumpUnread(message.channelId, message.createdAt, mention);
      if (naTela) void channels.markRead(message.channelId);
      useGuilds.getState().syncFromChannels(message.guildId);
    } else if (!mine) {
      useGuilds.getState().bumpUnread(message.guildId, mention);
    }
  } else {
    const dms = useDMs.getState();
    if (dms.channels.some((d) => d.id === message.channelId)) {
      dms.bumpUnread(message.channelId, message.createdAt, mention);
      if (naTela) void dms.markRead(message.channelId);
    } else if (!mine) {
      // alguém abriu uma conversa comigo agora
      void dms.refreshList();
    }
  }

  if (!mine && !naTela) notifyIfAway(message, mention);
}

/** Título para a notificação: `#canal` no servidor, nome da conversa em DM. */
function channelTitle(channelId: string): string {
  const dm = useDMs.getState().channels.find((d) => d.id === channelId);
  if (dm) return dmTitle(dm);
  const channel = useChannels.getState().channels.find((c) => c.id === channelId);
  return `#${channel?.name ?? "canal"}`;
}

/** Notifica só o que o usuário perderia: mensagem de outro, fora da tela. */
function notifyIfAway(message: Message, mention: boolean) {
  if (typeof document === "undefined") return;
  // dentro do app, só menção e DM avisam; com a janela escondida, tudo avisa
  const escondida = document.visibilityState !== "visible";
  if (!escondida && !mention && message.guildId) return;
  void notify(channelTitle(message.channelId), `${displayNameOf(message.author)}: ${message.content}`);
}
