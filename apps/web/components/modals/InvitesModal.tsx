"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import type { InviteInfo } from "@newdisc/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** Convites do servidor: lista, cópia e revogação (moderação). */
export default function InvitesModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const [invites, setInvites] = useState<(InviteInfo & { creatorId: string })[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setInvites(await api.listInvites(guildId));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível listar os convites"), "error");
      setInvites([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  async function create() {
    setBusy(true);
    try {
      await api.createInvite(guildId);
      await load();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar o convite"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(code: string) {
    try {
      await api.revokeInvite(guildId, code);
      setInvites((list) => list?.filter((i) => i.code !== code) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível revogar"), "error");
    }
  }

  return (
    <Dialog
      title="Convites"
      description="Quem tiver um destes códigos pode entrar no servidor."
      onClose={closeModal}
      className="w-[480px]"
      footer={
        <>
          <PrimaryButton disabled={busy} onClick={() => void create()}>
            {busy ? "Criando…" : "Criar convite"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>
        </>
      }
    >
      <div className="max-h-72 overflow-y-auto rounded bg-rail/50">
        {invites === null ? (
          <p className="px-3 py-3 text-sm text-txt-muted">Carregando…</p>
        ) : invites.length === 0 ? (
          <p className="px-3 py-3 text-sm text-txt-muted">Nenhum convite ativo.</p>
        ) : (
          invites.map((i) => (
            <div key={i.code} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-hov">
              <code className="font-mono text-txt-primary">{i.code}</code>
              <span className="min-w-0 flex-1 truncate text-xs text-txt-muted">
                {i.uses}
                {i.maxUses ? `/${i.maxUses}` : ""} usos
                {i.expiresAt ? ` · expira ${horaCompleta(i.expiresAt)}` : " · sem expiração"}
              </span>
              <Tooltip label="Copiar código">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(i.code)}
                  aria-label={`Copiar ${i.code}`}
                  className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-txt-primary"
                >
                  <Copy size={16} />
                </button>
              </Tooltip>
              <Tooltip label="Revogar">
                <button
                  type="button"
                  onClick={() => void revoke(i.code)}
                  aria-label={`Revogar ${i.code}`}
                  className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red"
                >
                  <Trash2 size={16} />
                </button>
              </Tooltip>
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}
