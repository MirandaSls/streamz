"use client";

import type { MouseEvent } from "react";
import { Crown, Gavel, MessageSquare, UserX } from "lucide-react";
import type { GuildMemberView } from "@newdisc/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { resolveStatus, usePresence } from "@/stores/presence";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

/** Título de seção da lista ("ONLINE — 3"). */
function Section({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="mt-6 px-2 pb-1 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
      {label} — {count}
    </h3>
  );
}

/**
 * Coluna 4: membros do servidor, separados em online e offline como no
 * Discord, com coroa para o dono e as ações de moderação no hover e no menu de
 * contexto. Clicar num membro abre o cartão de perfil.
 */
export default function MemberList() {
  const user = useAuth((s) => s.user);
  const members = useGuilds((s) => s.members);
  const kick = useGuilds((s) => s.kick);
  const ban = useGuilds((s) => s.ban);
  const canModerate = useCanModerate(user?.id);
  const openWith = useDMs((s) => s.openWith);
  // o status ao vivo vem da store de presença; `m.user.status` é só o do REST
  const statuses = usePresence((s) => s.statuses);

  const withStatus = members.map((m) => ({ m, status: resolveStatus(statuses, m.user) }));
  const online = withStatus.filter((x) => x.status !== "OFFLINE");
  const offline = withStatus.filter((x) => x.status === "OFFLINE");

  function openMenu(e: MouseEvent, m: GuildMemberView) {
    e.preventDefault();
    const isMe = m.user.id === user?.id;
    const actionable = canModerate && !isMe && m.role !== "OWNER";
    const items: MenuItem[] = [
      {
        label: "Perfil",
        onSelect: () => ui.openProfile(m.user, { x: e.clientX, y: e.clientY, width: 0, height: 0 }),
      },
    ];
    if (!isMe) {
      items.push({ label: "Mensagem", icon: <MessageSquare size={18} />, onSelect: () => void openWith(m.user.id) });
    }
    if (actionable) {
      items.push({ separator: true });
      items.push({ label: "Expulsar", icon: <UserX size={18} />, danger: true, onSelect: () => void kick(m.user.id) });
      items.push({ label: "Banir", icon: <Gavel size={18} />, danger: true, onSelect: () => void ban(m.user.id) });
    }
    ui.openContextMenu(e.clientX, e.clientY, items);
  }

  function renderMember({ m, status }: { m: GuildMemberView; status: ReturnType<typeof resolveStatus> }) {
    const isMe = m.user.id === user?.id;
    const actionable = canModerate && !isMe && m.role !== "OWNER";
    const offline = status === "OFFLINE";
    return (
      <div
        key={m.user.id}
        role="listitem"
        onContextMenu={(e) => openMenu(e, m)}
        className={`group mx-2 flex h-[42px] items-center gap-3 rounded px-2 hover:bg-hov ${
          offline ? "opacity-30 hover:opacity-100" : ""
        }`}
      >
        <button
          type="button"
          onClick={(e) => ui.openProfile(m.user, anchorOf(e.currentTarget))}
          aria-label={`Perfil de ${m.user.username}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar user={m.user} size="md" status={status} surface="border-panel" />
          <span className="flex min-w-0 items-center gap-1">
            <span
              className={`truncate font-medium ${
                m.role === "OWNER" || m.role === "ADMIN" ? "text-txt-primary" : "text-txt-faint group-hover:text-txt-normal"
              }`}
            >
              {m.user.username}
            </span>
            {m.role === "OWNER" && (
              <Tooltip label="Dono do servidor">
                <Crown size={14} className="shrink-0 text-yellow" aria-label="Dono do servidor" />
              </Tooltip>
            )}
          </span>
        </button>

        <div className="hidden shrink-0 gap-0.5 group-focus-within:flex group-hover:flex">
          {!isMe && (
            <Tooltip label="Mensagem">
              <button
                type="button"
                onClick={() => void openWith(m.user.id)}
                aria-label={`Abrir conversa com ${m.user.username}`}
                className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-txt-primary"
              >
                <MessageSquare size={16} />
              </button>
            </Tooltip>
          )}
          {actionable && (
            <>
              <Tooltip label="Expulsar">
                <button
                  type="button"
                  onClick={() => void kick(m.user.id)}
                  aria-label={`Expulsar ${m.user.username}`}
                  className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red"
                >
                  <UserX size={16} />
                </button>
              </Tooltip>
              <Tooltip label="Banir">
                <button
                  type="button"
                  onClick={() => void ban(m.user.id)}
                  aria-label={`Banir ${m.user.username}`}
                  className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red"
                >
                  <Gavel size={16} />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <aside aria-label="Membros" className="flex w-60 shrink-0 flex-col bg-panel">
      <div role="list" className="flex-1 overflow-y-auto pb-4">
        {members.length === 0 && (
          <p className="px-4 py-3 text-sm text-txt-muted">Nenhum membro por aqui.</p>
        )}
        {online.length > 0 && <Section label="Online" count={online.length} />}
        {online.map(renderMember)}
        {offline.length > 0 && <Section label="Offline" count={offline.length} />}
        {offline.map(renderMember)}
      </div>
    </aside>
  );
}
