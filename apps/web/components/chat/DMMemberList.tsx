"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Crown, MessageSquare, UserMinus, UserPlus, UserX } from "lucide-react";
import { displayNameOf, isGroupChannel, type DMChannelView, type PublicUser } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

/**
 * Coluna 4 no modo DM: os participantes da conversa.
 *
 * O botão de membros do cabeçalho da DM alterna esta coluna, como faz a lista
 * de membros do servidor. A lista vem do servidor (`GET /dms/:id/members`) e é
 * recarregada quando a conversa muda de participantes — a store só guarda os
 * "outros", que não bastam para mostrar o dono e a mim mesmo na ordem certa.
 */
export default function DMMemberList({ dm }: { dm: DMChannelView }) {
  const me = useAuth((s) => s.user);
  const [members, setMembers] = useState<PublicUser[]>([]);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const openWith = useDMs((s) => s.openWith);
  const removeMember = useDMs((s) => s.removeMember);
  const block = useFriends((s) => s.block);
  const remove = useFriends((s) => s.remove);
  const friends = useFriends((s) => s.friends);
  const send = useFriends((s) => s.send);

  const grupo = isGroupChannel(dm);
  const souDono = grupo && dm.ownerId === me?.id;

  // a chave é a lista de participantes: adicionar/remover muda `others`
  const chave = dm.others.map((u) => u.id).join(",");
  useEffect(() => {
    let vivo = true;
    api
      .dmMembers(dm.id)
      .then((rows) => vivo && setMembers(rows))
      .catch(() => vivo && setMembers([]));
    return () => {
      vivo = false;
    };
  }, [dm.id, chave]);

  function abrirMenu(e: MouseEvent, user: PublicUser) {
    e.preventDefault();
    const euMesmo = user.id === me?.id;
    const jaAmigo = friends.some((f) => f.id === user.id);
    const items: MenuItem[] = [
      { label: "Perfil", onSelect: () => ui.openModal({ kind: "userProfile", userId: user.id }) },
    ];
    if (!euMesmo) {
      items.push({
        label: "Mensagem",
        icon: <MessageSquare size={18} />,
        onSelect: () => void openWith(user.id),
      });
      items.push({ separator: true });
      if (jaAmigo) {
        items.push({
          label: "Remover amigo",
          icon: <UserMinus size={18} />,
          danger: true,
          onSelect: () => void remove(user),
        });
      } else {
        items.push({
          label: "Adicionar amigo",
          icon: <UserPlus size={18} />,
          onSelect: () => void send(user.username),
        });
      }
      items.push({
        label: "Bloquear",
        icon: <UserX size={18} />,
        danger: true,
        onSelect: () => void block(user),
      });
      if (souDono) {
        items.push({ separator: true });
        items.push({
          label: "Remover do grupo",
          icon: <UserMinus size={18} />,
          danger: true,
          onSelect: () => void removeMember(dm.id, user),
        });
      }
    }
    ui.openContextMenu(e.clientX, e.clientY, items);
  }

  return (
    <aside aria-label="Participantes da conversa" className="flex w-60 shrink-0 flex-col bg-panel">
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
            {grupo ? "Participantes" : "Conversa"} — {members.length}
          </h3>
          {grupo && (
            <Tooltip label="Adicionar pessoas">
              <button
                type="button"
                onClick={() => ui.openModal({ kind: "addGroupMembers", channelId: dm.id })}
                aria-label="Adicionar pessoas ao grupo"
                className="text-txt-muted transition hover:text-txt-primary"
              >
                <UserPlus size={16} />
              </button>
            </Tooltip>
          )}
        </div>

        <div role="list">
          {members.map((raw) => {
            const user = resolveUser(profiles, raw);
            const status = resolveStatus(statuses, user);
            const nome = displayNameOf(user);
            const dono = grupo && dm.ownerId === user.id;
            return (
              <div
                key={user.id}
                role="listitem"
                onContextMenu={(e) => abrirMenu(e, user)}
                className={`group mx-2 flex h-[42px] items-center gap-3 rounded px-2 hover:bg-hov ${
                  status === "OFFLINE" ? "opacity-30 hover:opacity-100" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => ui.openProfile(user, anchorOf(e.currentTarget))}
                  aria-label={`Perfil de ${nome}`}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar user={user} size="md" status={status} surface="border-panel" />
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-medium text-txt-faint group-hover:text-txt-normal">
                      {nome}
                    </span>
                    {dono && (
                      <Tooltip label="Criou o grupo">
                        <Crown size={14} className="shrink-0 text-yellow" aria-label="Criou o grupo" />
                      </Tooltip>
                    )}
                  </span>
                </button>

                {souDono && user.id !== me?.id && (
                  <Tooltip label="Remover do grupo">
                    <button
                      type="button"
                      onClick={() => void removeMember(dm.id, user)}
                      aria-label={`Remover ${nome} do grupo`}
                      className="hidden h-7 w-7 place-items-center rounded text-txt-muted hover:text-red group-focus-within:grid group-hover:grid"
                    >
                      <UserMinus size={16} />
                    </button>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
