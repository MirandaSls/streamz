"use client";

import type { MouseEvent, ReactNode } from "react";
import { MoreVertical } from "@/components/ui/icones";
import { customStatusOf, displayNameOf, type PublicUser } from "@streamz/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useLiveUser, usePresence, resolveStatus } from "@/stores/presence";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

/**
 * Uma linha da página Amigos: avatar com status, nome + `@usuário`, o que está
 * embaixo (status personalizado ou o estado do pedido) e os botões redondos de
 * ação à direita.
 *
 * Duas decisões que o leiaute exige:
 *
 * - **A linha não muda de tamanho no hover.** Margem, padding e altura são fixos;
 *   o hover troca só fundo e borda. Antes a margem encolhia e o padding crescia,
 *   e o retângulo "pulava" de largura sob o cursor.
 * - **Clicar na linha abre a conversa** (`onOpen`), não o perfil. O perfil sai do
 *   avatar ou do botão direito. Quem chega numa lista de amigos quer falar com a
 *   pessoa; o cartão é o desvio, não o caminho. O alvo de clique é um botão
 *   sobreposto — o texto fica `pointer-events-none` para o clique atravessar —
 *   porque um `<button>` de verdade não pode conter os outros botões da linha.
 */
export default function FriendRow({
  user,
  subtitle,
  actions,
  menu,
  onOpen,
}: {
  user: PublicUser;
  /** substitui o rodapé padrão (status personalizado / status). */
  subtitle?: string;
  actions?: ReactNode;
  /** itens do menu "mais" (também abre no clique com o botão direito). */
  menu?: MenuItem[];
  /** ação do clique na linha; sem ela a linha abre o perfil. */
  onOpen?: () => void;
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

  function abrirPerfil(e: MouseEvent<HTMLElement>) {
    ui.openProfile(live, anchorOf(e.currentTarget));
  }

  return (
    <div
      role="listitem"
      onContextMenu={abrirMenu}
      className="group relative mx-6 flex h-[61px] items-center gap-3 rounded-lg border-t border-border px-[10px] first:border-t-0 hover:border-transparent hover:bg-hov celular:mx-2 celular:gap-2.5"
    >
      <button
        type="button"
        onClick={(e) => (onOpen ? onOpen() : abrirPerfil(e))}
        aria-label={onOpen ? `Conversar com ${nome}` : `Perfil de ${nome}`}
        className="absolute inset-0 rounded-lg"
      />

      <button
        type="button"
        onClick={abrirPerfil}
        aria-label={`Perfil de ${nome}`}
        className="relative shrink-0 rounded-full"
      >
        <Avatar user={live} size="md" status={status} surface="border-chat" />
      </button>

      {/* o texto deixa o clique passar para o botão que cobre a linha */}
      <span className="pointer-events-none relative min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-base font-semibold text-txt-primary">{nome}</span>
          <span className="truncate text-base text-txt-muted">@{live.username}</span>
        </span>
        <span className="block truncate text-sm text-txt-muted">{rodape}</span>
      </span>

      {/* 10px entre os círculos, medido no hover da linha do Discord */}
      <div className="relative flex shrink-0 items-center gap-2.5 celular:gap-0">
        {actions}
        {menu && menu.length > 0 && (
          <Tooltip label="Mais">
            <button
              type="button"
              onClick={abrirMenu}
              aria-label={`Mais opções para ${nome}`}
              className="grid h-9 w-9 place-items-center rounded-full text-txt-secondary transition hover:bg-sel hover:text-txt-primary celular:h-11 celular:w-11"
            >
              {/* o "⋮" do Discord mede 16px de altura; o nosso caminho desenha
                  0,83 do `size`, então 20 → 16,7 (em 18 saía com 15) */}
              <MoreVertical size={20} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/**
 * Botão redondo de ação da linha (mensagem, aceitar, recusar).
 *
 * **Sem fundo em repouso, com fundo no hover.** Medido no print do Discord: em
 * volta dos glifos há só a cor do chat; o círculo aparece ao passar o mouse.
 * Nós tínhamos o círculo sempre visível, o que enchia a lista de alvos
 * permanentes concorrendo com o nome da pessoa.
 *
 * O fundo no hover continua sendo o que faz o botão se ler como alvo: a linha
 * inteira também acende, e só o ícone mudando de tom não bastaria para separar
 * um do outro.
 */
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
        className={`grid h-9 w-9 place-items-center rounded-full text-txt-secondary transition hover:bg-sel celular:h-11 celular:w-11 ${
          danger ? "hover:text-red" : positive ? "hover:text-green" : "hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
