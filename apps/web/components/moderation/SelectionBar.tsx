"use client";

import { Trash2, X } from "lucide-react";
import { MAX_BULK_DELETE } from "@streamz/shared";
import { useModeration } from "@/stores/moderation";

/**
 * Barra do modo "selecionar mensagens": quantas estão marcadas e as duas saídas
 * (apagar ou cancelar). Fica acima do composer, no lugar onde o olho já está.
 */
export default function SelectionBar({ channelId }: { channelId: string }) {
  const selecting = useModeration((s) => s.selecting);
  const selectionChannelId = useModeration((s) => s.selectionChannelId);
  const selected = useModeration((s) => s.selected);
  const cancel = useModeration((s) => s.cancelSelection);
  const remove = useModeration((s) => s.deleteSelected);

  if (!selecting || selectionChannelId !== channelId) return null;

  const nenhuma = selected.length === 0;
  const noTeto = selected.length >= MAX_BULK_DELETE;

  return (
    <div
      role="toolbar"
      aria-label="Mensagens selecionadas"
      className="mx-4 mb-2 flex items-center gap-3 rounded-lg bg-input px-4 py-2"
    >
      <span className="min-w-0 flex-1 truncate text-sm text-txt-normal">
        {nenhuma
          ? "Escolha as mensagens que quer apagar."
          : `${selected.length} ${selected.length === 1 ? "mensagem selecionada" : "mensagens selecionadas"}`}
        {noTeto && (
          <span className="ml-1 text-txt-muted">(máximo de {MAX_BULK_DELETE} por vez)</span>
        )}
      </span>

      <button
        type="button"
        disabled={nenhuma}
        onClick={() => void remove()}
        className="flex h-8 items-center gap-1.5 rounded-[3px] bg-red px-3 text-sm font-medium text-white transition hover:bg-red-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={16} aria-hidden="true" />
        Apagar
      </button>
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancelar seleção"
        className="grid h-8 w-8 place-items-center rounded-[3px] text-txt-muted transition hover:text-txt-primary"
      >
        <X size={18} />
      </button>
    </div>
  );
}
