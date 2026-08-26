"use client";

import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { displayNameOf, type PublicUser } from "@newdisc/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

interface Banimento {
  user: PublicUser;
  reason: string | null;
  createdAt: string;
}

/** Aba "Banimentos": quem está banido, por quê, e o botão de desbanir. */
export default function ServerSettingsBans({ guildId }: { guildId: string }) {
  const [bans, setBans] = useState<Banimento[] | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    api
      .listBans(guildId)
      .then((list) => vivo && setBans(list))
      .catch((e) => {
        if (!vivo) return;
        ui.toast(errorMessage(e, "Não foi possível listar os banimentos"), "error");
        setBans([]);
      });
    return () => {
      vivo = false;
    };
  }, [guildId]);

  async function desbanir(u: PublicUser) {
    const ok = await ui.confirm({
      title: `Desbanir ${displayNameOf(u)}?`,
      message: "Ele volta a poder entrar no servidor com um convite.",
      confirmLabel: "Desbanir",
    });
    if (!ok) return;
    try {
      await api.unbanMember(guildId, u.id);
      setBans((list) => list?.filter((b) => b.user.id !== u.id) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível desbanir"), "error");
    }
  }

  const q = busca.trim().toLowerCase();
  const lista = (bans ?? []).filter(
    (b) =>
      !q ||
      b.user.username.toLowerCase().includes(q) ||
      displayNameOf(b.user).toLowerCase().includes(q),
  );

  return (
    <div>
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar banidos"
        aria-label="Buscar banidos"
        className="mb-4 h-9 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />
      <div role="list" className="rounded bg-rail/50">
        {bans === null ? (
          <p className="px-3 py-3 text-sm text-txt-muted">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="px-3 py-3 text-sm text-txt-muted">
            {bans.length === 0 ? "Ninguém banido por aqui." : "Ninguém com esse nome."}
          </p>
        ) : (
          lista.map((b) => (
            <div
              key={b.user.id}
              role="listitem"
              className="flex items-center gap-3 border-b border-[#3f4147] px-3 py-3 last:border-0"
            >
              <Avatar user={b.user} size="md" surface="border-rail" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-txt-primary">
                  {displayNameOf(b.user)}
                </div>
                <p className="truncate text-xs text-txt-muted">
                  {b.reason || "Sem motivo registrado"} · {horaCompleta(b.createdAt)}
                </p>
              </div>
              <Tooltip label="Desbanir">
                <button
                  type="button"
                  onClick={() => void desbanir(b.user)}
                  aria-label={`Desbanir ${displayNameOf(b.user)}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded text-txt-muted hover:text-txt-primary"
                >
                  <Undo2 size={16} />
                </button>
              </Tooltip>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
