"use client";

import Composer from "@/components/chat/Composer";
import MessageList from "@/components/chat/MessageList";
import { useAuth } from "@/stores/auth";
import { useCanModerate } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";

/** Coluna 4 quando há thread aberta: a raiz, as respostas e o campo de resposta. */
export default function ThreadPanel({ channelId }: { channelId: string }) {
  const user = useAuth((s) => s.user);
  const canModerate = useCanModerate(user?.id);

  const parentId = useMessages((s) => s.threadParentId);
  const items = useMessages((s) => s.threadItems);
  const loading = useMessages((s) => s.threadLoading);
  const closeThread = useMessages((s) => s.closeThread);
  const send = useMessages((s) => s.send);
  const edit = useMessages((s) => s.edit);
  const remove = useMessages((s) => s.remove);
  const toggleReaction = useMessages((s) => s.toggleReaction);
  const retry = useMessages((s) => s.retry);
  const discard = useMessages((s) => s.discard);

  if (!parentId) return null;
  const replies = Math.max(0, items.length - 1);

  return (
    <aside
      aria-label="Thread"
      className="flex w-[22rem] shrink-0 flex-col border-l border-black/20 bg-panel"
    >
      <div className="flex items-center justify-between border-b border-black/20 px-4 py-3">
        <span className="font-semibold">Thread</span>
        <button
          type="button"
          onClick={closeThread}
          aria-label="Fechar thread"
          title="Fechar thread"
          className="text-neutral-400 transition hover:text-white"
        >
          ✕
        </button>
      </div>

      <MessageList
        key={parentId}
        items={items}
        hasMore={false}
        loading={loading}
        currentUserId={user?.id}
        canModerate={canModerate}
        onEdit={edit}
        onDelete={(id) => void remove(id)}
        onToggleReaction={(id, emoji) => toggleReaction(id, emoji, user?.id)}
        onRetry={retry}
        onDiscard={discard}
        emptyText="Thread vazia."
        className="px-2 py-3"
        firstSeparator={
          <div className="my-2 flex items-center gap-2 px-2 text-xs text-neutral-500">
            <span className="h-px flex-1 bg-black/20" />
            {replies} {replies === 1 ? "resposta" : "respostas"}
            <span className="h-px flex-1 bg-black/20" />
          </div>
        }
      />

      {user && (
        <Composer
          key={parentId}
          compact
          placeholder="Responder na thread…"
          ariaLabel="Responder na thread"
          onSend={(content) => send({ channelId, author: user, content, parentId })}
        />
      )}
    </aside>
  );
}
