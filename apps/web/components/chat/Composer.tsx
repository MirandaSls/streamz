"use client";

import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { CirclePlus, FileText, Gift, Smile, Sticker, X } from "lucide-react";
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_LENGTH, type Attachment } from "@newdisc/shared";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { emitTyping } from "@/stores/typing";
import { ui } from "@/stores/ui";

/** Altura máxima do campo antes de virar rolagem interna (~8 linhas). */
const MAX_HEIGHT_PX = 200;
/** A contagem de caracteres só aparece quando começa a importar (Discord: 1800). */
const COUNTER_THRESHOLD = 0.9;

/** Botão de ícone à direita do composer (presente, GIF, figurinha, emoji). */
function SideButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={disabled ? `${label} (em breve)` : label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-disabled={disabled}
        className={`grid h-11 w-8 place-items-center text-txt-secondary transition ${
          disabled ? "cursor-not-allowed opacity-60" : "hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Campo de envio de mensagem, no leiaute do Discord: caixa arredondada cinza
 * com o "+" de anexo à esquerda e os botões de emoji à direita. `textarea` que
 * cresce com o conteúdo: Enter envia, Shift+Enter quebra linha. Anexos entram
 * por botão, arrastar-e-soltar ou colar.
 */
export default function Composer({
  channelId,
  placeholder,
  onSend,
  allowAttachments = false,
  compact = false,
  ariaLabel,
}: {
  /** canal em que se está digitando — para o aviso de "digitando…". */
  channelId?: string;
  placeholder: string;
  onSend: (content: string, attachments: Attachment[]) => void;
  allowAttachments?: boolean;
  /** variação enxuta usada no painel de thread. */
  compact?: boolean;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [picking, setPicking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // cresce com o conteúdo e volta a encolher quando o texto some
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [draft]);

  const remaining = MAX_MESSAGE_LENGTH - draft.length;
  const showCounter = draft.length >= MAX_MESSAGE_LENGTH * COUNTER_THRESHOLD;
  const canSend = (draft.trim().length > 0 || pending.length > 0) && !uploading;

  function submit() {
    if (!canSend) return;
    onSend(draft.trim(), pending);
    setDraft("");
    setPending([]);
  }

  function handleChange(value: string) {
    setDraft(value);
    if (channelId && value.trim()) emitTyping(channelId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submit();
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    handleChange(next);
    setPicking(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const room = MAX_ATTACHMENTS_PER_MESSAGE - pending.length;
    if (room <= 0) {
      ui.toast(`Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`, "error");
      return;
    }
    setUploading(true);
    try {
      for (const file of list.slice(0, room)) {
        try {
          const attachment = await api.uploadFile(file);
          setPending((prev) => [...prev, attachment]);
        } catch (e) {
          ui.toast(`Falha ao enviar ${file.name}: ${errorMessage(e)}`, "error");
        }
      }
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!allowAttachments) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    void addFiles(files);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={
        allowAttachments
          ? (e) => {
              e.preventDefault();
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={allowAttachments ? () => setDragging(false) : undefined}
      onDrop={
        allowAttachments
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
            }
          : undefined
      }
      className={`relative shrink-0 ${compact ? "px-4" : "px-4"} ${dragging ? "opacity-70" : ""}`}
    >
      <div className="rounded-lg bg-input">
        {allowAttachments && (pending.length > 0 || uploading) && (
          <div className="flex flex-wrap gap-4 border-b border-black/20 px-3 py-4">
            {pending.map((attachment) => (
              <div
                key={attachment.id}
                className="relative flex h-[184px] w-[184px] flex-col rounded-lg bg-panel p-2"
              >
                {attachment.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.url}
                    alt={attachment.filename}
                    className="min-h-0 flex-1 rounded object-contain"
                  />
                ) : (
                  <div className="grid min-h-0 flex-1 place-items-center text-txt-muted" aria-hidden="true">
                    <FileText size={64} strokeWidth={1} />
                  </div>
                )}
                <span className="mt-2 truncate text-sm text-txt-normal">{attachment.filename}</span>
                <Tooltip label="Remover anexo">
                  <button
                    type="button"
                    onClick={() => setPending((prev) => prev.filter((a) => a.id !== attachment.id))}
                    aria-label={`Remover ${attachment.filename}`}
                    className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded bg-panel text-red shadow-high hover:bg-hov"
                  >
                    <X size={18} />
                  </button>
                </Tooltip>
              </div>
            ))}
            {uploading && (
              <span className="self-center text-sm text-txt-muted">Enviando…</span>
            )}
          </div>
        )}

        <div className="flex items-start">
          {allowAttachments ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Tooltip label="Anexar arquivo">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Anexar arquivo"
                  className="grid h-11 w-14 place-items-center text-txt-secondary transition hover:text-txt-primary"
                >
                  <CirclePlus size={24} />
                </button>
              </Tooltip>
            </>
          ) : (
            <span className="w-4" aria-hidden="true" />
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            aria-label={ariaLabel}
            placeholder={dragging ? "Solte os arquivos para anexar…" : placeholder}
            className="min-h-11 flex-1 resize-none bg-transparent py-[11px] text-txt-normal outline-none placeholder:text-txt-muted"
          />

          <div className="flex items-center pr-2">
            {!compact && (
              <>
                <SideButton label="Enviar um presente" disabled>
                  <Gift size={24} />
                </SideButton>
                <SideButton label="GIF" disabled>
                  <span className="rounded-[3px] border-2 border-current px-0.5 text-[10px] font-bold leading-3">
                    GIF
                  </span>
                </SideButton>
                <SideButton label="Figurinha" disabled>
                  <Sticker size={24} />
                </SideButton>
              </>
            )}
            <SideButton label="Emoji" onClick={() => setPicking((p) => !p)}>
              <Smile size={24} />
            </SideButton>
          </div>
        </div>
      </div>

      {picking && (
        <EmojiPicker
          className="absolute bottom-full right-4 mb-2"
          onClose={() => setPicking(false)}
          onPick={insertEmoji}
        />
      )}

      {showCounter && (
        <span
          aria-live="polite"
          className={`absolute bottom-1 right-6 text-xs ${remaining <= 0 ? "text-red" : "text-txt-muted"}`}
        >
          {remaining}
        </span>
      )}
    </form>
  );
}
