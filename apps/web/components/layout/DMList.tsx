"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { LogOut, Phone, Plus, Settings, UserPlus, Users, X } from "lucide-react";
import { displayNameOf, isGroupChannel, isUnread, type DMChannelView, type PublicUser } from "@newdisc/shared";
import UserFooter from "@/components/layout/UserFooter";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { dmTitle, useDMs } from "@/stores/dms";
import { useFriends, usePendingCount } from "@/stores/friends";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui, useUI } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/** Coluna 2 no modo DM: busca de pessoas, conversas 1-a-1 e grupos. */
export default function DMList() {
  const channels = useDMs((s) => s.channels);
  const loading = useDMs((s) => s.loadingList);
  const activeId = useDMs((s) => s.activeId);
  const select = useDMs((s) => s.select);
  const openWith = useDMs((s) => s.openWith);
  const leaveGroup = useDMs((s) => s.leaveGroup);
  const markRead = useDMs((s) => s.markRead);
  // ── d-social ── a página Amigos é a home do modo DM
  const hide = useDMs((s) => s.hide);
  const friendsOpen = useFriends((s) => s.open);
  const setFriendsOpen = useFriends((s) => s.setOpen);
  const pendentes = usePendingCount();
  const openModal = useUI((s) => s.openModal);
  const statuses = usePresence((s) => s.statuses);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PublicUser[]>([]);
  // f-voz: conversas com chamada rolando ganham o ícone verde de telefone
  const emChamada = useVoice((s) => s.states);

  const q = query.trim().toLowerCase();
  const visible = q ? channels.filter((dm) => dmTitle(dm).toLowerCase().includes(q)) : channels;

  // busca de usuários (para começar uma conversa com quem ainda não é contato)
  useEffect(() => {
    if (q.length < 2) {
      setFound([]);
      return;
    }
    let vivo = true;
    const t = window.setTimeout(() => {
      api
        .searchUsers(q)
        .then((users) => vivo && setFound(users))
        .catch(() => vivo && setFound([]));
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [q]);

  // quem já tem conversa não repete nos resultados da busca
  const knownIds = new Set(channels.flatMap((d) => d.others.map((u) => u.id)));
  const novos = found.filter((u) => !knownIds.has(u.id));

  function openMenu(e: MouseEvent, dm: DMChannelView) {
    e.preventDefault();
    const group = isGroupChannel(dm);
    ui.openContextMenu(e.clientX, e.clientY, [
      { label: "Marcar como lida", onSelect: () => void markRead(dm.id) },
      ...(!group && dm.others[0]
        ? [{ label: "Perfil", onSelect: () => ui.openProfile(dm.others[0], { x: e.clientX, y: e.clientY, width: 0, height: 0 }) }]
        : []),
      ...(group
        ? [
            { separator: true as const },
            {
              label: "Configurações do grupo",
              icon: <Settings size={18} />,
              onSelect: () => ui.openModal({ kind: "groupSettings", channelId: dm.id }),
            },
            {
              label: "Adicionar pessoas",
              icon: <UserPlus size={18} />,
              onSelect: () => ui.openModal({ kind: "addGroupMembers", channelId: dm.id }),
            },
          ]
        : []),
      { separator: true as const },
      // fechar não apaga nada: a conversa volta sozinha com mensagem nova
      { label: "Fechar conversa", icon: <X size={18} />, onSelect: () => void hide(dm.id) },
      ...(group
        ? [{ label: "Sair do grupo", icon: <LogOut size={18} />, danger: true, onSelect: () => void leaveGroup(dm.id) }]
        : []),
    ]);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <div className="flex h-12 shrink-0 items-center px-2.5 shadow-header">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          aria-label="Encontrar ou começar uma conversa"
          placeholder="Encontrar ou começar uma conversa"
          className="h-7 w-full rounded-[4px] bg-rail px-1.5 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
        />
      </div>

      <div role="list" aria-label="Conversas" className="flex-1 overflow-y-auto pt-2">
        {/* ── d-social ── a home do modo DM, com o badge de pedidos pendentes */}
        <button
          type="button"
          onClick={() => setFriendsOpen(true)}
          aria-current={friendsOpen ? "true" : undefined}
          className={"mx-2 mb-1 flex h-[42px] w-[calc(100%-1rem)] items-center gap-3 rounded-[4px] px-2 text-left " + (friendsOpen ? "bg-sel text-txt-primary" : "text-txt-faint hover:bg-hov hover:text-txt-normal")}
        >
          <Users size={24} aria-hidden="true" className="shrink-0" />
          <span className="flex-1 font-medium">Amigos</span>
          {pendentes > 0 && (
            <span
              aria-label={pendentes === 1 ? "1 pedido de amizade" : `${pendentes} pedidos de amizade`}
              className="grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[11px] font-bold leading-none text-white"
            >
              {pendentes}
            </span>
          )}
        </button>

        {novos.length > 0 && (
          <>
            <h3 className="pl-[18px] pr-2 pt-4 pb-1 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
              Pessoas
            </h3>
            {novos.map((u) => (
              <button
                key={u.id}
                type="button"
                role="listitem"
                onClick={() => {
                  setQuery("");
                  void openWith(u.id);
                }}
                className="mx-2 flex h-[42px] w-[calc(100%-1rem)] items-center gap-3 rounded-[4px] px-2 text-left text-txt-faint hover:bg-hov hover:text-txt-normal"
              >
                <Avatar user={u} size="md" status={resolveStatus(statuses, u)} surface="border-panel" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{displayNameOf(u)}</span>
                  <span className="block truncate text-xs text-txt-muted">@{u.username}</span>
                </span>
              </button>
            ))}
          </>
        )}

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
            Nenhuma conversa. Busque alguém acima para começar.
          </p>
        )}
        {visible.map((dm) => {
          const title = dmTitle(dm);
          const active = activeId === dm.id && !friendsOpen;
          const group = isGroupChannel(dm);
          const other = !group ? dm.others[0] : undefined;
          const unread = !active && isUnread(dm);
          return (
            <div
              key={dm.id}
              role="listitem"
              onContextMenu={(e) => openMenu(e, dm)}
              className={`group mx-2 flex h-[42px] items-center rounded-[4px] pl-2 pr-1 ${
                active
                  ? "bg-sel text-txt-primary"
                  : unread
                    ? "text-txt-primary hover:bg-hov"
                    : "text-txt-faint hover:bg-hov hover:text-txt-normal"
              }`}
            >
              <button
                type="button"
                onClick={() => select(dm)}
                aria-current={active ? "true" : undefined}
                aria-label={unread ? `${title} (não lida)` : title}
                className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
              >
                {other ? (
                  <Avatar user={other} size="md" status={resolveStatus(statuses, other)} surface={active ? "border-sel" : "border-panel"} />
                ) : (
                  <GroupAvatar iconUrl={dm.iconUrl} size="md" />
                )}
                <span className="min-w-0">
                  <span className={`block truncate ${unread ? "font-semibold" : "font-medium"}`}>{title}</span>
                  {group && (
                    <span className="block truncate text-xs text-txt-muted">
                      {dm.others.length + 1} membros
                    </span>
                  )}
                </span>
              </button>
              {(emChamada[dm.id]?.length ?? 0) > 0 && (
                <Tooltip label="Chamada em andamento">
                  <span
                    data-dm-call={dm.id}
                    aria-label={`Chamada em andamento em ${title}`}
                    className="grid h-6 w-6 place-items-center text-green"
                  >
                    <Phone size={16} />
                  </span>
                </Tooltip>
              )}
              {dm.mentionCount > 0 && !active && (
                <span
                  aria-label={`${dm.mentionCount} não lidas`}
                  className="grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[11px] font-bold leading-none text-white"
                >
                  {dm.mentionCount}
                </span>
              )}
              <Tooltip label={group ? "Sair do grupo" : "Fechar conversa"}>
                <button
                  type="button"
                  onClick={() => (group ? void leaveGroup(dm.id) : void hide(dm.id))}
                  aria-label={group ? `Sair do grupo ${title}` : `Fechar conversa com ${title}`}
                  className="grid h-6 w-6 place-items-center rounded text-txt-muted opacity-0 transition hover:text-txt-primary group-hover:opacity-100 focus-visible:opacity-100"
                >
                  {group ? <LogOut size={16} /> : <X size={16} />}
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>

      <UserFooter />
    </aside>
  );
}
