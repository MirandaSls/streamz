"use client";

import type { MouseEvent, ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { customStatusOf, displayNameOf, type PublicUser } from "@newdisc/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useLiveUser, usePresence, resolveStatus } from "@/stores/presence";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

/**
 * Uma linha da página Amigos: avatar com status, nome, o que está embaixo
 * (status personalizado ou "@usuário") e os botões redondos de ação à direita
 * — o leiaute do Discord, onde as ações são círculos de 36px em `bg-rail`.
 */
export default function FriendRow({
  user,
  subtitle,
  actions,
  menu,
}: {
  user: PublicUser;
  /** substitui o rodapé padrão (status personalizado / status). */
  subtitle?: string;
  actions?: ReactNode;
  /** itens do menu "mais" (também abre no clique com o botão direito). */
  menu?: MenuItem[];
}) {
  const live = useLiveUser(user);
  const statuses = usePresence((s) => s.statuses);
  const status = resolveStatus(statuses, live);
  const nome = displayNameOf(live);
  const rodape = subtitle ?? customStatusOf(live) ?? STATUS_LABEL[status];

  function abrirMenu(e: MouseEvent) {
    if (!menu?.length) return;
    e.preventDefault();
    ui.openContextMenu(e.clientX, e.clientY, menu);
  }

  return (
    <div
      role="listitem"
      onContextMenu={abrirMenu}
      className="group mx-[30px] flex h-[62px] items-center gap-3 border-t border-[#3f4147] px-2.5 hover:mx-5 hover:rounded-lg hover:border-transparent hover:bg-hov hover:px-[22px]"
    >
      <button
        type="button"
        onClick={(e) => ui.openProfile(live, anchorOf(e.currentTarget))}
        aria-label={`Perfil de ${nome}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Avatar user={live} size="lg" status={status} surface="border-chat" />
        <span className="min-w-0">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate font-semibold text-txt-primary">{nome}</span>
            <span className="truncate text-sm text-txt-muted opacity-0 group-hover:opacity-100">
              @{live.username}
            </span>
          </span>
          <span className="block truncate text-sm text-txt-muted">{rodape}</span>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {menu && menu.length > 0 && (
          <Tooltip label="Mais">
            <button
              type="button"
              onClick={abrirMenu}
              aria-label={`Mais opções para ${nome}`}
              className="grid h-9 w-9 place-items-center rounded-full bg-rail text-txt-secondary transition hover:text-txt-primary"
            >
              <MoreVertical size={20} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Botão redondo de ação da linha (mensagem, aceitar, recusar). */
export function RowAction({
  label,
  onClick,
  danger = false,
  positive = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  positive?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`grid h-9 w-9 place-items-center rounded-full bg-rail transition ${
          danger
            ? "text-txt-secondary hover:text-red"
            : positive
              ? "text-txt-secondary hover:text-green"
              : "text-txt-secondary hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
