"use client";

import { useState } from "react";
import { ShieldOff } from "lucide-react";
import MessageItem from "@/components/MessageItem";
import type { ChatMessage } from "@/stores/messages-core";

/**
 * Bloco recolhido de mensagens de quem eu bloqueei — o "1 mensagem bloqueada"
 * do Discord.
 *
 * Recolher em vez de apagar é deliberado: a conversa não fica com buracos (o
 * "respondendo ao quê?" some junto), mas o conteúdo só aparece se eu pedir.
 * O servidor continua entregando as mensagens; o bloqueio é uma decisão de
 * *exibição* de quem bloqueou.
 */
export default function BlockedMessages({
  items,
  currentUserId,
  onEdit,
  onDelete,
  onToggleReaction,
}: {
  items: ChatMessage[];
  currentUserId?: string;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (items.length === 0) return null;

  const quantas = items.length;
  const rotulo = quantas === 1 ? "1 mensagem bloqueada" : `${quantas} mensagens bloqueadas`;

  return (
    <div className="mt-[17px]">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 py-0.5 pl-[72px] pr-12 text-sm text-txt-muted hover:bg-msghov hover:text-txt-normal"
      >
        <ShieldOff size={16} aria-hidden="true" className="-ml-9 shrink-0" />
        <span>{rotulo}</span>
        <span className="font-medium text-txt-link">{aberto ? "esconder" : "mostrar"}</span>
      </button>

      {aberto &&
        items.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleReaction={onToggleReaction}
          />
        ))}
    </div>
  );
}
