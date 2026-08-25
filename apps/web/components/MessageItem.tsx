"use client";

import { useState } from "react";
import type { Attachment, Message } from "@newdisc/shared";
import { isImageAttachment } from "@newdisc/shared";

const QUICK_EMOJIS = ["👍", "❤️", "🔥", "😂", "🎉", "😢"];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentView({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-2">
      {attachments.map((a) =>
        isImageAttachment(a) ? (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="block w-fit"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.filename}
              width={a.width ?? undefined}
              height={a.height ?? undefined}
              className="max-h-80 max-w-md rounded-lg object-contain"
            />
          </a>
        ) : (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            download={a.filename}
            className="flex w-fit max-w-md items-center gap-3 rounded-lg bg-rail px-3 py-2 text-sm hover:brightness-110"
          >
            <span className="text-xl">📎</span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-accent">
                {a.filename}
              </span>
              <span className="text-xs text-neutral-500">{formatBytes(a.size)}</span>
            </span>
          </a>
        ),
      )}
    </div>
  );
}

export default function MessageItem({
  message,
  currentUserId,
  canModerate,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenThread,
}: {
  message: Message;
  currentUserId?: string;
  canModerate?: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  /** ausente dentro do painel de thread (não se responde a uma resposta). */
  onOpenThread?: (message: Message) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [picking, setPicking] = useState(false);

  const isOwn = message.author.id === currentUserId;
  const canDelete = isOwn || canModerate;

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (t && t !== message.content) onEdit(message.id, t);
    setEditing(false);
  }

  return (
    <div className="group relative mb-2 rounded px-2 py-1 hover:bg-black/10">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-white">{message.author.username}</span>
        <span className="text-xs text-neutral-500">
          {new Date(message.createdAt).toLocaleTimeString()}
          {message.editedAt && <span className="ml-1 italic">(editado)</span>}
        </span>
      </div>

      {editing ? (
        <form onSubmit={submitEdit} className="mt-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            className="w-full rounded bg-rail px-2 py-1 text-sm outline-none"
          />
          <div className="mt-1 text-xs text-neutral-500">
            Enter para salvar · Esc para cancelar
          </div>
        </form>
      ) : (
        message.content && <div className="text-neutral-200">{message.content}</div>
      )}

      {/* anexos (imagens inline / arquivos como card) */}
      <AttachmentView attachments={message.attachments} />

      {/* link para a thread (só em mensagens raiz com respostas) */}
      {onOpenThread && message.replyCount > 0 && (
        <button
          onClick={() => onOpenThread(message)}
          className="mt-1 text-xs font-medium text-accent hover:underline"
        >
          💬 {message.replyCount} {message.replyCount === 1 ? "resposta" : "respostas"}
        </button>
      )}

      {/* reações */}
      {message.reactions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {message.reactions.map((r) => {
            const mine = currentUserId ? r.userIds.includes(currentUserId) : false;
            return (
              <button
                key={r.emoji}
                onClick={() => onToggleReaction(message.id, r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                  mine
                    ? "border-accent bg-accent/20 text-white"
                    : "border-black/30 bg-black/20 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ações no hover */}
      <div className="absolute -top-3 right-2 hidden gap-1 rounded bg-rail px-1 py-0.5 shadow group-hover:flex">
        <button
          onClick={() => setPicking((p) => !p)}
          title="Reagir"
          className="px-1 text-sm hover:brightness-125"
        >
          😊
        </button>
        {onOpenThread && (
          <button
            onClick={() => onOpenThread(message)}
            title="Responder na thread"
            className="px-1 text-sm hover:brightness-125"
          >
            💬
          </button>
        )}
        {isOwn && (
          <button
            onClick={() => {
              setDraft(message.content);
              setEditing(true);
            }}
            title="Editar"
            className="px-1 text-sm hover:brightness-125"
          >
            ✏️
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(message.id)}
            title="Apagar"
            className="px-1 text-sm hover:brightness-125"
          >
            🗑️
          </button>
        )}
      </div>

      {/* seletor rápido de emoji */}
      {picking && (
        <div className="absolute right-2 top-4 z-10 flex gap-1 rounded bg-rail p-1 shadow-lg">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                onToggleReaction(message.id, e);
                setPicking(false);
              }}
              className="rounded px-1 text-lg hover:bg-black/30"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
