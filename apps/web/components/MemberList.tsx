"use client";

import type { GuildMemberView, UserStatus } from "@newdisc/shared";
import { resolveStatus, usePresence } from "@/stores/presence";

const STATUS_COLOR: Record<string, string> = {
  ONLINE: "bg-green-500",
  IDLE: "bg-yellow-500",
  DND: "bg-red-500",
  OFFLINE: "bg-neutral-600",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ONLINE: "online",
  IDLE: "ausente",
  DND: "não perturbe",
  OFFLINE: "offline",
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dono",
  ADMIN: "Admin",
  MEMBER: "Membro",
};

export default function MemberList({
  members,
  currentUserId,
  canModerate,
  onKick,
  onBan,
  onOpenDM,
}: {
  members: GuildMemberView[];
  currentUserId?: string;
  canModerate?: boolean;
  onKick?: (userId: string) => void;
  onBan?: (userId: string) => void;
  onOpenDM?: (userId: string) => void;
}) {
  // o status ao vivo vem da store de presença; `m.user.status` é só o do REST
  const statuses = usePresence((s) => s.statuses);

  return (
    <aside aria-label="Membros" className="flex w-56 shrink-0 flex-col bg-panel">
      <div className="border-b border-black/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Membros — {members.length}
      </div>
      <div role="list" className="flex-1 overflow-y-auto p-2">
        {members.length === 0 && (
          <p className="px-2 py-1 text-sm text-neutral-500">Nenhum membro por aqui.</p>
        )}
        {members.map((m) => {
          const actionable =
            canModerate && m.user.id !== currentUserId && m.role !== "OWNER";
          const status = resolveStatus(statuses, m.user);
          return (
            <div
              key={m.user.id}
              role="listitem"
              className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-black/20"
            >
              <span
                aria-hidden="true"
                className="relative grid h-8 w-8 place-items-center rounded-full bg-rail text-xs font-bold text-neutral-200"
              >
                {m.user.username.slice(0, 2).toUpperCase()}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel ${
                    STATUS_COLOR[status] ?? STATUS_COLOR.OFFLINE
                  }`}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-neutral-200">
                  {m.user.username}
                  <span className="sr-only"> — {STATUS_LABEL[status]}</span>
                </div>
                {m.role !== "MEMBER" && (
                  <div className="text-[10px] uppercase text-accent">
                    {ROLE_LABEL[m.role]}
                  </div>
                )}
              </div>
              <div className="hidden gap-1 group-focus-within:flex group-hover:flex">
                {onOpenDM && m.user.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => onOpenDM(m.user.id)}
                    aria-label={`Abrir conversa com ${m.user.username}`}
                    title="Mensagem direta"
                    className="text-sm hover:brightness-125"
                  >
                    💬
                  </button>
                )}
                {actionable && (
                  <>
                    <button
                      type="button"
                      onClick={() => onKick?.(m.user.id)}
                      aria-label={`Expulsar ${m.user.username}`}
                      title="Expulsar"
                      className="text-sm hover:brightness-125"
                    >
                      👢
                    </button>
                    <button
                      type="button"
                      onClick={() => onBan?.(m.user.id)}
                      aria-label={`Banir ${m.user.username}`}
                      title="Banir"
                      className="text-sm hover:brightness-125"
                    >
                      🔨
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
