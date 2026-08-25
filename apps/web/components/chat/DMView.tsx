"use client";

import { isGroupChannel } from "@newdisc/shared";
import Composer from "@/components/chat/Composer";
import MessageList from "@/components/chat/MessageList";
import SearchPanel from "@/components/chat/SearchPanel";
import { useAuth } from "@/stores/auth";
import { dmTitle, useActiveDM } from "@/stores/dms";
import { useActiveSlice, useMessages } from "@/stores/messages";

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

  if (!active) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center bg-chat text-neutral-500">
        Selecione uma conversa
      </main>
    );
  }

  const title = dmTitle(active);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-chat">
      <header className="flex items-center justify-between gap-3 border-b border-black/20 px-4 py-3">
        <h1 className="truncate font-semibold">
          <span aria-hidden="true">{isGroupChannel(active) ? "👥 " : "@ "}</span>
          {title}
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(active.id);
          }}
        >
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="search"
            aria-label={`Buscar mensagens em ${title}`}
            placeholder="Buscar mensagens…"
            className="w-52 rounded bg-rail px-3 py-1 text-sm outline-none"
          />
        </form>
      </header>

      <SearchPanel />

      <MessageList
        // remonta a cada conversa para zerar a rolagem e os marcadores de posição
        key={active.id}
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
        emptyText="Nenhuma mensagem ainda. Diga um oi."
      />

      {user && (
        <Composer
          key={active.id}
          allowAttachments
          placeholder={`Conversar em ${title}`}
          ariaLabel={`Mensagem para ${title}`}
          onSend={(content, attachments) =>
            send({ channelId: active.id, author: user, content, attachments })
          }
        />
      )}
    </main>
  );
}
