"use client";

import type { MouseEvent, ReactNode } from "react";
import { MoreVertical } from "@/components/ui/icones";
import { customStatusOf, displayNameOf, type PublicUser } from "@streamz/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { useLiveUser, usePresence, resolveStatus } from "@/stores/presence";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

/**
 * Uma linha da página Amigos: avatar com status, nome + `@usuário`, o que está
 * embaixo (status personalizado ou o estado do pedido) e os botões redondos de
 * ação à direita.
 *
 * Três decisões que o leiaute exige:
 *
 * - **A linha não muda de tamanho no hover.** Margem, padding e altura são fixos;
 *   o hover troca só fundo e borda. Antes a margem encolhia e o padding crescia,
 *   e o retângulo "pulava" de largura sob o cursor.
 * - **Clicar na linha abre a conversa** (`onOpen`), não o perfil. O perfil sai do
 *   avatar ou do botão direito. Quem chega numa lista de amigos quer falar com a
 *   pessoa; o cartão é o desvio, não o caminho. O alvo de clique é um botão
 *   sobreposto — o texto fica `pointer-events-none` para o clique atravessar —
 *   porque um `<button>` de verdade não pode conter os outros botões da linha.
 * - **O recuo é assimétrico, não `mx-6` uniforme.** `.peopleListItem_cc6179`
 *   (`docs/referencias-discord/tokens/css-bruto/979862.64f198e8e991d925.css`):
 *   `margin-inline:14px 10px;padding:16px 10px` — 14 (margem) + 10 (padding) =
 *   **24** à esquerda, 10 + 10 = **20** à direita. Conferido no print 1:1
 *   (`docs/Reference/Captura de tela 2026-09-02 152318.png`): avatar e "Online
 *   — 5" começam na mesma coluna (x≈397–399). Com `mx-6` (24) **somado** ao
 *   `px-[10px]` já existente, o nosso avatar nascia 10px mais para dentro do
 *   que o título/busca — visível na nossa captura (avatar em x=400 contra
 *   título/busca em x≈390–392, 8–10px de diferença que o Discord não tem).
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
      className="group relative ml-[14px] mr-[10px] flex h-[61px] items-center gap-3 rounded-lg px-[10px] hover:bg-interactive-background-hover celular:mx-2 celular:gap-2.5 [&:hover+div]:bg-transparent"
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
        // o avatar mede 32 e não pode crescer sem empurrar a linha de 61: o que
        // cresce é o alvo, por um pseudo-elemento invisível de 46
        className="relative shrink-0 rounded-full celular:before:absolute celular:before:-inset-[7px] celular:before:content-['']"
      >
        <Avatar user={live} size="md" status={status} surface="border-background-base-lower" />
      </button>

      {/* o texto deixa o clique passar para o botão que cobre a linha */}
      <span className="pointer-events-none relative min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-base font-semibold text-text-strong">{nome}</span>
          {/* `.discriminator__0a06e{visibility:hidden}` + `.hovered__0a06e .discriminator__0a06e{visibility:visible}`:
              o usuário só aparece no hover da linha, sem '@' — não é um rótulo permanente. */}
          <span className="invisible truncate text-sm leading-4 text-text-default group-hover:visible">
            {live.username}
          </span>
        </span>
        <span className="block truncate text-sm text-text-muted">{rodape}</span>
      </span>

      {/* 10px entre os círculos, medido no hover da linha do Discord */}
      <div className="relative flex shrink-0 items-center gap-2.5 celular:gap-0">
        {actions}
        {menu && menu.length > 0 && (
          <BotaoDeIcone
            rotulo="Mais"
            icone={<MoreVertical size={20} />}
            // `tamanho` como degrau nomeado (não número): o número força o
            // tamanho por `style` inline, que bate o `celular:` de baixo — o
            // `className` só ganha de um degrau nomeado (a caixa dele é
            // classe, não `style`; ver cabeçalho de BotaoDeIcone.tsx). `md`
            // aqui é só o ponto de partida; a caixa real vem do `h-9 w-9`.
            tamanho="md"
            forma="disco"
            fundo="hover"
            onClick={abrirMenu}
            className="h-9 w-9 celular:h-[44px] celular:w-[44px]"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Botão redondo de ação da linha (mensagem, aceitar, recusar).
 *
 * É o `BotaoDeIcone` (36px por `className`, disco, `fundo="hover"`) — a família
 * `.actionButton_f8fa06` que o próprio primitivo já documenta e mede (36×36,
 * ícone 20, hover pinta `interactive-background-hover`, tom `perigo`/`positivo`
 * tinge só o hover, `.actionAccept_f8fa06`/`.actionDeny_f8fa06`). Antes este
 * componente reimplementava a mesma caixa à mão, com `hover:bg-interactive-
 * background-selected` (o tom do *ativo*, não do hover simples — outro token)
 * e `hover:text-status-*` (cor de bolinha de status, não de ícone de feedback).
 * Trocar pelo primitivo fecha as duas divergências de uma vez, sem redesenhar
 * a caixa (o tamanho de 36px já batia).
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
    <BotaoDeIcone
      rotulo={label}
      icone={children}
      // mesma razão do botão "…" logo acima: degrau nomeado + `className`
      // (não `tamanho` numérico) para o `celular:` conseguir crescer a caixa.
      tamanho="md"
      forma="disco"
      fundo="hover"
      tom={danger ? "perigo" : positive ? "positivo" : "neutro"}
      onClick={onClick}
      className="h-9 w-9 celular:h-[44px] celular:w-[44px]"
    />
  );
}

/**
 * Linha "carregando" — o mesmo recorte da linha real (recuo, altura, avatar),
 * para a lista não pular de tamanho quando os dados chegam. Segue o padrão de
 * esqueleto que já existe no app (`animate-pulse` sobre `background-base-
 * lowest`, como em `UserProfileModal.tsx`) em vez de um texto solto — o
 * Discord não tem um estado "carregando" próprio na página Amigos (a lista
 * some do cache antes de qualquer re-render), então a régua aqui é a
 * convenção interna, não um print.
 */
export function FriendRowEsqueleto() {
  return (
    <div
      aria-hidden="true"
      className="ml-[14px] mr-[10px] flex h-[61px] items-center gap-3 border-t border-border-subtle px-[10px] first:border-t-0 celular:mx-2 celular:gap-2.5"
    >
      <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-background-base-lowest" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-3.5 w-32 animate-pulse rounded bg-background-base-lowest" />
        <span className="h-3 w-20 animate-pulse rounded bg-background-base-lowest" />
      </span>
    </div>
  );
}
