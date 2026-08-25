"use client";

import type { ReactNode } from "react";
import type { Message } from "@newdisc/shared";
import MessageItem from "@/components/MessageItem";
import { useStickyScroll } from "@/hooks/useStickyScroll";
import type { ChatMessage } from "@/stores/messages-core";

/** Área rolável de mensagens, com paginação para trás e aviso de novidade. */
export default function MessageList({
  items,
  hasMore,
  loading,
  loadingOlder,
  onLoadOlder,
  currentUserId,
  canModerate,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenThread,
  onRetry,
  onDiscard,
  emptyText,
  firstSeparator,
  className = "px-4 py-3",
}: {
  items: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  currentUserId?: string;
  canModerate?: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onOpenThread?: (message: Message) => void;
  onRetry?: (nonce: string) => void;
  onDiscard?: (nonce: string) => void;
  emptyText: string;
  /** separador exibido logo após a primeira mensagem (usado na thread). */
  firstSeparator?: ReactNode;
  className?: string;
}) {
  const { scrollRef, handleScroll, showJump, jumpToLatest } = useStickyScroll(items, {
    canLoadOlder: hasMore && !loadingOlder && Boolean(onLoadOlder),
    onReachTop: onLoadOlder,
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto ${className}`}
      >
        {loadingOlder && (
          <div className="mb-2 text-center text-xs text-neutral-600">Carregando…</div>
        )}
        {!hasMore && items.length > 0 && (
          <div className="mb-2 text-center text-xs text-neutral-600">
            — início da conversa —
          </div>
        )}
        {loading && items.length === 0 && (
          <div className="py-6 text-center text-sm text-neutral-500">Carregando…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="py-6 text-center text-sm text-neutral-500">{emptyText}</div>
        )}

        {items.map((message, index) => (
          <div key={message.id}>
            <MessageItem
              message={message}
              currentUserId={currentUserId}
              canModerate={canModerate}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleReaction={onToggleReaction}
              onOpenThread={onOpenThread}
              onRetry={onRetry}
              onDiscard={onDiscard}
            />
            {index === 0 && firstSeparator}
          </div>
        ))}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white shadow-lg"
        >
          ↓ Mensagens novas
        </button>
      )}
    </div>
  );
}
