"use client";

import { useCallback, useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { displayNameOf, type PublicUser } from "@newdisc/shared";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

interface BanRow {
  user: PublicUser;
  reason: string | null;
  createdAt: string;
}

/** Banimentos do servidor, com o motivo que o moderador escreveu, e o desfazer. */
export default function BansTab({ guildId }: { guildId: string }) {
  const [bans, setBans] = useState<BanRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      setBans(await api.listBans(guildId));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar os banimentos"), "error");
      setBans([]);
    }
  }, [guildId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function desbanir(user: PublicUser) {
    const ok = await ui.confirm({
      title: `Remover o banimento de ${displayNameOf(user)}?`,
      message: "Essa pessoa poderá entrar de novo com um convite.",
      confirmLabel: "Remover banimento",
    });
    if (!ok) return;
    try {
      await api.unbanMember(guildId, user.id);
      setBans((list) => list?.filter((b) => b.user.id !== user.id) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover o banimento"), "error");
    }
  }

  return (
    <div role="list" className="min-h-0 flex-1 overflow-y-auto rounded bg-rail/40">
      {bans === null && <p className="px-3 py-4 text-sm text-txt-muted">Carregando…</p>}
      {bans?.length === 0 && (
        <p className="px-3 py-4 text-sm text-txt-muted">Ninguém banido por aqui.</p>
      )}
      {bans?.map((b) => (
        <div
          key={b.user.id}
          role="listitem"
          className="flex items-center gap-3 border-b border-[#3f4147] px-3 py-3 last:border-b-0"
        >
          <Avatar user={b.user} size="md" surface="border-chat" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-txt-primary">{displayNameOf(b.user)}</div>
            <div className="truncate text-xs text-txt-muted">
              {b.reason ? `Motivo: ${b.reason}` : "Sem motivo registrado"} · {horaCompleta(b.createdAt)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void desbanir(b.user)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] bg-rail px-3 text-sm font-medium text-txt-normal transition hover:bg-hov"
          >
            <Undo2 size={16} aria-hidden="true" />
            Desbanir
          </button>
        </div>
      ))}
    </div>
  );
}
