"use client";

import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { MAX_ATTACHMENTS_PER_MESSAGE, type Attachment } from "@newdisc/shared";
import { api } from "@/lib/api";
import { MAX_MESSAGE_LENGTH } from "@/stores/messages-core";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/** Altura máxima do campo antes de virar rolagem interna (~8 linhas). */
const MAX_HEIGHT_PX = 200;
/** A contagem de caracteres só aparece quando começa a importar. */
const COUNTER_THRESHOLD = 0.8;

/**
 * Campo de envio de mensagem.
 *
 * `textarea` que cresce com o conteúdo: Enter envia, Shift+Enter quebra linha —
 * antes era um `input` de uma linha, onde não havia como escrever um parágrafo.
 * Os anexos (opcionais) entram por botão, arrastar-e-soltar ou colar.
 */
export default function Composer({
  placeholder,
  onSend,
  allowAttachments = false,
  compact = false,
  ariaLabel,
}: {
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

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submit();
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
      className={`${compact ? "px-3 pb-4" : "px-4 pb-4"} ${dragging ? "opacity-70" : ""}`}
    >
      {allowAttachments && (pending.length > 0 || uploading) && (
        <div className="mb-2 flex flex-wrap gap-2 rounded bg-panel p-2">
          {pending.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded bg-rail px-2 py-1 text-xs"
            >
              {attachment.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachment.url}
                  alt={attachment.filename}
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <span aria-hidden="true" className="text-lg">
                  📎
                </span>
              )}
              <span className="max-w-[8rem] truncate">{attachment.filename}</span>
              <button
                type="button"
                onClick={() =>
                  setPending((prev) => prev.filter((a) => a.id !== attachment.id))
                }
                aria-label={`Remover ${attachment.filename}`}
                title="Remover"
                className="text-neutral-400 transition hover:text-white"
              >
                ✕
              </button>
            </div>
          ))}
          {uploading && (
            <span className="self-center text-xs text-neutral-400">Enviando…</span>
          )}
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded ${
          compact ? "bg-rail px-3" : "bg-panel px-3"
        }`}
      >
        {allowAttachments && (
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Anexar arquivo"
              title="Anexar arquivo"
              className="py-2 text-xl text-neutral-400 transition hover:text-white"
            >
              ＋
            </button>
          </>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          aria-label={ariaLabel}
          placeholder={dragging ? "Solte os arquivos para anexar…" : placeholder}
          className={`flex-1 resize-none bg-transparent text-sm outline-none ${
            compact ? "py-2" : "py-3"
          }`}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar mensagem"
          title="Enviar (Enter)"
          className="py-2 text-sm text-neutral-400 transition hover:text-white disabled:opacity-30"
        >
          ➤
        </button>
      </div>

      <div className="mt-1 flex justify-between px-1 text-[11px] text-neutral-600">
        <span>Enter envia · Shift+Enter quebra linha</span>
        {showCounter && (
          <span className={remaining <= 0 ? "text-red-400" : undefined}>
            {remaining} caracteres restantes
          </span>
        )}
      </div>
    </form>
  );
}
