"use client";

import type { MouseEvent } from "react";
import { Crown, Gavel, MessageSquare, ShieldCheck, ShieldOff, Timer, TimerOff, UserX } from "lucide-react";
import { displayNameOf, isTimedOut, type GuildMemberView } from "@newdisc/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useCanModerate, useGuilds, useIsOwner } from "@/stores/guilds";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
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
 * Discord, com coroa para o dono, escudo para admin, e as ações de moderação
 * (expulsar, banir, promover/rebaixar) no hover e no menu de contexto.
 * Clicar num membro abre o cartão de perfil.
 */
export default function MemberList() {
  const user = useAuth((s) => s.user);
  const members = useGuilds((s) => s.members);
  const kick = useGuilds((s) => s.kick);
  const ban = useGuilds((s) => s.ban);
  const setRole = useGuilds((s) => s.setRole);
  // ── h-moderacao ──
  const timeout = useGuilds((s) => s.timeout);
  const removeTimeout = useGuilds((s) => s.removeTimeout);
  const canModerate = useCanModerate(user?.id);
  const isOwner = useIsOwner(user?.id);
  const openWith = useDMs((s) => s.openWith);
  // o status/perfil ao vivo vem da store de presença; a lista é só o do REST
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);

  const live = members.map((m) => {
    const u = resolveUser(profiles, m.user);
    return { m: { ...m, user: u }, status: resolveStatus(statuses, u) };
  });
  const online = live.filter((x) => x.status !== "OFFLINE");
  const offline = live.filter((x) => x.status === "OFFLINE");

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
    if (isOwner && !isMe && m.role !== "OWNER") {
      items.push({ separator: true });
      if (m.role === "ADMIN") {
        items.push({ label: "Remover administrador", icon: <ShieldOff size={18} />, onSelect: () => void setRole(m.user.id, "MEMBER") });
      } else {
        items.push({ label: "Tornar administrador", icon: <ShieldCheck size={18} />, onSelect: () => void setRole(m.user.id, "ADMIN") });
      }
    }
    if (actionable) {
      items.push({ separator: true });
      // ── h-moderacao ──
      if (isTimedOut(m.timeoutUntil)) {
        items.push({ label: "Remover castigo", icon: <TimerOff size={18} />, onSelect: () => void removeTimeout(m.user.id) });
      } else {
        items.push({ label: "Colocar de castigo", icon: <Timer size={18} />, onSelect: () => timeout(m.user.id) });
      }
      items.push({ label: "Expulsar", icon: <UserX size={18} />, danger: true, onSelect: () => kick(m.user.id) });
      items.push({ label: "Banir", icon: <Gavel size={18} />, danger: true, onSelect: () => ban(m.user.id) });
    }
    ui.openContextMenu(e.clientX, e.clientY, items);
  }

  function renderMember({ m, status }: { m: GuildMemberView; status: ReturnType<typeof resolveStatus> }) {
    const isMe = m.user.id === user?.id;
    const actionable = canModerate && !isMe && m.role !== "OWNER";
    const offline = status === "OFFLINE";
    const nome = displayNameOf(m.user);
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
          aria-label={`Perfil de ${nome}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar user={m.user} size="md" status={status} surface="border-panel" />
          <span className="flex min-w-0 items-center gap-1">
            <span
              className={`truncate font-medium ${
                m.role === "OWNER" || m.role === "ADMIN" ? "text-txt-primary" : "text-txt-faint group-hover:text-txt-normal"
              }`}
            >
              {nome}
            </span>
            {m.role === "OWNER" && (
              <Tooltip label="Dono do servidor">
                <Crown size={14} className="shrink-0 text-yellow" aria-label="Dono do servidor" />
              </Tooltip>
            )}
            {m.role === "ADMIN" && (
              <Tooltip label="Administrador">
                <ShieldCheck size={14} className="shrink-0 text-accent" aria-label="Administrador" />
              </Tooltip>
            )}
            {/* h-moderacao: relógio marca quem está de castigo agora */}
            {isTimedOut(m.timeoutUntil) && (
              <Tooltip label="De castigo — não pode enviar mensagens">
                <Timer size={14} className="shrink-0 text-red" aria-label="De castigo" />
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
                aria-label={`Abrir conversa com ${nome}`}
                className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-txt-primary"
              >
                <MessageSquare size={16} />
              </button>
            </Tooltip>
          )}
          {actionable && (
            <>
              {/* h-moderacao: castigo é a ação de moderação mais usada — fica no hover */}
              <Tooltip label={isTimedOut(m.timeoutUntil) ? "Remover castigo" : "Colocar de castigo"}>
                <button
                  type="button"
                  onClick={() =>
                    isTimedOut(m.timeoutUntil) ? void removeTimeout(m.user.id) : timeout(m.user.id)
                  }
                  aria-label={`${isTimedOut(m.timeoutUntil) ? "Remover castigo de" : "Colocar de castigo"} ${nome}`}
                  className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red"
                >
                  {isTimedOut(m.timeoutUntil) ? <TimerOff size={16} /> : <Timer size={16} />}
                </button>
              </Tooltip>
              <Tooltip label="Expulsar">
                <button
                  type="button"
                  onClick={() => kick(m.user.id)}
                  aria-label={`Expulsar ${nome}`}
                  className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red"
                >
                  <UserX size={16} />
                </button>
              </Tooltip>
              <Tooltip label="Banir">
                <button
                  type="button"
                  onClick={() => ban(m.user.id)}
                  aria-label={`Banir ${nome}`}
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
