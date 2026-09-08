"use client";

import { useEffect, useState } from "react";
import { Search } from "@/components/ui/icones";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import { ESTILO_CAMPO } from "@/components/settings/campos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

interface Banimento {
  user: PublicUser;
  reason: string | null;
  createdAt: string;
}

/**
 * Aba "Banimentos": a tabela de quem está banido e por quê.
 *
 * A linha inteira é o alvo de clique e abre a confirmação de revogar — no
 * Discord não há botão de desbanir visível na lista, e é assim que revogar
 * deixa de ser algo que se faz por engano ao passar o mouse.
 */
export default function BanimentosTab({ guildId }: { guildId: string }) {
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

  async function revogar(b: Banimento) {
    const ok = await ui.confirm({
      title: "Revogar banimento",
      message: `${displayNameOf(b.user)} volta a poder entrar no servidor com um convite.${
        b.reason ? ` Motivo do banimento: ${b.reason}` : ""
      }`,
      confirmLabel: "Revogar banimento",
    });
    if (!ok) return;
    try {
      await api.unbanMember(guildId, b.user.id);
      setBans((list) => list?.filter((x) => x.user.id !== b.user.id) ?? null);
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
      <TituloDaPagina titulo="Banimentos" />

      <div className="relative mb-4">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted"
        />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar banidos"
          aria-label="Buscar banidos"
          className={`${ESTILO_CAMPO} pl-8`}
        />
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
        Banimentos — {(bans ?? []).length}
      </p>

      {/* A tabela rola por dentro no celular: `table-fixed` sem piso de
          largura espremeria quatro colunas em 358px e nenhuma ficaria legível.
          Em 660 (a coluna do desktop) o piso não tem efeito. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed">
          <thead>
            <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
              <th scope="col" className="w-[45%] pb-2 font-bold">
                Usuário
              </th>
              <th scope="col" className="pb-2 font-bold">
                Motivo do banimento
              </th>
            </tr>
          </thead>
          <tbody>
            {bans === null && (
              <tr>
                <td colSpan={2} className="py-3 text-sm text-txt-muted">
                  Carregando…
                </td>
              </tr>
            )}
            {bans !== null && lista.length === 0 && (
              <tr>
                <td colSpan={2} className="py-3 text-sm text-txt-muted">
                  {bans.length === 0 ? "Ninguém banido por aqui." : "Ninguém com esse nome."}
                </td>
              </tr>
            )}
            {lista.map((b) => (
              <tr
                key={b.user.id}
                tabIndex={0}
                role="button"
                onClick={() => void revogar(b)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void revogar(b);
                  }
                }}
                aria-label={`Revogar o banimento de ${displayNameOf(b.user)}`}
                className="cursor-pointer border-b border-border align-middle outline-none transition hover:bg-hov focus-visible:bg-hov"
              >
                <td className="py-2 pr-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar user={b.user} size="sm" surface="border-chat" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-txt-primary">
                        {displayNameOf(b.user)}
                      </div>
                      <div className="truncate text-xs text-txt-muted">
                        {horaCompleta(b.createdAt)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-sm text-txt-normal">
                  <span className="line-clamp-2">{b.reason || "Sem motivo registrado"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
