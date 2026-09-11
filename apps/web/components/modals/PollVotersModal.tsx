"use client";

import { useEffect, useState } from "react";
import { displayNameOf, type PollVoters } from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** Quem votou em cada opção — só a moderação do canal chega aqui. */
export default function PollVotersModal({ messageId }: { messageId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const [voters, setVoters] = useState<PollVoters | null>(null);

  useEffect(() => {
    let ativo = true;
    void api
      .pollVoters(messageId)
      .then((v) => ativo && setVoters(v))
      .catch((e) => {
        if (!ativo) return;
        ui.toast(errorMessage(e, "Não foi possível ver os votos"), "error");
        setVoters({ messageId, byOption: [] });
      });
    return () => {
      ativo = false;
    };
  }, [messageId]);

  return (
    <Dialog
      title="Quem votou"
      description="Visível só para a moderação do servidor."
      onClose={closeModal}
      className="w-[420px]"
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      {voters === null ? (
        <p className="text-sm text-text-muted">Carregando…</p>
      ) : voters.byOption.length === 0 ? (
        <p className="text-sm text-text-muted">Nenhum voto ainda.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {voters.byOption.map((o) => (
            <div key={o.index}>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
                Opção {o.index + 1} — {o.users.length} {o.users.length === 1 ? "voto" : "votos"}
              </h3>
              {o.users.length === 0 ? (
                <p className="px-2 text-sm text-text-muted">Ninguém votou nesta opção.</p>
              ) : (
                <div role="list" className="flex flex-col">
                  {o.users.map((u) => (
                    <div
                      key={u.id}
                      role="listitem"
                      className="flex h-[42px] items-center gap-3 rounded px-2 hover:bg-interactive-background-hover"
                    >
                      <Avatar user={u} size="md" surface="border-background-base-lower" />
                      <span className="truncate text-sm text-text-default">{displayNameOf(u)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
