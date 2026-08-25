"use client";

import { isGroupChannel } from "@newdisc/shared";
import UserFooter from "@/components/layout/UserFooter";
import { dmTitle, useDMs } from "@/stores/dms";
import { useUI } from "@/stores/ui";

/** Coluna 2 no modo DM: conversas 1-a-1 e grupos. */
export default function DMList() {
  const channels = useDMs((s) => s.channels);
  const loading = useDMs((s) => s.loadingList);
  const activeId = useDMs((s) => s.activeId);
  const select = useDMs((s) => s.select);
  const leaveGroup = useDMs((s) => s.leaveGroup);
  const openModal = useUI((s) => s.openModal);

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <div className="flex items-center justify-between border-b border-black/20 px-4 py-3 font-semibold">
        Mensagens diretas
        <button
          type="button"
          onClick={() => openModal({ kind: "createGroupDM" })}
          aria-label="Criar grupo"
          title="Criar grupo"
          className="text-lg text-neutral-400 transition hover:text-white"
        >
          ＋
        </button>
      </div>

      <div role="list" aria-label="Conversas" className="flex-1 overflow-y-auto p-2">
        {loading && channels.length === 0 && (
          <p className="px-2 py-1 text-sm text-neutral-500">Carregando conversas…</p>
        )}
        {!loading && channels.length === 0 && (
          <p className="px-2 py-1 text-sm text-neutral-500">
            Nenhuma conversa. Abra uma pelo 💬 na lista de membros de um servidor.
          </p>
        )}
        {channels.map((dm) => {
          const title = dmTitle(dm);
          const active = activeId === dm.id;
          const group = isGroupChannel(dm);
          return (
            <div
              key={dm.id}
              role="listitem"
              className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${
                active ? "bg-black/30 text-white" : "text-neutral-400"
              }`}
            >
              <button
                type="button"
                onClick={() => select(dm)}
                aria-current={active ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 rounded text-left"
              >
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rail text-xs font-bold text-neutral-200"
                >
                  {group ? "👥" : title.slice(0, 2).toUpperCase()}
                </span>
                <span className="truncate">{title}</span>
              </button>
              {group && (
                <button
                  type="button"
                  onClick={() => void leaveGroup(dm.id)}
                  aria-label={`Sair do grupo ${title}`}
                  title="Sair do grupo"
                  className="hidden text-xs text-neutral-400 transition hover:text-white group-focus-within:block group-hover:block"
                >
                  🚪
                </button>
              )}
            </div>
          );
        })}
      </div>

      <UserFooter />
    </aside>
  );
}
