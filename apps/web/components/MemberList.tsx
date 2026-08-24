"use client";

import type { GuildMemberView } from "@newdisc/shared";

const STATUS_COLOR: Record<string, string> = {
  ONLINE: "bg-green-500",
  IDLE: "bg-yellow-500",
  DND: "bg-red-500",
  OFFLINE: "bg-neutral-600",
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dono",
  ADMIN: "Admin",
  MEMBER: "Membro",
};

export default function MemberList({ members }: { members: GuildMemberView[] }) {
  return (
    <aside className="flex w-56 flex-col bg-panel">
      <div className="border-b border-black/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Membros — {members.length}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {members.map((m) => (
          <div
            key={m.user.id}
            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-black/20"
          >
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-rail text-xs font-bold text-neutral-200">
              {m.user.username.slice(0, 2).toUpperCase()}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel ${
                  STATUS_COLOR[m.user.status] ?? STATUS_COLOR.OFFLINE
                }`}
              />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm text-neutral-200">{m.user.username}</div>
              {m.role !== "MEMBER" && (
                <div className="text-[10px] uppercase text-accent">{ROLE_LABEL[m.role]}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
