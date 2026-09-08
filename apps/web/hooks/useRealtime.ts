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
  type AccountUpdatedEvent,
  type Category,
  type CategoryDeletedEvent,
  type CategoryOverridesEvent,
  type ChannelReadEvent,
  type Channel,
  type ChannelDeletedEvent,
  type ChannelOverridesEvent,
  type EmojiUpdatedEvent,
  type FriendAcceptedEvent,
  type FriendRemovedEvent,
  type FriendRequestEvent,
  type Guild,
  type GuildJoinedEvent,
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
  type SessionsRevokedEvent,
  type SoundboardPlayEvent,
  type SoundboardUpdatedEvent,
  type StickerUpdatedEvent,
  type ThreadUpdatedEvent,
  type UserBlockedEvent,
  type VoiceEvictedEvent,
  type VoiceMovedEvent,
  type VoiceStateEvent,
} from "@streamz/shared";
import type { DMChannelView, NotificationSetting } from "@streamz/shared";
// ── h-moderacao ──
import type {
  GuildSettingsUpdatedEvent,
  MessagesBulkDeletedEvent,
  PollUpdatedEvent,
  ReportView,
} from "@streamz/shared";
import { shouldNotifyMessage } from "@streamz/shared";
import { definirContadorNoIcone, janelaTemFoco, notify, observarFoco, prepararNotificacoes } from "@/lib/desktop";
import {
  canalExibidoAgora,
  canalNaTela,
  type EstadoDaInterface,
} from "@/lib/na-tela";
import { tocarSomDeNotificacao } from "@/lib/notification-sound";
import { expirarSessao, sidDaSessaoAtual } from "@/lib/session";
import { levelForChannel, useNotifications } from "@/stores/notifications";
import { useConta } from "@/stores/conta";
import { useSettings } from "@/stores/settings";
import { useAuth } from "@/stores/auth";
import { useModeration } from "@/stores/moderation";
import { usePolls } from "@/stores/polls";
import { on, onReconnect, rejoinChannel } from "@/stores/socket-adapter";
import { useCategories } from "@/stores/categories";
import { useChannels } from "@/stores/channels";
import { useComandosDeApp } from "@/stores/comandos-de-app";
import { dmTitle, useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useEmojis } from "@/stores/emojis";
import { useSoundboard } from "@/stores/soundboard";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { goToChannel } from "@/stores/messages-navigate";
import { somarNaoLidas } from "@/stores/nao-lidas";
import { usePermissions } from "@/stores/permissions";
import { usePins } from "@/stores/messages-pins";
import { useThreads } from "@/stores/messages-threads";
import { usePresence } from "@/stores/presence";
import { useTyping } from "@/stores/typing";
import { useVoice } from "@/stores/voice";
import { ui, useUI } from "@/stores/ui";

/**
 * Único ponto de assinatura dos eventos do gateway.
 *
 * Os listeners entram uma vez e apenas repassam para a store dona do assunto,
 * que lê o estado na hora — sem closure velha nem janela sem ouvinte.
 *
 * O socket está em todas as salas que o usuário pode ver (o gateway faz isso
 * no connect), então `message.new` chega para qualquer canal: o do servidor
 * aberto, os dos outros servidores (rail) e as conversas. Cada um atualiza
 * seu "não lido"; o canal na tela, com a janela em foco, é marcado como lido
 * — e o que chegou nele enquanto a janela estava atrás de outro app é lido
 * quando ela volta ao foco.
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
    // desktop: permissão e clique da notificação resolvidos antes da primeira
    void prepararNotificacoes();
    // voltar ao app lê o canal que está na tela (o que chegou sem foco contou
    // como não lido e notificou, como no Discord)
    const pararDeObservarFoco = observarFoco((foco) => {
      if (foco) lerCanalNaTela();
    });

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
        // conversa: o evento **é** a visão atualizada dela (nome, ícone,
        // participantes, e a conversa reaberta que precisa entrar na coluna).
        // Recarregar a lista inteira aqui era uma volta ao servidor para
        // aplicar o que já estava no payload — e piscava a coluna.
        else useDMs.getState().handleUpdated(channel as DMChannelView);
      }),
      on<ChannelDeletedEvent>(WS_EVENTS.CHANNEL_DELETED, ({ channelId, guildId }) => {
        if (guildId) useChannels.getState().handleDeleted(channelId);
        else useDMs.getState().handleDeleted(channelId);
      }),

      /**
       * Li um canal em outra conexão da conta (abri a conversa no desktop, e
       * este é o site). Só o estado de leitura muda: badge apaga, nada navega.
       * O eco da própria leitura cai no mesmo estado — os aplicadores são
       * idempotentes (`stores/leitura`).
       */
      on<ChannelReadEvent>(WS_EVENTS.CHANNEL_READ, ({ channelIds, lastReadAt, guildId }) => {
        useDMs.getState().aplicarLeitura(channelIds, lastReadAt);
        useChannels.getState().aplicarLeitura(channelIds, lastReadAt);
        if (guildId) {
          // com os canais deste servidor na memória, o resumo do rail sai
          // deles; sem eles (servidor fechado, "marcar como lido" no menu), a
          // leitura foi de tudo que eu enxergo lá — o badge zera direto
          if (useChannels.getState().guildId === guildId) {
            useGuilds.getState().syncFromChannels(guildId);
          } else {
            useGuilds.getState().clearUnread(guildId);
          }
        } else if (useChannels.getState().guildId) {
          // lote sem servidor ("marcar tudo como lido") pode ter zerado canais
          // do servidor aberto
          useGuilds.getState().syncFromChannels(useChannels.getState().guildId!);
        }
        atualizarContadorNoIcone();
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

      /**
       * Entrei num servidor de outro lugar (o site enquanto o desktop está
       * aberto, outra aba, ou esta mesma sessão recebendo o próprio evento).
       * O rail atualiza sem F5; a tela de quem está lendo outra coisa não se
       * mexe — quem entrou pelo próprio aparelho já foi levado ao servidor por
       * `entrarPorConvite`.
       */
      on<GuildJoinedEvent>(WS_EVENTS.GUILD_JOINED, ({ guild }) => {
        useGuilds.getState().handleJoined(guild);
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
      on<CategoryOverridesEvent>(WS_EVENTS.CATEGORY_OVERRIDES, (evento) => {
        usePermissions.getState().handleCategoryOverrides(evento);
        // canal sincronizado herda daqui: ganhar ou perder VIEW_CHANNEL na
        // categoria muda a lista de canais na hora, como no override de canal
        if (useGuilds.getState().activeGuildId === evento.guildId) {
          void useChannels.getState().loadForGuild(evento.guildId);
        }
      }),
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
      on<FriendRequestEvent>(WS_EVENTS.FRIEND_REQUEST, ({ request, direcao }) => {
        useFriends.getState().handleRequest(request, direcao);
        // o pedido que **eu** mandei de outro aparelho só atualiza a aba
        // "Enviados": avisar "fulano mandou um pedido" seria mentira
        if (direcao === "incoming") {
          ui.toast(`${displayNameOf(request.user)} mandou um pedido de amizade.`);
        }
      }),
      on<FriendAcceptedEvent>(WS_EVENTS.FRIEND_ACCEPTED, ({ user }) => {
        useFriends.getState().handleAccepted(user);
        ui.toast(`Você e ${displayNameOf(user)} agora são amigos.`);
        // amigo novo ganha conversa no topo da coluna, dos dois lados
        void useDMs.getState().garantirNaLista(user.id);
      }),
      on<FriendRemovedEvent>(WS_EVENTS.FRIEND_REMOVED, ({ userId }) => {
        useFriends.getState().handleRemoved(userId);
      }),
      on<UserBlockedEvent>(WS_EVENTS.USER_BLOCKED, ({ user, blocked }) => {
        // o evento traz a pessoa: as quatro listas mudam pelo delta, sem uma
        // volta ao `GET /friends` (é o que a timeline lê para colapsar)
        useFriends.getState().handleBlocked(user, blocked);
      }),

      // ── g-emojis-midia ──
      on<EmojiUpdatedEvent>(WS_EVENTS.EMOJI_UPDATED, ({ guildId, emojis }) => {
        useEmojis.getState().applyEmojis(guildId, emojis);
      }),
      on<StickerUpdatedEvent>(WS_EVENTS.STICKER_UPDATED, ({ guildId, stickers }) => {
        useEmojis.getState().applyStickers(guildId, stickers);
      }),

      // ── painel de efeitos sonoros ──
      on<SoundboardUpdatedEvent>(WS_EVENTS.SOUNDBOARD_UPDATED, ({ guildId, sounds }) => {
        useSoundboard.getState().aplicar(guildId, sounds);
      }),

      /**
       * Alguém apertou um som na chamada — **este é o "tocar para todos"**.
       *
       * O evento só chega para quem está no canal de voz (a API o manda para a
       * lista de quem está na sala, não para o servidor inteiro), e cada cliente
       * toca o arquivo **localmente**, no volume de efeitos que a pessoa
       * escolheu. Nada disso passa pelo LiveKit: o áudio não entra na faixa de
       * microfone de ninguém.
       *
       * Vale inclusive para quem apertou: assim o autor ouve junto com a sala,
       * e não adiantado — e não ouve nada quando a API recusa.
       */
      on<SoundboardPlayEvent>(WS_EVENTS.SOUNDBOARD_PLAY, ({ sound }) => {
        useSoundboard.getState().tocarLocalmente(sound);
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

      // ── i-conta ── e-mail, verificação e 2FA valem para a conta inteira
      on<AccountUpdatedEvent>(WS_EVENTS.ACCOUNT_UPDATED, ({ account }) => {
        useConta.getState().aplicar(account);
      }),

      /**
       * "Sair desta sessão" (ou o fim da conta): as conexões atingidas caem
       * para o login na hora, em vez de continuarem vivas até o access token
       * vencer. O evento vai para todas as conexões da conta e cada uma se
       * reconhece pelo `sid` do próprio token — quem não está na lista fica.
       */
      on<SessionsRevokedEvent>(WS_EVENTS.SESSIONS_REVOKED, ({ all, sessionIds }) => {
        const meu = sidDaSessaoAtual();
        if (all || (meu && sessionIds.includes(meu))) expirarSessao();
      }),

      /**
       * ── j-bots ── um bot rodou o `deploy-commands.js`: os comandos de barra
       * daquele servidor mudaram. O evento traz só o `guildId` — a lista mesmo
       * vem por REST, e só para quem está com aquele servidor aberto.
       */
      on<{ guildId: string }>(WS_EVENTS.APPLICATION_COMMANDS_UPDATED, ({ guildId }) => {
        useComandosDeApp.getState().aplicarAtualizacao(guildId);
      }),

      onReconnect(() => {
        rejoinChannel();
        void useMessages.getState().resyncActive();
        void useGuilds.getState().load();
        void useDMs.getState().refreshList();
        const guildId = useGuilds.getState().activeGuildId;
        if (guildId) void usePermissions.getState().load(guildId);
        // j-bots: um bot pode ter registrado comandos durante a queda
        if (guildId) void useComandosDeApp.getState().loadForGuild(guildId);
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
        // e os sons do painel, que mudam pelo mesmo tipo de evento
        void useSoundboard.getState().load();
        // silenciar um canal/servidor no outro aparelho durante a queda
        void useNotifications.getState().load();
        // e a conta (e-mail verificado, 2FA), quando alguma tela a mostra
        if (useConta.getState().conta) void useConta.getState().carregar();
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
      // fui arrastado para outro canal de voz por quem tem "mover membros":
      // o estado no servidor já mudou; aqui só a sala do LiveKit acompanha
      on<VoiceMovedEvent>(WS_EVENTS.VOICE_MOVED, (evento) => {
        void useVoice.getState().movidoDeCanal(evento);
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
      pararDeObservarFoco();
    };
  }, [currentUserId]);
}

/**
 * O recorte das stores que diz o que a interface está mostrando agora.
 *
 * `useMessages.activeChannelId` **não** entra: a sala de uma conversa é
 * `sticky` e continua aberta depois que se sai dela (ver `lib/na-tela.ts`).
 */
function estadoDaInterface(): EstadoDaInterface {
  const channels = useChannels.getState();
  return {
    view: useUI.getState().view,
    amigosAberta: useFriends.getState().open,
    dmAtiva: useDMs.getState().activeId,
    canalAtivo: channels.activeChannelId,
    guildDosCanais: channels.guildId,
  };
}

/** A janela está visível e com foco? */
function estadoDaJanela() {
  return {
    visivel: typeof document === "undefined" || document.visibilityState === "visible",
    comFoco: janelaTemFoco(),
  };
}

/** Marca como lido o canal que está na tela (servidor ou conversa). */
function lerCanalNaTela() {
  const canal = canalExibidoAgora(estadoDaInterface());
  if (!canal) return;
  if (!canal.guildId) {
    const dms = useDMs.getState();
    if (dms.channels.some((d) => d.id === canal.channelId)) void dms.markRead(canal.channelId);
    return;
  }
  const channels = useChannels.getState();
  if (channels.channels.some((c) => c.id === canal.channelId)) {
    void channels.markRead(canal.channelId);
    useGuilds.getState().syncFromChannels(canal.guildId);
  }
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
  // "na tela" = a interface está **mostrando** este canal (modo de visão,
  // página Amigos, conversa/canal selecionado — ver `lib/na-tela.ts`) numa
  // janela visível **e com foco**: atrás de outro app, ou com a conversa
  // apenas "aberta por baixo", a mensagem conta como não lida e notifica,
  // como no Discord
  const naTela = canalNaTela(
    { channelId: message.channelId, guildId: message.guildId },
    estadoDaInterface(),
    estadoDaJanela(),
  );

  if (message.guildId) {
    const channels = useChannels.getState();
    if (channels.guildId === message.guildId) {
      channels.bumpUnread(message.channelId, message.createdAt, mention, mine);
      if (naTela) void channels.markRead(message.channelId);
      useGuilds.getState().syncFromChannels(message.guildId);
    } else if (!mine) {
      useGuilds.getState().bumpUnread(message.guildId, mention);
    }
  } else {
    const dms = useDMs.getState();
    if (dms.channels.some((d) => d.id === message.channelId)) {
      dms.bumpUnread(message.channelId, message.createdAt, mention, mine);
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

/**
 * Escreve no ícone o que o Discord escreve: menções nos servidores + toda
 * mensagem não lida nas conversas (quando o usuário quer).
 */
function atualizarContadorNoIcone() {
  if (!useSettings.getState().badgeCount) {
    void definirContadorNoIcone(0);
    return;
  }
  const servidores = useGuilds.getState().guilds.reduce((total, g) => total + g.mentionCount, 0);
  const conversas = somarNaoLidas(useDMs.getState().channels);
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
 *
 * O gate de "estou olhando" é o **foco** da janela, não a visibilidade: no
 * desktop a janela aberta atrás de outro app continua `visible`, e com o gate
 * antigo mensagem de servidor nunca notificava. Com foco, só menção e DM
 * avisam; sem foco (outro app na frente, minimizada, bandeja), tudo avisa.
 */
function notifyIfAway(message: Message, mention: boolean) {
  if (typeof document === "undefined") return;

  const prefs = useSettings.getState();
  const me = useAuth.getState().user;
  const naoPerturbe = prefs.dndSilencesAll && me?.status === "DND";
  const nivel = levelForChannel(message.channelId, message.guildId);
  if (!shouldNotifyMessage(nivel, mention, naoPerturbe)) return;

  const semFoco = document.visibilityState !== "visible" || !janelaTemFoco();
  if (!semFoco && !mention && message.guildId) return;

  // interruptor mestre, interruptor deste som, volume e a guarda contra o mesmo
  // som sobreposto em menos de 300 ms: tudo dentro (`lib/ringtone.ts`)
  tocarSomDeNotificacao();
  if (!prefs.desktopNotifications) return;
  const { guildId, channelId } = message;
  void notify({
    title: channelTitle(channelId),
    body: `${displayNameOf(message.author)}: ${message.content}`,
    // o clique já focou a janela (`focarJanela`); falta abrir a conversa
    onClick: () => void goToChannel({ guildId, channelId }),
  });
}
