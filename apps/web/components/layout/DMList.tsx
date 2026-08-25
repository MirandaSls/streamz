"use client";

import { useState, type MouseEvent } from "react";
import { LogOut, Plus, Users } from "lucide-react";
import { isGroupChannel, type DMChannelView } from "@newdisc/shared";
import UserFooter from "@/components/layout/UserFooter";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { dmTitle, useDMs } from "@/stores/dms";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui, useUI } from "@/stores/ui";

/** Coluna 2 no modo DM: busca, conversas 1-a-1 e grupos. */
export default function DMList() {
  const channels = useDMs((s) => s.channels);
  const loading = useDMs((s) => s.loadingList);
  const activeId = useDMs((s) => s.activeId);
  const select = useDMs((s) => s.select);
  const leaveGroup = useDMs((s) => s.leaveGroup);
  const openModal = useUI((s) => s.openModal);
  const statuses = usePresence((s) => s.statuses);
  const [filter, setFilter] = useState("");

  const visible = filter.trim()
    ? channels.filter((dm) => dmTitle(dm).toLowerCase().includes(filter.trim().toLowerCase()))
    : channels;

  function openMenu(e: MouseEvent, dm: DMChannelView) {
    e.preventDefault();
    const group = isGroupChannel(dm);
    ui.openContextMenu(e.clientX, e.clientY, [
      ...(!group && dm.others[0]
        ? [{ label: "Perfil", onSelect: () => ui.openProfile(dm.others[0], { x: e.clientX, y: e.clientY, width: 0, height: 0 }) }]
        : []),
      ...(group
        ? [{ label: "Sair do grupo", icon: <LogOut size={18} />, danger: true, onSelect: () => void leaveGroup(dm.id) }]
        : []),
    ]);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <div className="flex h-12 shrink-0 items-center px-2.5 shadow-header">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          type="search"
          aria-label="Encontrar uma conversa"
          placeholder="Encontrar ou começar uma conversa"
          className="h-7 w-full rounded-[4px] bg-rail px-1.5 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
        />
      </div>

      <div role="list" aria-label="Conversas" className="flex-1 overflow-y-auto pt-2">
        <div className="group flex items-center justify-between pl-[18px] pr-2 pt-4 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted group-hover:text-txt-normal">
            Mensagens diretas
          </h3>
          <Tooltip label="Criar grupo">
            <button
              type="button"
              onClick={() => openModal({ kind: "createGroupDM" })}
              aria-label="Criar grupo"
              className="text-txt-muted transition hover:text-txt-primary"
            >
              <Plus size={16} />
            </button>
          </Tooltip>
        </div>

        {loading && channels.length === 0 && (
          <p className="px-4 py-1 text-sm text-txt-muted">Carregando conversas…</p>
        )}
        {!loading && channels.length === 0 && (
          <p className="px-4 py-1 text-sm text-txt-muted">
            Nenhuma conversa. Abra uma pela lista de membros de um servidor.
          </p>
        )}
        {visible.map((dm) => {
          const title = dmTitle(dm);
          const active = activeId === dm.id;
          const group = isGroupChannel(dm);
          const other = !group ? dm.others[0] : undefined;
          return (
            <div
              key={dm.id}
              role="listitem"
              onContextMenu={(e) => openMenu(e, dm)}
              className={`group mx-2 flex h-[42px] items-center rounded-[4px] pl-2 pr-1 ${
                active ? "bg-sel text-txt-primary" : "text-txt-faint hover:bg-hov hover:text-txt-normal"
              }`}
            >
              <button
                type="button"
                onClick={() => select(dm)}
                aria-current={active ? "true" : undefined}
                className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
              >
                {other ? (
                  <Avatar user={other} size="md" status={resolveStatus(statuses, other)} surface={active ? "border-sel" : "border-panel"} />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white" aria-hidden="true">
                    <Users size={18} />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{title}</span>
                  {group && (
                    <span className="block truncate text-xs text-txt-muted">
                      {dm.others.length + 1} membros
                    </span>
                  )}
                </span>
              </button>
              {group && (
                <Tooltip label="Sair do grupo">
                  <button
                    type="button"
                    onClick={() => void leaveGroup(dm.id)}
                    aria-label={`Sair do grupo ${title}`}
                    className="grid h-6 w-6 place-items-center rounded text-txt-muted opacity-0 transition hover:text-txt-primary group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <LogOut size={16} />
                  </button>
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>

      <UserFooter />
    </aside>
  );
}
