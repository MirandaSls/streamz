"use client";

import { Hash, Lock, Megaphone, Users } from "lucide-react";
import Composer from "@/components/chat/Composer";
import HeaderBar, { HeaderIcon } from "@/components/chat/HeaderBar";
import MessageList from "@/components/chat/MessageList";
import PinsPopover from "@/components/chat/PinsPopover";
import ReplyBar from "@/components/chat/ReplyBar";
import ThreadsPopover from "@/components/chat/ThreadsPopover";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { useAuth } from "@/stores/auth";
import { useActiveChannel } from "@/stores/channels";
import { useCanModerate } from "@/stores/guilds";
import { useActiveSlice, useMessages } from "@/stores/messages";
import { useUI } from "@/stores/ui";

/** Coluna 3 no modo servidor: cabeçalho, timeline e composer. */
export default function ChatView() {
  const user = useAuth((s) => s.user);
  const channel = useActiveChannel();
  const canModerate = useCanModerate(user?.id);
  const slice = useActiveSlice();
  const membersOpen = useUI((s) => s.membersOpen);
  const toggleMembers = useUI((s) => s.toggleMembers);

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

  if (!channel) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center bg-chat text-txt-muted">
        Escolha um canal
      </main>
    );
  }

  const readOnly = channel.readOnly && !canModerate;
  // canal de servidor sempre tem nome; o tipo é nullable por causa das DMs
  const name = channel.name ?? "canal";
  const Icon = channel.readOnly ? Megaphone : channel.private ? Lock : Hash;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-chat">
      <HeaderBar
        icon={<Icon size={24} />}
        title={name}
        searchLabel={`Buscar mensagens em ${name}`}
        searchValue={searchQuery}
        onSearch={(q) => {
          setSearchQuery(q);
          // no servidor a busca é do servidor inteiro, com `in:#canal` filtrando
          void runSearch({ channelId: channel.id, guildId: channel.guildId });
        }}
        pins={
          <PinsPopover channelId={channel.id} guildId={channel.guildId} canPin={canModerate} />
        }
        tools={
          <>
            <ThreadsPopover channelId={channel.id} canManage={canModerate} />
            <HeaderIcon label={membersOpen ? "Ocultar lista de membros" : "Mostrar lista de membros"} active={membersOpen} onClick={toggleMembers}>
              <Users size={24} />
            </HeaderIcon>
          </>
        }
      />

      <MessageList
        // remonta a cada canal para zerar a rolagem e os marcadores de posição
        key={`lista-${channel.id}`}
        items={slice.items}
        hasMore={slice.hasMore}
        loading={slice.loading}
        loadingOlder={slice.loadingOlder}
        onLoadOlder={() => void loadOlder(channel.id)}
        currentUserId={user?.id}
        canModerate={canModerate}
        onEdit={edit}
        onDelete={(id) => void remove(id)}
        onToggleReaction={(id, emoji) => toggleReaction(id, emoji, user?.id)}
        onOpenThread={(message) => void openThread(channel.id, message)}
        onRetry={retry}
        onDiscard={discard}
        scrollToId={highlightId}
        emptyText="Nenhuma mensagem ainda. Diga um oi."
        welcome={{
          icon: <Icon size={42} />,
          title: `Bem-vindo a #${name}!`,
          description: `Este é o início do canal #${name}.`,
        }}
      />

      {readOnly ? (
        <p className="mx-4 mb-6 rounded-lg bg-input px-4 py-3 text-center text-sm text-txt-muted">
          Você não tem permissão para enviar mensagens neste canal.
        </p>
      ) : (
        user && (
          <>
            <ReplyBar channelId={channel.id} />
            <Composer
              key={`composer-${channel.id}`}
              channelId={channel.id}
              allowAttachments
              placeholder={`Conversar em #${name}`}
              ariaLabel={`Mensagem para #${name}`}
              onSend={(content, attachments) =>
                send({ channelId: channel.id, guildId: channel.guildId, author: user, content, attachments })
              }
            />
          </>
        )
      )}
      <TypingIndicator channelId={channel.id} />
    </main>
  );
}
