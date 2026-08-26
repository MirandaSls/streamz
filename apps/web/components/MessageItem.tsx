"use client";

import { useMemo, useState, type MouseEvent } from "react";
import {
  Copy,
  CornerUpLeft,
  FileText,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  SmilePlus,
  Trash2,
} from "lucide-react";
import type { Attachment, Message, PublicUser } from "@newdisc/shared";
import {
  displayNameOf,
  extractFirstUrl,
  isImageAttachment,
  isSystemMessage,
  messageLinkPath,
} from "@newdisc/shared";
import LinkEmbedCard, { useLinkEmbed } from "@/components/chat/LinkEmbedCard";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Tooltip from "@/components/ui/Tooltip";
import { dataCompleta, hora, horaCompleta } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { useAuth } from "@/stores/auth";
import { useGuilds } from "@/stores/guilds";
import { useAuthorColor } from "@/stores/permissions";
import { useMessages } from "@/stores/messages";
import SystemMessageItem from "@/components/chat/SystemMessageItem";
import { goToMessage } from "@/stores/messages-navigate";
import { usePins } from "@/stores/messages-pins";
import { useThreads } from "@/stores/messages-threads";
import { useSettings } from "@/stores/settings";
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
 * Linha de referência da resposta, acima da mensagem: avatar miúdo, nome e o
 * começo da original. O traço em "L" à esquerda é o mesmo do Discord — é ele
 * que amarra visualmente a resposta à mensagem citada.
 */
function ReplyReference({ message }: { message: Message }) {
  const ref = message.replyTo;
  if (!ref) return null;
  return (
    <div className="relative flex items-center gap-1.5 pb-0.5 text-[13px] leading-[18px] text-txt-muted">
      <span
        aria-hidden="true"
        className="absolute -left-[38px] bottom-[7px] h-[11px] w-[32px] rounded-tl-[6px] border-l-2 border-t-2 border-[#4e5058]"
      />
      <Avatar user={ref.author} size="sm" className="h-4 w-4" />
      <span className="font-medium text-txt-secondary">@{displayNameOf(ref.author)}</span>
      <button
        type="button"
        onClick={() =>
          void goToMessage({
            guildId: message.guildId,
            channelId: message.channelId,
            messageId: ref.id,
          })
        }
        className="min-w-0 truncate text-left hover:text-txt-normal"
      >
        {ref.content || (ref.hasAttachments ? "Clique para ver o anexo" : "Mensagem apagada")}
      </button>
    </div>
  );
}

/** Nomes de quem reagiu, para o tooltip da pílula. */
function nomesDeQuemReagiu(userIds: string[], conhecidos: Map<string, PublicUser>): string {
  const nomes = userIds.map((id) => {
    const u = conhecidos.get(id);
    return u ? displayNameOf(u) : "alguém";
  });
  if (nomes.length <= 3) return nomes.join(", ");
  return `${nomes.slice(0, 3).join(", ")} e mais ${nomes.length - 3}`;
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
  // nome do autor na cor do seu cargo mais alto, como no Discord
  const corDoAutor = useAuthorColor(message.author.id);
  const me = useAuth((s) => s.user);
  // ── e-configuracoes ── aparência/acessibilidade vêm da store de preferências
  const compacto = useSettings((s) => s.compactMode);
  const sempreHora = useSettings((s) => s.alwaysShowTime);
  const tamanhoEmoji = useSettings((s) => s.emojiSize);
  const members = useGuilds((s) => s.members);
  const highlighted = useMessages((s) => s.highlightId === message.id);
  const startReply = useMessages((s) => s.startReply);
  // @usuario → nome de exibição, para as menções mostrarem o nome como o Discord
  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.user.username.toLowerCase()] = displayNameOf(m.user);
    return map;
  }, [members]);
  // quem reagiu: os membros do servidor mais o autor (basta para o tooltip)
  const conhecidos = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const m of members) map.set(m.user.id, m.user);
    map.set(message.author.id, message.author);
    if (me) map.set(me.id, me);
    return map;
  }, [members, message.author, me]);

  const isOwn = message.author.id === currentUserId;
  // sem confirmação do servidor a mensagem ainda não tem id real: editar,
  // apagar ou reagir não teriam a que se referir
  const unconfirmed = Boolean(message.pending || message.failed);
  const sistema = isSystemMessage(message);
  const canDelete = isOwn || Boolean(canModerate);
  // em conversa direta não há moderação: qualquer participante fixa (como no Discord)
  const canPin = message.guildId === null || Boolean(canModerate);
  const embed = useLinkEmbed(unconfirmed || sistema ? null : extractFirstUrl(message.content));

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

  function copiarLink() {
    const caminho = messageLinkPath(message.guildId, message.channelId, message.id);
    const url = typeof window === "undefined" ? caminho : `${window.location.origin}${caminho}`;
    void navigator.clipboard?.writeText(url);
    ui.toast("Link da mensagem copiado");
  }

  function responder() {
    startReply(message);
  }

  function alternarFixada() {
    const pins = usePins.getState();
    if (message.pinned) void pins.unpin(message.channelId, message.id);
    else void pins.pin(message.channelId, message.id);
  }

  async function criarThread() {
    const thread = await useThreads
      .getState()
      .create(message.channelId, message.id, message.content);
    if (thread) onOpenThread?.(message);
  }

  function openMenu(e: MouseEvent) {
    if (unconfirmed) return;
    e.preventDefault();
    const items: MenuItem[] = [];
    if (!sistema) {
      items.push({
        label: "Adicionar reação",
        icon: <SmilePlus size={18} />,
        onSelect: () => setPicking(true),
      });
      if (onOpenThread) {
        items.push({ label: "Responder", icon: <CornerUpLeft size={18} />, onSelect: responder });
        items.push({
          label: message.thread ? "Ver thread" : "Criar thread",
          icon: <MessageSquare size={18} />,
          onSelect: () => (message.thread ? onOpenThread(message) : void criarThread()),
        });
      }
      if (canPin) {
        items.push({
          label: message.pinned ? "Desafixar mensagem" : "Fixar mensagem",
          icon: message.pinned ? <PinOff size={18} /> : <Pin size={18} />,
          onSelect: alternarFixada,
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
    }
    items.push({
      label: "Copiar link da mensagem",
      icon: <Link2 size={18} />,
      onSelect: copiarLink,
    });
    items.push({
      label: "Copiar ID da mensagem",
      onSelect: () => void navigator.clipboard?.writeText(message.id),
    });
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

  // menção a mim: `@usuario` no texto ou resposta minha com o "@ ligado"
  const mentionsMe =
    !!me &&
    !isOwn &&
    (new RegExp(`(^|[^\\w.])@${me.username}(?![\\w.-])`, "i").test(message.content) ||
      Boolean(message.replyMention && message.replyTo?.author.id === me.id));

  const fundo = highlighted
    ? "bg-accent/20 hover:bg-accent/25"
    : mentionsMe
      ? "border-l-2 border-yellow bg-yellow/10 hover:bg-yellow/15"
      : "hover:bg-msghov";

  // narração do canal (fixar, entrada de membro, eventos de grupo): é o mesmo
  // componente que a timeline usa, para não haver duas versões do mesmo texto
  if (sistema) return <SystemMessageItem message={message} />;

  return (
    <div
      id={`mensagem-${message.id}`}
      onContextMenu={openMenu}
      // o respiro entre grupos é preferência do usuário (aba Aparência)
      style={
        grouped && !message.replyTo
          ? undefined
          : { marginTop: "var(--espaco-entre-grupos, 17px)" }
      }
      className={`group relative flex py-0.5 pr-12 transition-colors ${
        compacto ? "gap-1.5 pl-4" : "gap-4 pl-[72px]"
      } ${fundo} ${message.pending ? "opacity-60" : ""}`}
    >
      {compacto ? null : grouped && !message.replyTo ? (
        // hora na margem, só no hover — como o Discord faz com mensagens agrupadas
        <span
          className={`absolute left-0 top-1 w-[72px] select-none text-center text-[11px] leading-[22px] text-txt-muted ${
            sempreHora ? "" : "opacity-0"
          } group-hover:opacity-100`}
        >
          {hora(message.createdAt)}
        </span>
      ) : (
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Perfil de ${displayNameOf(author)}`}
          className={`absolute left-4 rounded-full transition hover:brightness-110 ${
            message.replyTo ? "top-[26px]" : "top-0.5"
          }`}
        >
          <Avatar user={author} size="lg" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <ReplyReference message={message} />

        {(!grouped || message.replyTo) && !compacto && (
          <div className="flex items-baseline gap-1.5 leading-[22px]">
            <button
              type="button"
              onClick={openProfile}
              style={corDoAutor ? { color: corDoAutor } : undefined}
              className="font-medium text-txt-primary hover:underline"
            >
              {displayNameOf(author)}
            </button>
            <Tooltip label={dataCompleta(message.createdAt)}>
              <span className="ml-1 text-xs text-txt-muted">{horaCompleta(message.createdAt)}</span>
            </Tooltip>
            {message.pinned && (
              <Tooltip label="Mensagem fixada">
                <span className="text-txt-muted">
                  <Pin size={12} aria-label="Mensagem fixada" />
                </span>
              </Tooltip>
            )}
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
            <div className={`break-words text-txt-normal ${compacto ? "flex gap-1.5" : ""}`}>
              {compacto && (
                <>
                  <span className="shrink-0 text-[11px] leading-[22px] text-txt-muted">
                    {hora(message.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={openProfile}
                    className="shrink-0 font-medium text-txt-primary hover:underline"
                  >
                    {displayNameOf(author)}
                  </button>
                </>
              )}
              <div className={compacto ? "min-w-0 flex-1" : undefined}>
                <Markdown text={message.content} meUsername={me?.username} displayNames={displayNames} />
                {message.editedAt && (
                  <span className="ml-1 text-[10px] text-txt-muted" title={horaCompleta(message.editedAt)}>
                    (editado)
                  </span>
                )}
              </div>
            </div>
          )
        )}

        <AttachmentView attachments={message.attachments} />
        {embed && <LinkEmbedCard embed={embed} />}

        {onOpenThread && (message.thread || message.replyCount > 0) && (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="mt-1 flex w-fit items-center gap-1.5 rounded-[4px] py-0.5 text-sm font-medium text-txt-link hover:underline"
          >
            {message.thread && message.thread.participants.length > 0 && (
              <span className="flex -space-x-1.5" aria-hidden="true">
                {message.thread.participants.map((p) => (
                  <Avatar key={p.id} user={p} size="sm" className="h-4 w-4 ring-2 ring-chat" />
                ))}
              </span>
            )}
            <MessageSquare size={16} aria-hidden="true" />
            {message.thread ? (
              <>
                <span className="text-txt-primary">{message.thread.name}</span>
                {message.thread.archived && (
                  <span className="text-xs font-normal text-txt-muted">(arquivada)</span>
                )}
              </>
            ) : (
              `${message.replyCount} ${message.replyCount === 1 ? "resposta" : "respostas"}`
            )}
            <span className="font-normal text-txt-muted">›</span>
          </button>
        )}

        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const mine = currentUserId ? r.userIds.includes(currentUserId) : false;
              return (
                <Tooltip
                  key={r.emoji}
                  label={`${nomesDeQuemReagiu(r.userIds, conhecidos)} ${
                    r.count === 1 ? "reagiu" : "reagiram"
                  } com ${r.emoji}`}
                >
                  <button
                    type="button"
                    aria-pressed={mine}
                    aria-label={`${r.emoji}, ${r.count} ${r.count === 1 ? "reação" : "reações"}`}
                    onClick={() => onToggleReaction(message.id, r.emoji)}
                    className={`flex min-h-[26px] items-center gap-1.5 rounded-lg border px-1.5 text-sm transition ${
                      mine
                        ? "border-accent bg-accent/20 text-txt-primary"
                        : "border-transparent bg-panel text-txt-normal hover:border-[#4e5058]"
                    }`}
                  >
                    <span style={{ fontSize: `${tamanhoEmoji}px`, lineHeight: 1.1 }}>{r.emoji}</span>
                    <span className="text-xs font-medium">{r.count}</span>
                  </button>
                </Tooltip>
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
      {!unconfirmed && !editing && (
        <div className="absolute -top-4 right-4 hidden rounded border border-black/20 bg-chat p-0.5 shadow-high group-focus-within:flex group-hover:flex">
          <ActionButton label="Adicionar reação" onClick={() => setPicking((p) => !p)}>
            <SmilePlus size={20} />
          </ActionButton>
          {onOpenThread && (
            <ActionButton label="Responder" onClick={responder}>
              <CornerUpLeft size={20} />
            </ActionButton>
          )}
          {onOpenThread && (
            <ActionButton
              label={message.thread ? "Ver thread" : "Criar thread"}
              onClick={() => (message.thread ? onOpenThread(message) : void criarThread())}
            >
              <MessageSquare size={20} />
            </ActionButton>
          )}
          {canPin && (
            <ActionButton
              label={message.pinned ? "Desafixar mensagem" : "Fixar mensagem"}
              onClick={alternarFixada}
            >
              {message.pinned ? <PinOff size={20} /> : <Pin size={20} />}
            </ActionButton>
          )}
          {isOwn && (
            <ActionButton label="Editar" onClick={startEdit}>
              <Pencil size={20} />
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
