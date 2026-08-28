"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { isSystemMessage, type Message } from "@streamz/shared";
import MessageItem from "@/components/MessageItem";
import { continuaAnterior } from "@/lib/format";
import type { ChatMessage } from "@/stores/messages-core";

/**
 * Bloco recolhido de mensagens de quem eu bloqueei — o "1 mensagem bloqueada"
 * do Discord.
 *
 * Recolher em vez de apagar é deliberado: a conversa não fica com buracos (o
 * "respondendo ao quê?" some junto), mas o conteúdo só aparece se eu pedir.
 * O servidor continua entregando as mensagens; o bloqueio é uma decisão de
 * *exibição* de quem bloqueou.
 *
 * Ao abrir, as mensagens são desenhadas com o **mesmo agrupamento** da
 * timeline: sem isso, cinco mensagens seguidas do mesmo autor apareciam com
 * cinco avatares e cinco nomes, o que não acontece em lugar nenhum do app.
 */
export default function BlockedMessages({
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

  const quantas = items.length;
  const rotulo = quantas === 1 ? "1 mensagem bloqueada" : `${quantas} mensagens bloqueadas`;

  return (
    <div style={{ marginTop: "var(--espaco-entre-grupos, 17px)" }}>
      {/* o próprio rótulo é o botão, e o chevron gira ao abrir — o par
          "ícone de escudo + link mostrar/esconder" não existe no Discord */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 py-0.5 pl-[72px] pr-12 text-sm text-txt-muted hover:bg-msghov hover:text-txt-normal"
      >
        <ChevronRight
          size={16}
          aria-hidden="true"
          className={`-ml-9 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
        />
        <span>{rotulo}</span>
      </button>

      {aberto &&
        items.map((m, i) => {
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
