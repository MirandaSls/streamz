"use client";

import Composer from "@/components/chat/Composer";
import MessageList from "@/components/chat/MessageList";
import SearchPanel from "@/components/chat/SearchPanel";
import { useAuth } from "@/stores/auth";
import { useActiveChannel } from "@/stores/channels";
import { useCanModerate } from "@/stores/guilds";
import { useActiveSlice, useMessages } from "@/stores/messages";

/** Coluna 3 no modo servidor: cabeçalho, busca, timeline e composer. */
export default function ChatView() {
  const user = useAuth((s) => s.user);
  const channel = useActiveChannel();
  const canModerate = useCanModerate(user?.id);
  const slice = useActiveSlice();

  const searchQuery = useMessages((s) => s.searchQuery);
  const setSearchQuery = useMessages((s) => s.setSearchQuery);
  const runSearch = useMessages((s) => s.runSearch);
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
      <main className="grid min-w-0 flex-1 place-items-center bg-chat text-neutral-500">
        Escolha um canal
      </main>
    );
  }

  const readOnly = channel.readOnly && !canModerate;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-chat">
      <header className="flex items-center justify-between gap-3 border-b border-black/20 px-4 py-3">
        <h1 className="truncate font-semibold"># {channel.name}</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(channel.id);
          }}
        >
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="search"
            aria-label={`Buscar mensagens em ${channel.name}`}
            placeholder="Buscar mensagens…"
            className="w-52 rounded bg-rail px-3 py-1 text-sm outline-none"
          />
        </form>
      </header>

      <SearchPanel />

      <MessageList
        // remonta a cada canal para zerar a rolagem e os marcadores de posição
        key={channel.id}
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
        emptyText="Nenhuma mensagem ainda. Diga um oi."
      />

      {readOnly ? (
        <p className="px-4 pb-4 text-center text-sm text-neutral-500">
          📢 Canal somente leitura
        </p>
      ) : (
        user && (
          <Composer
            key={channel.id}
            allowAttachments
            placeholder={`Conversar em #${channel.name}`}
            ariaLabel={`Mensagem para #${channel.name}`}
            onSend={(content, attachments) =>
              send({ channelId: channel.id, author: user, content, attachments })
            }
          />
        )
      )}
    </main>
  );
}
