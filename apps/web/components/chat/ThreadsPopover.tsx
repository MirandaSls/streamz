"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, MessagesSquare, Pencil } from "lucide-react";
import { displayNameOf } from "@streamz/shared";
import HeaderPopover from "@/components/chat/HeaderPopover";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { horaCompleta } from "@/lib/format";
import { useAuth } from "@/stores/auth";
import { useMessages } from "@/stores/messages";
import { useThreads } from "@/stores/messages-threads";

/**
 * Botão "Threads" do cabeçalho e o painel que ele abre: as threads ativas e as
 * arquivadas do canal, com quantas mensagens têm e quem participa.
 */
export default function ThreadsPopover({
  channelId,
  canManage,
}: {
  channelId: string;
  /** moderação do canal: pode renomear/arquivar thread de qualquer um. */
  canManage: boolean;
}) {
  const [aba, setAba] = useState<"ativas" | "arquivadas">("ativas");
  const me = useAuth((s) => s.user);
  const items = useThreads((s) => s.items);
  const loading = useThreads((s) => s.loading);
  const load = useThreads((s) => s.load);
  const rename = useThreads((s) => s.rename);
  const setArchived = useThreads((s) => s.setArchived);
  const openThread = useMessages((s) => s.openThread);

  const lista = items.filter((t) => (aba === "ativas" ? !t.archived : t.archived));

  return (
    <HeaderPopover
      label="Threads"
      title="Threads"
      icon={<MessagesSquare size={24} />}
      onOpen={() => void load(channelId)}
    >
      {(fechar) => (
        <>
          <div className="mb-2 flex gap-1 px-1">
            {(["ativas", "arquivadas"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setAba(k)}
                aria-pressed={aba === k}
                className={`rounded-[3px] px-2 py-1 text-sm font-medium capitalize transition ${
                  aba === k ? "bg-sel text-txt-primary" : "text-txt-muted hover:text-txt-normal"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {loading && <p className="p-4 text-center text-sm text-txt-muted">Carregando…</p>}

          {!loading && lista.length === 0 && (
            <div className="p-6 text-center">
              <MessagesSquare size={32} aria-hidden="true" className="mx-auto mb-2 text-txt-faint" />
              <p className="text-sm text-txt-muted">
                {aba === "ativas"
                  ? "Nenhuma thread ativa. Crie uma a partir de uma mensagem."
                  : "Nenhuma thread arquivada."}
              </p>
            </div>
          )}

          {lista.map((t) => {
            // renomear/arquivar: quem criou a thread ou a moderação do canal
            const podeMexer = canManage || t.createdBy.id === me?.id;
            return (
            <article key={t.id} className="mb-1 rounded-[5px] p-2 last:mb-0 hover:bg-hov">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fechar();
                    void openThread(channelId, { id: t.id });
                  }}
                  className="min-w-0 flex-1 truncate text-left font-medium text-txt-primary hover:underline"
                >
                  {t.name}
                </button>
                {podeMexer && (
                  <>
                    <Tooltip label="Renomear">
                      <button
                        type="button"
                        onClick={() => void rename(channelId, t)}
                        aria-label={`Renomear a thread ${t.name}`}
                        className="text-txt-muted transition hover:text-txt-primary"
                      >
                        <Pencil size={16} />
                      </button>
                    </Tooltip>
                    <Tooltip label={t.archived ? "Reabrir" : "Arquivar"}>
                      <button
                        type="button"
                        onClick={() => void setArchived(channelId, t, !t.archived)}
                        aria-label={`${t.archived ? "Reabrir" : "Arquivar"} a thread ${t.name}`}
                        className="text-txt-muted transition hover:text-txt-primary"
                      >
                        {t.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                      </button>
                    </Tooltip>
                  </>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-txt-muted">
                <span className="flex -space-x-1.5" aria-hidden="true">
                  {t.participants.map((p) => (
                    <Avatar key={p.id} user={p} size="sm" className="h-4 w-4 ring-2 ring-overlay" />
                  ))}
                </span>
                <span>
                  {t.messageCount} {t.messageCount === 1 ? "mensagem" : "mensagens"}
                </span>
                <span className="text-txt-faint">•</span>
                <span className="truncate">
                  {t.lastMessageAt
                    ? horaCompleta(t.lastMessageAt)
                    : `criada por ${displayNameOf(t.createdBy)}`}
                </span>
              </div>
            </article>
            );
          })}
        </>
      )}
    </HeaderPopover>
  );
}
