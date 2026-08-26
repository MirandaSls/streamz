"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { isSystemMessage, type Message } from "@streamz/shared";
import MessageItem from "@/components/MessageItem";
import BlockedMessages from "@/components/chat/BlockedMessages";
import SystemMessageItem from "@/components/chat/SystemMessageItem";
import { useStickyScroll } from "@/hooks/useStickyScroll";
import { continuaAnterior, mesmoDia, rotuloDoDia } from "@/lib/format";
import { agruparBloqueadas, primeiraDoBloco } from "@/lib/timeline";
import { useBlockedIds } from "@/stores/friends";
import type { ChatMessage } from "@/stores/messages-core";

/** Linha com a data entre dois dias de conversa. */
function DateDivider({ iso }: { iso: string }) {
  return (
    <div role="separator" className="mx-4 mt-6 mb-2 flex items-center">
      <span className="h-px flex-1 bg-border" />
      <span className="px-1 text-xs font-semibold text-txt-muted">{rotuloDoDia(iso)}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export interface Welcome {
  icon: ReactNode;
  title: string;
  description: string;
}

/**
 * Área rolável de mensagens, com paginação para trás, aviso de novidade,
 * agrupamento por autor (Discord: 7 min), divisores de data e o cabeçalho de
 * "início do canal" quando não há mais histórico.
 */
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
  scrollToId,
  emptyText,
  welcome,
  firstSeparator,
  className = "pb-4",
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
  /** mensagem a trazer para a tela (o "ir para" de fixadas, busca e menções). */
  scrollToId?: string | null;
  emptyText: string;
  /** cabeçalho do início do canal ("Bem-vindo a #geral!"). */
  welcome?: Welcome;
  /** separador exibido logo após a primeira mensagem (usado na thread). */
  firstSeparator?: ReactNode;
  className?: string;
}) {
  const { scrollRef, handleScroll, showJump, jumpToLatest } = useStickyScroll(items, {
    canLoadOlder: hasMore && !loadingOlder && Boolean(onLoadOlder),
    onReachTop: onLoadOlder,
  });
  // ── d-social ── mensagens de quem eu bloqueei viram um bloco recolhido
  const bloqueados = useBlockedIds();

  // o "ir para a mensagem" corre depois do layout da lista (useLayoutEffect da
  // rolagem grudenta), então este efeito é quem tem a última palavra na posição
  useEffect(() => {
    if (!scrollToId) return;
    const el = document.getElementById(`mensagem-${scrollToId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollToId, items]);

  const atStart = !hasMore && !loading;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className={`flex-1 overflow-y-auto ${className}`}>
        {loadingOlder && (
          <div className="py-2 text-center text-xs text-txt-muted">Carregando…</div>
        )}

        {atStart && welcome && (
          <div className="mx-4 mt-4 mb-2">
            <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-border text-txt-primary">
              {welcome.icon}
            </div>
            <h2 className="mt-3 text-[32px] font-bold leading-10 text-txt-primary">{welcome.title}</h2>
            <p className="text-txt-muted">{welcome.description}</p>
          </div>
        )}

        {loading && items.length === 0 && (
          <div className="py-6 text-center text-sm text-txt-muted">Carregando…</div>
        )}
        {!loading && items.length === 0 && !welcome && (
          <div className="py-6 text-center text-sm text-txt-muted">{emptyText}</div>
        )}

        {agruparBloqueadas(items, bloqueados).map((bloco, index) => {
          const primeira = primeiraDoBloco(bloco);
          const anterior = bloco.anterior;
          const novoDia = !anterior || !mesmoDia(anterior.createdAt, primeira.createdAt);
          return (
            <div key={primeira.id}>
              {novoDia && (atStart || anterior) && <DateDivider iso={primeira.createdAt} />}

              {bloco.kind === "bloqueadas" ? (
                <BlockedMessages
                  items={bloco.items}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleReaction={onToggleReaction}
                />
              ) : isSystemMessage(bloco.message) ? (
                <SystemMessageItem message={bloco.message} />
              ) : (
                <MessageItem
                  message={bloco.message}
                  grouped={!novoDia && continuaAnterior(anterior, bloco.message)}
                  currentUserId={currentUserId}
                  canModerate={canModerate}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleReaction={onToggleReaction}
                  onOpenThread={onOpenThread}
                  onRetry={onRetry}
                  onDiscard={onDiscard}
                />
              )}

              {index === 0 && firstSeparator}
            </div>
          );
        })}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-ink shadow-high hover:bg-accent-hover"
        >
          <ArrowDown size={14} aria-hidden="true" />
          Mensagens novas
        </button>
      )}
    </div>
  );
}
