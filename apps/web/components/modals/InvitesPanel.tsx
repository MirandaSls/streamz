"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import type { InviteDetail } from "@newdisc/shared";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Convites do servidor: lista, cópia e revogação.
 *
 * Vive separado do modal porque é a mesma tela em dois lugares — o modal
 * `InvitesModal` (atalho do menu do servidor) e a aba "Convites" das
 * configurações. Duplicar seria manter duas listas que envelhecem diferente.
 */
export default function InvitesPanel({ guildId }: { guildId: string }) {
  const [invites, setInvites] = useState<InviteDetail[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let vivo = true;
    api
      .listInvites(guildId)
      .then((list) => vivo && setInvites(list))
      .catch((e) => {
        if (!vivo) return;
        ui.toast(errorMessage(e, "Não foi possível listar os convites"), "error");
        setInvites([]);
      });
    return () => {
      vivo = false;
    };
  }, [guildId]);

  async function create() {
    setBusy(true);
    try {
      await api.createInvite(guildId);
      setInvites(await api.listInvites(guildId));
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
    <div>
      <p className="mb-3 text-sm text-txt-muted">
        Quem tiver um destes códigos pode entrar no servidor.
      </p>
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
      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className="mt-4 h-[38px] rounded-[3px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Criando…" : "Criar convite"}
      </button>
    </div>
  );
}
