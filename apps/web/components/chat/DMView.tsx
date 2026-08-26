"use client";

import { Phone, Users, Video } from "lucide-react";
import { isGroupChannel } from "@newdisc/shared";
import Composer from "@/components/chat/Composer";
import HeaderBar, { HeaderIcon } from "@/components/chat/HeaderBar";
import MessageList from "@/components/chat/MessageList";
import PinsPopover from "@/components/chat/PinsPopover";
import ReplyBar from "@/components/chat/ReplyBar";
import SearchPanel from "@/components/chat/SearchPanel";
import ThreadsPopover from "@/components/chat/ThreadsPopover";
import TypingIndicator from "@/components/chat/TypingIndicator";
import Avatar from "@/components/ui/Avatar";
import CallBanner from "@/components/voice/CallBanner";
import { useAuth } from "@/stores/auth";
import { dmTitle, useActiveDM } from "@/stores/dms";
import { useActiveSlice, useMessages } from "@/stores/messages";
import { resolveStatus, usePresence } from "@/stores/presence";
import { useVoice } from "@/stores/voice";

/**
 * Coluna 3 no modo DM: conversa aberta.
 *
 * É a mesma timeline do canal de servidor (`ChatView`) — a conversa é um canal
 * — só muda o cabeçalho e o fato de não haver moderação: em DM só o autor apaga.
 */
export default function DMView() {
  const user = useAuth((s) => s.user);
  const active = useActiveDM();
  const slice = useActiveSlice();
  const statuses = usePresence((s) => s.statuses);
  const startCall = useVoice((s) => s.startCall);
  const naChamada = useVoice((s) => s.channelId);

  const searchQuery = useMessages((s) => s.searchQuery);
  const setSearchQuery = useMessages((s) => s.setSearchQuery);
  const runSearch = useMessages((s) => s.runSearch);
  const highlightId = useMessages((s) => s.highlightId);
  const loadOlder = useMessages((s) => s.loadOlder);
  const send = useMessages((s) => s.send);
  const edit = useMessages((s) => s.edit);
  const remove = useMessages((s) => s.remove);
  const toggleReaction = useMessages((s) => s.toggleReaction);
  const openThread = useMessages((s) => s.openThread);
  const retry = useMessages((s) => s.retry);
  const discard = useMessages((s) => s.discard);

  if (!active) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center bg-chat text-txt-muted">
        Selecione uma conversa
      </main>
    );
  }

  const title = dmTitle(active);
  const group = isGroupChannel(active);
  const other = !group ? active.others[0] : undefined;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-chat">
      <HeaderBar
        icon={
          other ? (
            <Avatar user={other} size="sm" status={resolveStatus(statuses, other)} surface="border-chat" />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-white">
              <Users size={14} />
            </span>
          )
        }
        title={title}
        searchLabel={`Buscar mensagens em ${title}`}
        searchValue={searchQuery}
        onSearch={(q) => {
          setSearchQuery(q);
          // conversa não tem servidor: a busca corre só neste canal
          void runSearch({ channelId: active.id, guildId: null });
        }}
        pins={
          // em conversa direta não há moderação: qualquer participante fixa
          <PinsPopover channelId={active.id} guildId={null} canPin />
        }
        tools={
          <>
            <ThreadsPopover channelId={active.id} canManage={false} />
            <HeaderIcon
              label="Iniciar chamada de voz"
              active={naChamada === active.id}
              onClick={() => void startCall(active.id, false)}
            >
              <Phone size={24} />
            </HeaderIcon>
            <HeaderIcon
              label="Iniciar chamada de vídeo"
              onClick={() => void startCall(active.id, true)}
            >
              <Video size={24} />
            </HeaderIcon>
          </>
        }
      />

      {/* f-voz: barra da chamada em andamento, com quem já está nela */}
      <CallBanner channelId={active.id} />

      {/* conversa não tem servidor: a busca corre só neste canal */}
      <SearchPanel guildId={null} />

      <MessageList
        // remonta a cada conversa para zerar a rolagem e os marcadores de posição
        key={`lista-${active.id}`}
        items={slice.items}
        hasMore={slice.hasMore}
        loading={slice.loading}
        loadingOlder={slice.loadingOlder}
        onLoadOlder={() => void loadOlder(active.id)}
        currentUserId={user?.id}
        canModerate={false}
        onEdit={edit}
        onDelete={(id) => void remove(id)}
        onToggleReaction={(id, emoji) => toggleReaction(id, emoji, user?.id)}
        onOpenThread={(message) => void openThread(active.id, message)}
        onRetry={retry}
        onDiscard={discard}
        scrollToId={highlightId}
        emptyText="Nenhuma mensagem ainda. Diga um oi."
        welcome={{
          icon: other ? <Avatar user={other} size="xl" /> : <Users size={42} />,
          title,
          description: other
            ? `Este é o início do seu histórico de mensagens diretas com @${other.username}.`
            : `Bem-vindo ao início do grupo ${title}.`,
        }}
      />

      {user && (
        <>
          <ReplyBar channelId={active.id} />
          <Composer
            key={`composer-${active.id}`}
            channelId={active.id}
            allowAttachments
            placeholder={`Conversar em ${group ? title : `@${title}`}`}
            ariaLabel={`Mensagem para ${title}`}
            onSend={(content, attachments) =>
              send({ channelId: active.id, author: user, content, attachments })
            }
          />
        </>
      )}
      <TypingIndicator channelId={active.id} />
    </main>
  );
}
