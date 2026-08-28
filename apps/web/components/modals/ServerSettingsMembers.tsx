"use client";

import { useState } from "react";
import { Crown, MoreHorizontal, Search, ShieldAlert, X } from "lucide-react";
import {
  Permission,
  colorRoleOf,
  displayNameOf,
  rolesOf,
  type GuildMemberView,
} from "@streamz/shared";
import { Select } from "@/components/ui/controls";
import { ESTILO_CAMPO } from "@/components/settings/campos";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useAuth } from "@/stores/auth";
import { useGuilds, useIsOwner } from "@/stores/guilds";
import { useCan, usePermissions } from "@/stores/permissions";
import { ui, type MenuItem } from "@/stores/ui";

/**
 * Aba "Membros": uma **tabela** com nome, cargos e sinais, filtrável por cargo.
 *
 * Cartões empilhados com três ícones sempre visíveis por linha viravam uma
 * parede de botões vermelhos: num servidor de 50 pessoas são 150 ações na
 * tela, e expulsar alguém ficava a um clique acidental de distância. Na tabela
 * as ações moram no "…" da linha, como no Discord — e o que fica visível é a
 * informação, não o perigo.
 *
 * Cada ação aparece só para quem tem a permissão correspondente — a mesma que
 * a API exigiria.
 */
export default function ServerSettingsMembers({ guildId: _guildId }: { guildId: string }) {
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
  const [filtro, setFiltro] = useState("");

  const q = busca.trim().toLowerCase();
  const lista = members.filter((m) => {
    const casaNome =
      !q ||
      m.user.username.toLowerCase().includes(q) ||
      displayNameOf(m.user).toLowerCase().includes(q);
    const casaCargo = !filtro || m.roleIds.includes(filtro);
    return casaNome && casaCargo;
  });

  function abrirMenu(e: React.MouseEvent<HTMLButtonElement>, m: GuildMemberView) {
    const eu = m.user.id === me?.id;
    const alvoValido = !eu && m.role !== "OWNER";
    const faltando = roles
      .filter((r) => !r.isDefault && !m.roleIds.includes(r.id))
      .sort((a, b) => b.position - a.position);

    const items: MenuItem[] = [];
    if (podeCargos) {
      items.push({
        label: "Adicionar cargo",
        submenu:
          faltando.length === 0
            ? [{ label: "Nenhum cargo disponível", onSelect: () => undefined, disabled: true }]
            : faltando.map((r) => ({
                label: r.name,
                dot: r.color ?? undefined,
                onSelect: () => void toggleRole(m.user.id, r.id, true),
              })),
      });
    }
    if (isOwner && alvoValido) {
      items.push({
        label: "Transferir posse",
        onSelect: () => void transfer(m.user.id),
      });
    }
    if (items.length > 0 && (podeExpulsar || podeBanir) && alvoValido) {
      items.push({ separator: true });
    }
    if (podeExpulsar && alvoValido) {
      items.push({ label: "Expulsar", danger: true, onSelect: () => kick(m.user.id) });
    }
    if (podeBanir && alvoValido) {
      items.push({ label: "Banir", danger: true, onSelect: () => ban(m.user.id) });
    }
    if (items.length === 0) {
      items.push({ label: "Nada a fazer aqui", onSelect: () => undefined, disabled: true });
    }

    const rect = e.currentTarget.getBoundingClientRect();
    ui.openContextMenu(rect.right - MENU_WIDTH, rect.bottom + 4, items, MENU_WIDTH);
  }

  return (
    <div>
      <div className="mb-4 flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted"
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar membros"
            aria-label="Buscar membros"
            className={`${ESTILO_CAMPO} pl-8`}
          />
        </div>
        <div className="w-[200px] shrink-0">
          <Select
            semDivisoria
            value={filtro}
            options={roles
              .filter((r) => !r.isDefault)
              .sort((a, b) => b.position - a.position)
              .map((r) => ({ value: r.id, label: r.name }))}
            onChange={setFiltro}
            emptyLabel="Todos os cargos"
          />
        </div>
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
        Membros — {lista.length}
      </p>

      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
            <th scope="col" className="w-[40%] pb-2 font-bold">
              Nome do membro
            </th>
            <th scope="col" className="pb-2 font-bold">
              Cargos
            </th>
            <th scope="col" className="w-[72px] pb-2 font-bold">
              Sinais
            </th>
            <th scope="col" className="w-10 pb-2">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-sm text-txt-muted">
                Ninguém com esse nome.
              </td>
            </tr>
          )}
          {lista.map((m) => {
            const cor = colorRoleOf(m.roleIds, roles)?.color ?? null;
            const chips = rolesOf(m.roleIds, roles);
            const castigado =
              !!m.timeoutUntil && new Date(m.timeoutUntil).getTime() > Date.now();
            return (
              <tr key={m.user.id} className="group border-b border-border align-middle">
                <td className="py-2 pr-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar user={m.user} size="sm" surface="border-chat" />
                    <div className="min-w-0">
                      <div
                        style={cor ? { color: cor } : undefined}
                        className="truncate text-sm font-medium text-txt-primary"
                      >
                        {displayNameOf(m.user)}
                      </div>
                      <div className="truncate text-xs text-txt-muted">@{m.user.username}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {chips.length === 0 && <span className="text-xs text-txt-muted">—</span>}
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
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1.5">
                    {m.role === "OWNER" && (
                      <Tooltip label="Dono do servidor">
                        <Crown size={14} className="text-yellow" aria-label="Dono" />
                      </Tooltip>
                    )}
                    {castigado && (
                      <Tooltip label="De castigo">
                        <ShieldAlert size={14} className="text-red" aria-label="De castigo" />
                      </Tooltip>
                    )}
                  </div>
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={(e) => abrirMenu(e, m)}
                    aria-label={`Ações para ${displayNameOf(m.user)}`}
                    className="grid h-8 w-8 place-items-center rounded text-txt-muted opacity-0 transition hover:text-txt-primary focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
