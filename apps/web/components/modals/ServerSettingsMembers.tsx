"use client";

import { useState } from "react";
import { Check, Crown, Gavel, Plus, UserX, X } from "lucide-react";
import {
  Permission,
  colorRoleOf,
  displayNameOf,
  rolesOf,
  type GuildMemberView,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useAuth } from "@/stores/auth";
import { useGuilds, useIsOwner } from "@/stores/guilds";
import { useCan, usePermissions } from "@/stores/permissions";
import { ui, type MenuItem } from "@/stores/ui";

/**
 * Aba "Membros": buscar, ver e mexer nos cargos de cada um, expulsar e banir.
 *
 * Cada ação aparece só para quem tem a permissão correspondente — a mesma que
 * a API exigiria. Os chips de cargo têm o "x" para tirar e um "+" que abre o
 * menu com os cargos que faltam.
 */
export default function ServerSettingsMembers({ guildId }: { guildId: string }) {
  const me = useAuth((s) => s.user);
  const members = useGuilds((s) => s.members);
  const kick = useGuilds((s) => s.kick);
  const ban = useGuilds((s) => s.ban);
  const toggleRole = useGuilds((s) => s.toggleRole);
  const transfer = useGuilds((s) => s.transfer);
  const roles = usePermissions((s) => s.roles);
  const podeCargos = useCan(Permission.MANAGE_ROLES);
  const podeExpulsar = useCan(Permission.KICK_MEMBERS);
  const podeBanir = useCan(Permission.BAN_MEMBERS);
  const isOwner = useIsOwner(me?.id);
  const [busca, setBusca] = useState("");

  const q = busca.trim().toLowerCase();
  const lista = members.filter(
    (m) =>
      !q ||
      m.user.username.toLowerCase().includes(q) ||
      displayNameOf(m.user).toLowerCase().includes(q),
  );

  function abrirMenuDeCargos(e: React.MouseEvent, m: GuildMemberView) {
    const faltando = roles
      .filter((r) => !r.isDefault && !m.roleIds.includes(r.id))
      .sort((a, b) => b.position - a.position);
    const items: MenuItem[] =
      faltando.length === 0
        ? [{ label: "Nenhum cargo disponível", onSelect: () => undefined, disabled: true }]
        : faltando.map((r) => ({
            label: r.name,
            icon: <Check size={18} />,
            onSelect: () => void toggleRole(m.user.id, r.id, true),
          }));
    const rect = e.currentTarget.getBoundingClientRect();
    ui.openContextMenu(rect.left, rect.bottom + 4, items);
  }

  return (
    <div>
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar membros"
        aria-label="Buscar membros"
        className="mb-4 h-9 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />
      <p className="mb-2 text-xs font-bold uppercase text-txt-secondary">
        Membros — {members.length}
      </p>
      <div role="list" className="rounded bg-rail/50">
        {lista.length === 0 && (
          <p className="px-3 py-3 text-sm text-txt-muted">Ninguém com esse nome.</p>
        )}
        {lista.map((m) => {
          const cor = colorRoleOf(m.roleIds, roles)?.color ?? null;
          const chips = rolesOf(m.roleIds, roles);
          const eu = m.user.id === me?.id;
          const alvoValido = !eu && m.role !== "OWNER";
          return (
            <div
              key={m.user.id}
              role="listitem"
              className="flex items-start gap-3 border-b border-border px-3 py-3 last:border-0"
            >
              <Avatar user={m.user} size="md" surface="border-rail" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    style={cor ? { color: cor } : undefined}
                    className="truncate font-medium text-txt-primary"
                  >
                    {displayNameOf(m.user)}
                  </span>
                  {m.role === "OWNER" && (
                    <Tooltip label="Dono do servidor">
                      <Crown size={14} className="shrink-0 text-yellow" aria-label="Dono" />
                    </Tooltip>
                  )}
                  <span className="truncate text-xs text-txt-muted">@{m.user.username}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {chips.map((r) => (
                    <span
                      key={r.id}
                      className="flex items-center gap-1 rounded-[4px] bg-panel py-0.5 pl-1.5 pr-1 text-xs text-txt-normal"
                    >
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: r.color ?? "#8a8a8e" }}
                        className="h-2.5 w-2.5 rounded-full"
                      />
                      {r.name}
                      {podeCargos && (
                        <button
                          type="button"
                          onClick={() => void toggleRole(m.user.id, r.id, false)}
                          aria-label={`Remover ${r.name} de ${displayNameOf(m.user)}`}
                          className="text-txt-muted hover:text-txt-primary"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                  {podeCargos && (
                    <button
                      type="button"
                      onClick={(e) => abrirMenuDeCargos(e, m)}
                      aria-label={`Adicionar cargo a ${displayNameOf(m.user)}`}
                      className="grid h-[22px] w-[22px] place-items-center rounded-[4px] bg-panel text-txt-muted hover:text-txt-primary"
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-0.5">
                {isOwner && alvoValido && (
                  <Tooltip label="Transferir posse">
                    <button
                      type="button"
                      onClick={() => void transfer(m.user.id)}
                      aria-label={`Transferir posse para ${displayNameOf(m.user)}`}
                      className="grid h-8 w-8 place-items-center rounded text-txt-muted hover:text-yellow"
                    >
                      <Crown size={16} />
                    </button>
                  </Tooltip>
                )}
                {podeExpulsar && alvoValido && (
                  <Tooltip label="Expulsar">
                    <button
                      type="button"
                      onClick={() => void kick(m.user.id)}
                      aria-label={`Expulsar ${displayNameOf(m.user)}`}
                      className="grid h-8 w-8 place-items-center rounded text-txt-muted hover:text-red"
                    >
                      <UserX size={16} />
                    </button>
                  </Tooltip>
                )}
                {podeBanir && alvoValido && (
                  <Tooltip label="Banir">
                    <button
                      type="button"
                      onClick={() => void ban(m.user.id)}
                      aria-label={`Banir ${displayNameOf(m.user)}`}
                      className="grid h-8 w-8 place-items-center rounded text-txt-muted hover:text-red"
                    >
                      <Gavel size={16} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
