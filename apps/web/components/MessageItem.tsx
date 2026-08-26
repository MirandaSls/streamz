"use client";

import { useMemo, useState, type MouseEvent } from "react";
import {
  ArrowRightToLine,
  CheckSquare,
  Copy,
  FileText,
  Flag,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  SmilePlus,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { Attachment, Message } from "@newdisc/shared";
import { displayNameOf, extractFirstUrl, isImageAttachment } from "@newdisc/shared";
import LinkEmbedCard, { useLinkEmbed } from "@/components/chat/LinkEmbedCard";
// ── h-moderacao ──
import PollCard from "@/components/polls/PollCard";
import { useModeration } from "@/stores/moderation";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Tooltip from "@/components/ui/Tooltip";
import { hora, horaCompleta } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { useAuth } from "@/stores/auth";
import { useGuilds } from "@/stores/guilds";
import type { ChatMessage } from "@/stores/messages-core";
import { useLiveUser } from "@/stores/presence";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

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
          <button
            key={a.id}
            type="button"
            onClick={() => ui.openModal({ kind: "image", url: a.url, alt: a.filename })}
            aria-label={`Abrir imagem ${a.filename}`}
            className="block w-fit cursor-zoom-in overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.filename}
              width={a.width ?? undefined}
              height={a.height ?? undefined}
              className="max-h-[350px] max-w-[550px] object-contain"
            />
          </button>
        ) : (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            download={a.filename}
            className="flex w-[432px] max-w-full items-center gap-3 rounded-lg border border-black/30 bg-panel p-4 hover:bg-hov"
          >
            <FileText size={40} strokeWidth={1.25} className="shrink-0 text-txt-muted" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-txt-link hover:underline">{a.filename}</span>
              <span className="text-xs text-txt-muted">{formatBytes(a.size)}</span>
            </span>
          </a>
        ),
      )}
    </div>
  );
}

/** Ícone-botão da barra de ações que aparece no hover da mensagem. */
function ActionButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`grid h-8 w-8 place-items-center rounded-[3px] text-txt-secondary transition hover:bg-hov ${
          danger ? "hover:text-red" : "hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Uma mensagem, no leiaute do Discord: avatar de 40px à esquerda, nome e hora na
 * primeira linha, corpo (markdown, menções, prévia de link) abaixo. Quando
 * `grouped`, é a continuação da anterior (mesmo autor, poucos minutos) e só
 * mostra o corpo, com a hora na margem ao passar o mouse.
 */
export default function MessageItem({
  message,
  grouped = false,
  currentUserId,
  canModerate,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenThread,
  onRetry,
  onDiscard,
}: {
  message: ChatMessage;
  grouped?: boolean;
  currentUserId?: string;
  canModerate?: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  /** ausente dentro do painel de thread (não se responde a uma resposta). */
  onOpenThread?: (message: Message) => void;
  /** reenvia uma mensagem otimista que o servidor não confirmou. */
  onRetry?: (nonce: string) => void;
  /** descarta uma mensagem otimista que o servidor não confirmou. */
  onDiscard?: (nonce: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [picking, setPicking] = useState(false);

  const author = useLiveUser(message.author);
  const me = useAuth((s) => s.user);
  const members = useGuilds((s) => s.members);
  // @usuario → nome de exibição, para as menções mostrarem o nome como o Discord
  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.user.username.toLowerCase()] = displayNameOf(m.user);
    return map;
  }, [members]);

  // h-moderacao: seleção múltipla para remoção em lote (modo "selecionar")
  const selecting = useModeration((s) => s.selecting && s.selectionChannelId === message.channelId);
  const selected = useModeration((s) => s.selected.includes(message.id));
  const toggleSelected = useModeration((s) => s.toggleSelected);
  const startSelection = useModeration((s) => s.startSelection);
  const deleteAfter = useModeration((s) => s.deleteAfter);

  const isOwn = message.author.id === currentUserId;
  // sem confirmação do servidor a mensagem ainda não tem id real: editar,
  // apagar ou reagir não teriam a que se referir
  const unconfirmed = Boolean(message.pending || message.failed);
  const canDelete = isOwn || Boolean(canModerate);
  const embed = useLinkEmbed(unconfirmed ? null : extractFirstUrl(message.content));

  function submitEdit() {
    const t = draft.trim();
    if (t && t !== message.content) onEdit(message.id, t);
    setEditing(false);
  }

  function startEdit() {
    setDraft(message.content);
    setEditing(true);
  }

  function openProfile(e: MouseEvent<HTMLElement>) {
    ui.openProfile(author, anchorOf(e.currentTarget));
  }

  function openMenu(e: MouseEvent) {
    if (unconfirmed) return;
    e.preventDefault();
    const items: MenuItem[] = [
      { label: "Adicionar reação", icon: <SmilePlus size={18} />, onSelect: () => setPicking(true) },
    ];
    if (onOpenThread) {
      items.push({
        label: "Responder na thread",
        icon: <MessageSquare size={18} />,
        onSelect: () => onOpenThread(message),
      });
    }
    if (isOwn) items.push({ label: "Editar mensagem", icon: <Pencil size={18} />, onSelect: startEdit });
    items.push({ separator: true });
    items.push({
      label: "Copiar texto",
      icon: <Copy size={18} />,
      disabled: !message.content,
      onSelect: () => void navigator.clipboard?.writeText(message.content),
    });
    items.push({
      label: "Copiar ID da mensagem",
      onSelect: () => void navigator.clipboard?.writeText(message.id),
    });
    // ── h-moderacao ──
    if (!isOwn) {
      items.push({
        label: "Denunciar mensagem",
        icon: <Flag size={18} />,
        onSelect: () =>
          ui.openModal({ kind: "report", messageId: message.id, preview: message.content }),
      });
    }
    if (canModerate) {
      items.push({ separator: true });
      items.push({
        label: "Selecionar mensagens",
        icon: <CheckSquare size={18} />,
        onSelect: () => startSelection(message.channelId, message.id),
      });
      items.push({
        label: "Apagar mensagens depois desta",
        icon: <ArrowRightToLine size={18} />,
        danger: true,
        onSelect: () => void deleteAfter(message.channelId, message.id),
      });
    }
    if (canDelete) {
      items.push({ separator: true });
      items.push({
        label: "Apagar mensagem",
        icon: <Trash2 size={18} />,
        danger: true,
        onSelect: () => onDelete(message.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items);
  }

  const mentionsMe = !!me && new RegExp(`(^|[^\\w.])@${me.username}(?![\\w.-])`, "i").test(message.content);

  // h-moderacao: mensagem escrita pelo servidor — linha discreta, sem avatar,
  // sem barra de ações e sem menu (não há o que editar nem a quem responder)
  if (message.systemType) {
    return (
      <div className="group mt-[17px] flex items-center gap-2 py-0.5 pl-[72px] pr-12 text-sm text-txt-muted hover:bg-msghov">
        <UserPlus size={16} className="shrink-0 text-green" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words">
          {message.systemType === "SYSTEM_JOIN" ? (
            <>
              <span className="font-medium text-txt-primary">{displayNameOf(author)}</span> entrou no
              servidor.
            </>
          ) : (
            message.content
          )}
        </span>
        <time className="shrink-0 text-[11px]" dateTime={message.createdAt}>
          {hora(message.createdAt)}
        </time>
      </div>
    );
  }

  return (
    <div
      onContextMenu={openMenu}
      onClick={selecting ? () => toggleSelected(message.id) : undefined}
      className={`group relative flex gap-4 py-0.5 pl-[72px] pr-12 ${
        selected
          ? "bg-accent/15"
          : mentionsMe
            ? "border-l-2 border-yellow bg-yellow/10 hover:bg-yellow/15"
            : "hover:bg-msghov"
      } ${grouped ? "" : "mt-[17px]"} ${message.pending ? "opacity-60" : ""} ${
        selecting ? "cursor-pointer" : ""
      }`}
    >
      {selecting && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleSelected(message.id)}
          aria-label={`Selecionar mensagem de ${displayNameOf(author)}`}
          className="absolute right-4 top-1 h-4 w-4 accent-accent"
        />
      )}
      {grouped ? (
        // hora na margem, só no hover — como o Discord faz com mensagens agrupadas
        <span className="absolute left-0 top-1 w-[72px] select-none text-center text-[11px] leading-[22px] text-txt-muted opacity-0 group-hover:opacity-100">
          {hora(message.createdAt)}
        </span>
      ) : (
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Perfil de ${displayNameOf(author)}`}
          className="absolute left-4 top-0.5 rounded-full transition hover:brightness-110"
        >
          <Avatar user={author} size="lg" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-1.5 leading-[22px]">
            <button
              type="button"
              onClick={openProfile}
              className="font-medium text-txt-primary hover:underline"
            >
              {displayNameOf(author)}
            </button>
            <span className="ml-1 text-xs text-txt-muted">{horaCompleta(message.createdAt)}</span>
            {message.pending && <span className="text-xs italic text-txt-muted">enviando…</span>}
          </div>
        )}

        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitEdit();
            }}
            className="mt-1"
          >
            <textarea
              autoFocus
              rows={Math.min(8, Math.max(1, draft.split("\n").length))}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitEdit();
                }
              }}
              aria-label="Editar mensagem"
              className="w-full resize-none rounded-lg bg-input px-4 py-[11px] text-txt-normal outline-none"
            />
            <div className="mt-1 text-xs text-txt-muted">
              escape para{" "}
              <button type="button" onClick={() => setEditing(false)} className="text-txt-link hover:underline">
                cancelar
              </button>{" "}
              • enter para{" "}
              <button type="submit" className="text-txt-link hover:underline">
                salvar
              </button>
            </div>
          </form>
        ) : (
          message.content && (
            <div className="break-words text-txt-normal">
              <Markdown text={message.content} meUsername={me?.username} displayNames={displayNames} />
              {message.editedAt && (
                <span className="ml-1 text-[10px] text-txt-muted" title={horaCompleta(message.editedAt)}>
                  (editado)
                </span>
              )}
            </div>
          )
        )}

        <AttachmentView attachments={message.attachments} />
        {/* h-moderacao: a enquete é uma face da mensagem, não um bloco à parte */}
        {message.poll && (
          <PollCard poll={message.poll} canModerate={Boolean(canModerate)} isAuthor={isOwn} />
        )}
        {embed && <LinkEmbedCard embed={embed} />}

        {onOpenThread && message.replyCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="mt-1 flex items-center gap-1.5 text-sm font-medium text-txt-link hover:underline"
          >
            <MessageSquare size={16} aria-hidden="true" />
            {message.replyCount} {message.replyCount === 1 ? "resposta" : "respostas"}
            <span className="font-normal text-txt-muted">›</span>
          </button>
        )}

        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const mine = currentUserId ? r.userIds.includes(currentUserId) : false;
              return (
                <button
                  key={r.emoji}
                  type="button"
                  aria-pressed={mine}
                  aria-label={`${r.emoji}, ${r.count} ${r.count === 1 ? "reação" : "reações"}`}
                  onClick={() => onToggleReaction(message.id, r.emoji)}
                  className={`flex h-[26px] items-center gap-1.5 rounded-lg border px-1.5 text-sm transition ${
                    mine
                      ? "border-accent bg-accent/20 text-txt-primary"
                      : "border-transparent bg-panel text-txt-normal hover:border-[#4e5058]"
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="text-xs font-medium">{r.count}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPicking(true)}
              aria-label="Adicionar reação"
              className="grid h-[26px] w-8 place-items-center rounded-lg border border-transparent bg-panel text-txt-muted opacity-0 transition hover:border-[#4e5058] hover:text-txt-primary group-hover:opacity-100"
            >
              <SmilePlus size={16} />
            </button>
          </div>
        )}

        {message.failed && message.nonce && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red">
            <span>Não foi possível enviar.</span>
            <button
              type="button"
              onClick={() => onRetry?.(message.nonce as string)}
              className="rounded-[3px] bg-panel px-2 py-0.5 font-medium text-txt-normal hover:text-txt-primary"
            >
              Reenviar
            </button>
            <button
              type="button"
              onClick={() => onDiscard?.(message.nonce as string)}
              className="rounded-[3px] px-1 py-0.5 text-txt-muted hover:text-txt-primary"
            >
              Descartar
            </button>
          </div>
        )}
      </div>

      {/* barra de ações: no hover e também ao chegar pelo teclado */}
      {!unconfirmed && !editing && !selecting && (
        <div className="absolute -top-4 right-4 hidden rounded border border-black/20 bg-chat p-0.5 shadow-high group-focus-within:flex group-hover:flex">
          <ActionButton label="Adicionar reação" onClick={() => setPicking((p) => !p)}>
            <SmilePlus size={20} />
          </ActionButton>
          {onOpenThread && (
            <ActionButton label="Responder na thread" onClick={() => onOpenThread(message)}>
              <MessageSquare size={20} />
            </ActionButton>
          )}
          {isOwn && (
            <ActionButton label="Editar" onClick={startEdit}>
              <Pencil size={20} />
            </ActionButton>
          )}
          {!isOwn && (
            <ActionButton
              label="Denunciar"
              danger
              onClick={() =>
                ui.openModal({ kind: "report", messageId: message.id, preview: message.content })
              }
            >
              <Flag size={20} />
            </ActionButton>
          )}
          {canModerate && (
            <ActionButton
              label="Selecionar mensagens"
              onClick={() => startSelection(message.channelId, message.id)}
            >
              <ListChecks size={20} />
            </ActionButton>
          )}
          {canDelete && (
            <ActionButton label="Apagar" danger onClick={() => onDelete(message.id)}>
              <Trash2 size={20} />
            </ActionButton>
          )}
          <ActionButton label="Mais" onClick={openMenu}>
            <MoreHorizontal size={20} />
          </ActionButton>
        </div>
      )}

      {picking && (
        <EmojiPicker
          className="absolute right-4 top-4"
          onClose={() => setPicking(false)}
          onPick={(e) => {
            onToggleReaction(message.id, e);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
