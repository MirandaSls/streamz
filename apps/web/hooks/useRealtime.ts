"use client";

import { useEffect } from "react";
import {
  WS_EVENTS,
  displayNameOf,
  mentionsMe,
  // ── f-voz ──,
  // ── d-social ──,
  // ── g-emojis-midia ──,
  type CallEndedEvent,
  type CallRingEvent,
  type Category,
  type CategoryDeletedEvent,
  type Channel,
  type ChannelDeletedEvent,
  type ChannelOverridesEvent,
  type EmojiUpdatedEvent,
  type FriendAcceptedEvent,
  type FriendRemovedEvent,
  type FriendRequestEvent,
  type Guild,
  type GuildOwnerChangedEvent,
  type GuildRemovedEvent,
  type MemberJoinedEvent,
  type MemberLeftEvent,
  type MemberUpdatedEvent,
  type Message,
  type MessageDeletedEvent,
  type MessagePinnedEvent,
  type MessageUnpinnedEvent,
  type PresenceUpdatePayload,
  type PublicUser,
  type Role,
  type RoleDeletedEvent,
  type StickerUpdatedEvent,
  type ThreadUpdatedEvent,
  type UserBlockedEvent,
  type VoiceEvictedEvent,
  type VoiceStateEvent,
} from "@streamz/shared";
import type { NotificationSetting } from "@streamz/shared";
// ── h-moderacao ──
import type {
  GuildSettingsUpdatedEvent,
  MessagesBulkDeletedEvent,
  PollUpdatedEvent,
  ReportView,
} from "@streamz/shared";
import { shouldNotifyMessage } from "@streamz/shared";
import { definirContadorNoIcone, notify } from "@/lib/desktop";
import { tocarSomDeNotificacao } from "@/lib/notification-sound";
import { somLigado } from "@/stores/sons";
import { levelForChannel, useNotifications } from "@/stores/notifications";
import { useSettings } from "@/stores/settings";
import { useAuth } from "@/stores/auth";
import { useModeration } from "@/stores/moderation";
import { usePolls } from "@/stores/polls";
import { on, onReconnect, rejoinChannel } from "@/stores/socket-adapter";
import { useCategories } from "@/stores/categories";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { usePermissions } from "@/stores/permissions";
import { usePins } from "@/stores/messages-pins";
import { useThreads } from "@/stores/messages-threads";
import { usePresence } from "@/stores/presence";
import { useTyping } from "@/stores/typing";
import { useVoice } from "@/stores/voice";
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
    // ── e-configuracoes ── sem elas, tudo notifica (o padrão do contrato)
    void useNotifications.getState().load();
    // Carga inicial das listas. Elas só eram refeitas na *re*conexão do socket,
    // então recarregar a página (ou abrir um link direto) deixava o rail vazio:
    // a lista só existia para quem tinha criado/entrado no servidor na mesma
    // sessão. Fora do escopo do agente E, mas é o que faz o deep link funcionar.
    if (useGuilds.getState().guilds.length === 0) void useGuilds.getState().load();
    if (useDMs.getState().channels.length === 0) void useDMs.getState().refreshList();

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
        // a chamada guarda o retrato de quem entrou; sem isto, trocar a foto no
        // meio dela só aparecia depois de sair e voltar
        useVoice.getState().aplicarPerfil(user);
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

      on<MemberUpdatedEvent>(
        WS_EVENTS.MEMBER_UPDATED,
        ({ guildId, userId, role, roleIds, timeoutUntil }) => {
          useGuilds.getState().handleMemberUpdated(guildId, userId, role, roleIds, timeoutUntil);
          // h-moderacao: o castigo chega por aqui — é o que troca o composer pelo aviso
          if (userId === currentUserId && timeoutUntil !== undefined) {
            useModeration.getState().applyTimeout(guildId, userId, timeoutUntil);
          }
          // evento de castigo não fala de papel nem de cargo: nada a recarregar
          if (userId === currentUserId && timeoutUntil === undefined) {
            // o que eu enxergo pode ter mudado (cargo dá ou tira VIEW_CHANNEL)
            if (useGuilds.getState().activeGuildId === guildId) {
              void useChannels.getState().loadForGuild(guildId);
              void usePermissions.getState().load(guildId);
            }
          }
        },
      ),

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

      // ── c-cargos: cargos, regras de canal e configurações do servidor ──
      on<Role>(WS_EVENTS.ROLE_CREATED, (role) => {
        usePermissions.getState().handleRoleSaved(role);
      }),
      on<Role>(WS_EVENTS.ROLE_UPDATED, (role) => {
        usePermissions.getState().handleRoleSaved(role);
      }),
      on<RoleDeletedEvent>(WS_EVENTS.ROLE_DELETED, ({ guildId, roleId }) => {
        usePermissions.getState().handleRoleDeleted(guildId, roleId);
      }),
      on<ChannelOverridesEvent>(
        WS_EVENTS.CHANNEL_OVERRIDES,
        ({ guildId, channelId, overrides }) => {
          usePermissions.getState().handleOverrides(guildId, channelId, overrides);
          // ganhar ou perder VIEW_CHANNEL muda a lista de canais na hora
          if (useGuilds.getState().activeGuildId === guildId) {
            void useChannels.getState().loadForGuild(guildId);
          }
        },
      ),
      on<Guild>(WS_EVENTS.GUILD_UPDATED, (guild) => {
        useGuilds.getState().handleGuildUpdated(guild);
      }),
      on<GuildOwnerChangedEvent>(
        WS_EVENTS.GUILD_OWNER_CHANGED,
        ({ guildId, ownerId, previousOwnerId }) => {
          useGuilds.getState().handleOwnerChanged(guildId, ownerId);
          if (ownerId === currentUserId) ui.toast("Você agora é o dono deste servidor.");
          else if (previousOwnerId === currentUserId) {
            ui.toast("Você transferiu a posse do servidor.");
          }
        },
      ),
      // ── b-canais: categorias e estados de voz ──
      on<Category>(WS_EVENTS.CATEGORY_CREATED, (category) => {
        useCategories.getState().handleCreated(category);
      }),
      on<Category>(WS_EVENTS.CATEGORY_UPDATED, (category) => {
        useCategories.getState().handleUpdated(category);
      }),
      on<CategoryDeletedEvent>(WS_EVENTS.CATEGORY_DELETED, ({ categoryId }) => {
        useCategories.getState().handleDeleted(categoryId);
      }),
      // ── a-mensagens ──
      on<MessagePinnedEvent>(WS_EVENTS.MESSAGE_PINNED, (event) => {
        usePins.getState().handlePinned(event);
      }),
      on<MessageUnpinnedEvent>(WS_EVENTS.MESSAGE_UNPINNED, (event) => {
        usePins.getState().handleUnpinned(event);
      }),
      on<ThreadUpdatedEvent>(WS_EVENTS.THREAD_UPDATED, (event) => {
        useThreads.getState().handleUpdated(event);
      }),

      // ── e-configuracoes ── preferências de notificação (nível e silêncio)
      on<NotificationSetting>(WS_EVENTS.NOTIFICATION_UPDATED, (setting) => {
        useNotifications.getState().apply(setting);
      }),

      // ── d-social ── amigos, pedidos e bloqueio ao vivo
      on<FriendRequestEvent>(WS_EVENTS.FRIEND_REQUEST, ({ request }) => {
        useFriends.getState().handleRequest(request);
        ui.toast(`${displayNameOf(request.user)} mandou um pedido de amizade.`);
      }),
      on<FriendAcceptedEvent>(WS_EVENTS.FRIEND_ACCEPTED, ({ user }) => {
        useFriends.getState().handleAccepted(user);
        ui.toast(`Você e ${displayNameOf(user)} agora são amigos.`);
      }),
      on<FriendRemovedEvent>(WS_EVENTS.FRIEND_REMOVED, ({ userId }) => {
        useFriends.getState().handleRemoved(userId);
      }),
      on<UserBlockedEvent>(WS_EVENTS.USER_BLOCKED, () => {
        // o bloqueio muda listas e o que a timeline esconde: recarrega tudo
        void useFriends.getState().load(true);
      }),

      // ── g-emojis-midia ──
      on<EmojiUpdatedEvent>(WS_EVENTS.EMOJI_UPDATED, ({ guildId, emojis }) => {
        useEmojis.getState().applyEmojis(guildId, emojis);
      }),
      on<StickerUpdatedEvent>(WS_EVENTS.STICKER_UPDATED, ({ guildId, stickers }) => {
        useEmojis.getState().applyStickers(guildId, stickers);
      }),

      // ── h-moderacao ──
      on<MessagesBulkDeletedEvent>(WS_EVENTS.MESSAGES_BULK_DELETED, ({ channelId, messageIds }) => {
        // reaproveita o caminho de uma mensagem só: a timeline já sabe remover
        for (const messageId of messageIds) {
          useMessages.getState().handleDeleted({ messageId, channelId, parentId: null });
        }
      }),

      on<PollUpdatedEvent>(WS_EVENTS.POLL_UPDATED, ({ poll }) => {
        usePolls.getState().handleUpdated(poll);
      }),

      on<ReportView>(WS_EVENTS.REPORT_CREATED, (report) => {
        useModeration.getState().handleReportCreated(report);
        ui.toast("Nova denúncia no servidor.", "error");
      }),

      on<GuildSettingsUpdatedEvent>(WS_EVENTS.GUILD_SETTINGS_UPDATED, ({ guildId }) => {
        // regras/boas-vindas podem ter mudado para mim
        if (useGuilds.getState().activeGuildId === guildId) {
          void useModeration.getState().loadMembership(guildId);
        }
      }),

      onReconnect(() => {
        rejoinChannel();
        void useMessages.getState().resyncActive();
        void useGuilds.getState().load();
        void useDMs.getState().refreshList();
        const guildId = useGuilds.getState().activeGuildId;
        if (guildId) void usePermissions.getState().load(guildId);
        // quem estava na voz pode ter entrado/saído durante a queda: recarrega
        // o servidor ativo e a sala em que estou, e troca tudo de uma vez —
        // zerar antes da resposta esvaziava o palco da chamada em conversa
        void useVoice.getState().recarregarAposReconexao(guildId);
        // e **eu** preciso reentrar: o gateway perdeu meu `voiceChannelId` com
        // o socket antigo e está contando a carência para me tirar da chamada.
        // Antes daqui só as salas de texto reentravam, e a call caía sozinha.
        void useVoice.getState().rejoinAposReconexao();
        const guildDeCategorias = useCategories.getState().guildId;
        if (guildDeCategorias) void useCategories.getState().loadForGuild(guildDeCategorias);
        // amigos, pedidos e bloqueios podem ter mudado durante a queda
        void useFriends.getState().load(true);
        // emoji/figurinha podem ter mudado enquanto a conexão esteve fora
        void useEmojis.getState().load();
      }),
      // ── f-voz ──
      // estado de voz e chamada em DM: a store decide o que fazer, aqui só
      // repassamos (o `voice.state` chega para qualquer canal visível)
      on<VoiceStateEvent>(WS_EVENTS.VOICE_STATE, (evento) => {
        useVoice.getState().applyState(evento);
      }),
      // voz em um lugar só: a conta entrou de outro aparelho e esta conexão sai
      on<VoiceEvictedEvent>(WS_EVENTS.VOICE_EVICTED, (evento) => {
        useVoice.getState().expulsoDaVoz(evento);
      }),

      on<CallRingEvent>(WS_EVENTS.CALL_RING, (evento) => {
        useVoice.getState().handleRing(evento);
      }),

      on<CallEndedEvent>(WS_EVENTS.CALL_ENDED, (evento) => {
        useVoice.getState().handleEnded(evento);
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
  // menção = `@usuario`, um cargo meu (`<@&id>`) ou resposta a mim com o
  // "@ ligado" — a regra é a do contrato, a mesma que a API conta
  const meusCargos =
    useGuilds.getState().members.find((m) => m.user.id === me?.id)?.roleIds ?? [];
  const mention = !mine && !!me && mentionsMe(message, { ...me, roleIds: meusCargos });
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
  // ── e-configuracoes ── contador de menções no ícone do app
  atualizarContadorNoIcone();
}

/** Soma as menções visíveis e escreve no ícone (quando o usuário quer). */
function atualizarContadorNoIcone() {
  if (!useSettings.getState().badgeCount) {
    void definirContadorNoIcone(0);
    return;
  }
  const servidores = useGuilds.getState().guilds.reduce((total, g) => total + g.mentionCount, 0);
  const conversas = useDMs.getState().channels.reduce((total, d) => total + d.mentionCount, 0);
  void definirContadorNoIcone(servidores + conversas);
}

/** Título para a notificação: `#canal` no servidor, nome da conversa em DM. */
function channelTitle(channelId: string): string {
  const dm = useDMs.getState().channels.find((d) => d.id === channelId);
  if (dm) return dmTitle(dm);
  const channel = useChannels.getState().channels.find((c) => c.id === channelId);
  return `#${channel?.name ?? "canal"}`;
}

/**
 * Notifica só o que o usuário perderia: mensagem de outro, fora da tela — e
 * que as preferências dele deixam passar.
 *
 * ── e-configuracoes ──
 * A ordem das perguntas importa: primeiro o nível efetivo do canal (canal >
 * servidor > padrão global, com silêncio zerando tudo), depois o "não
 * perturbe", e só então a regra antiga de "estou olhando para isso?".
 */
function notifyIfAway(message: Message, mention: boolean) {
  if (typeof document === "undefined") return;

  const prefs = useSettings.getState();
  const me = useAuth.getState().user;
  const naoPerturbe = prefs.dndSilencesAll && me?.status === "DND";
  const nivel = levelForChannel(message.channelId, message.guildId);
  if (!shouldNotifyMessage(nivel, mention, naoPerturbe)) return;

  // dentro do app, só menção e DM avisam; com a janela escondida, tudo avisa
  const escondida = document.visibilityState !== "visible";
  if (!escondida && !mention && message.guildId) return;

  // `notificationSound` é o interruptor mestre; `somLigado` diz se ESTE som toca
  if (prefs.notificationSound && somLigado("mensagem")) {
    tocarSomDeNotificacao(prefs.outputVolume / 100);
  }
  if (!prefs.desktopNotifications) return;
  void notify(channelTitle(message.channelId), `${displayNameOf(message.author)}: ${message.content}`);
}
