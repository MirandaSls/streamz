"use client";

import { useState } from "react";
import { isSystemMessage, type Message } from "@streamz/shared";
import MessageItem from "@/components/MessageItem";
import { continuaAnterior } from "@/lib/format";
import type { ChatMessage } from "@/stores/messages-core";

/**
 * Bloco recolhido de mensagens seguidas de quem eu ignorei — "1 mensagem
 * ignorada — Mostrar mensagem" do Discord (`docs/CONTRATO-MENUS.md` §4).
 *
 * Diferente de `BlockedMessages`: lá a linha inteira é o botão (chevron que
 * gira). Aqui o Discord separa o texto apagado do link — só a palavra
 * "Mostrar…" é clicável, o resto é rótulo — e não há ícone nem chevron.
 * "Expande só localmente": o clique não manda nada ao servidor nem grava
 * preferência nenhuma, é só o `useState` desta instância.
 */
export default function IgnoredMessages({
  items,
  currentUserId,
  canModerate,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenThread,
  onRetry,
  onDiscard,
}: {
  items: ChatMessage[];
  currentUserId?: string;
  canModerate?: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string, semConfirmar?: boolean) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onOpenThread?: (message: Message) => void;
  onRetry?: (nonce: string) => void;
  onDiscard?: (nonce: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (items.length === 0) return null;

  if (aberto) {
    return (
      <div style={{ marginTop: "var(--espaco-entre-grupos, 17px)" }}>
        {items.map((m, i) => {
          const anterior = i > 0 ? items[i - 1] : undefined;
          return (
            <MessageItem
              key={m.id}
              message={m}
              grouped={!!anterior && !isSystemMessage(anterior) && continuaAnterior(anterior, m)}
              currentUserId={currentUserId}
              canModerate={canModerate}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleReaction={onToggleReaction}
              onOpenThread={onOpenThread}
              onRetry={onRetry}
              onDiscard={onDiscard}
            />
          );
        })}
      </div>
    );
  }

  const quantas = items.length;
  const rotulo = quantas === 1 ? "1 mensagem ignorada" : `${quantas} mensagens ignoradas`;
  const acao = quantas === 1 ? "Mostrar mensagem" : "Mostrar mensagens";

  return (
    // mesma calha de `BlockedMessages` (pl-80/pr-6, x=80 = a calha do
    // conteúdo em `MessageItem.tsx`), mas sem chevron: aqui o clicável é só a
    // palavra "Mostrar…", texto cinza como o resto da linha.
    <div
      style={{ marginTop: "var(--espaco-entre-grupos, 17px)" }}
      className="flex items-center gap-1 py-0.5 pl-[80px] pr-6 text-text-sm text-text-muted"
    >
      <span>{rotulo} —</span>
      <button type="button" onClick={() => setAberto(true)} className="text-text-muted hover:text-text-default hover:underline">
        {acao}
      </button>
    </div>
  );
}
