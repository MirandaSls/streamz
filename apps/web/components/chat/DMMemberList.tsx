"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { AtSign, Crown, MessageSquare, User, UserMinus, UserPlus, UserX } from "@/components/ui/icones";
import { displayNameOf, isGroupChannel, type DMChannelView, type PublicUser } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import Tooltip from "@/components/ui/Tooltip";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { mencionar } from "@/lib/mencoes";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { useSettings } from "@/stores/settings";
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
  const developerMode = useSettings((s) => s.developerMode);

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

  function abrirMenu(e: MouseEvent, user: PublicUser, linha?: HTMLElement | null) {
    e.preventDefault();
    const euMesmo = user.id === me?.id;
    const jaAmigo = friends.some((f) => f.id === user.id);
    const items: MenuItem[] = [
      {
        label: "Perfil",
        icon: <User size={18} />,
        // popout ancorada na linha, como na lista de membros do servidor
        onSelect: () =>
          ui.openProfile(
            user,
            linha ? anchorOf(linha) : { x: e.clientX, y: e.clientY, width: 0, height: 0 },
          ),
      },
    ];
    if (!euMesmo) {
      items.push({
        label: "Mencionar",
        icon: <AtSign size={18} />,
        onSelect: () => mencionar(user),
      });
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
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID do usuário",
        onSelect: () => void navigator.clipboard?.writeText(user.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  return (
    <aside aria-label="Participantes da conversa" className="flex w-[267px] shrink-0 flex-col bg-background-base-lowest">
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
            {grupo ? "Participantes" : "Conversa"} — {members.length}
          </h3>
          {grupo && (
            <BotaoDeIcone
              rotulo="Adicionar pessoas ao grupo"
              icone={<UserPlus size={16} />}
              tamanho="sm"
              onClick={() => ui.openModal({ kind: "addGroupMembers", channelId: dm.id })}
              className="celular:-mr-2 celular:h-[44px] celular:w-[44px]"
            />
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
                onContextMenu={(e) => abrirMenu(e, user, e.currentTarget)}
                /* 60px no celular, como na lista de membros do servidor:
                   `docs/Reference/mobile/MEDIDAS.md` §10 mede 59,9pt no
                   Discord do telefone. */
                className={`group mx-2 flex h-[42px] items-center gap-3 rounded px-2 hover:bg-interactive-background-hover celular:h-[60px] ${
                  status === "OFFLINE" ? "opacity-30 hover:opacity-100" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => ui.openProfile(user, anchorOf(e.currentTarget))}
                  aria-label={`Perfil de ${nome}`}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar user={user} size="md" status={status} surface="border-background-base-lowest" />
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-medium text-channels-default group-hover:text-text-default">
                      {nome}
                    </span>
                    {/* ── j-bots ── antes da coroa, como na lista de membros do
                        servidor: a pílula é do nome, o selo é do papel. */}
                    {user.bot && <TagDeBot />}
                    {dono && (
                      <Tooltip label="Criou o grupo">
                        <Crown size={14} className="shrink-0 text-status-warning" aria-label="Criou o grupo" />
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
                      /* sempre à mostra no celular: sem hover e sem botão direito, "remover
                         do grupo" não tinha caminho nenhum a partir daqui */
                      className="hidden h-7 w-7 place-items-center rounded text-text-muted hover:text-status-danger group-focus-within:grid group-hover:grid celular:grid celular:h-[44px] celular:w-[44px]"
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
