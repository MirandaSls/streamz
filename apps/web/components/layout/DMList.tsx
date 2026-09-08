"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  Amigos,
  Inbox,
  LogOut,
  MessageSquarePlus,
  Phone,
  Plus,
  Search,
  Settings,
  UserPlus,
  X,
} from "@/components/ui/icones";
import {
  channelNotificationScope,
  displayNameOf,
  isGroupChannel,
  isUnread,
  type DMChannelView,
  type PublicUser,
} from "@streamz/shared";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { api } from "@/lib/api";
import { useEhMobile } from "@/hooks/useEhMobile";
import { EVENTO_CAIXA_DE_ENTRADA } from "@/lib/caixa-de-entrada";
import { useT } from "@/lib/i18n";
import { submenuSilenciar } from "@/lib/notification-menu";
import { dmTitle, useDMs } from "@/stores/dms";
import { useFriends, usePendingCount } from "@/stores/friends";
import { rotuloDoContador } from "@/stores/nao-lidas";
import { useNotifications } from "@/stores/notifications";
import { resolveStatus, usePresence } from "@/stores/presence";
import { useSettings } from "@/stores/settings";
import { anchorOf, ui, useUI, type MenuItem } from "@/stores/ui";
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
  // busca em repouso imita o botão do Discord: rótulo centrado; ao focar/digitar
  // o texto volta para a esquerda (`::placeholder` não aceita text-align)
  const [buscaFocada, setBuscaFocada] = useState(false);
  /** no celular a busca nasce fechada: é um botão redondo que abre o campo. */
  const [buscaAberta, setBuscaAberta] = useState(false);
  const celular = useEhMobile();
  const [found, setFound] = useState<PublicUser[]>([]);
  // f-voz: conversas com chamada rolando ganham o ícone verde de telefone
  const emChamada = useVoice((s) => s.states);
  const startCall = useVoice((s) => s.startCall);
  const porEscopo = useNotifications((s) => s.porEscopo);
  const developerMode = useSettings((s) => s.developerMode);
  const t = useT();

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

  function openMenu(e: MouseEvent, dm: DMChannelView, linha?: HTMLElement | null) {
    e.preventDefault();
    const group = isGroupChannel(dm);
    const outro = dm.others[0];
    const escopo = { tipo: "canal" as const, channelId: dm.id };
    const setting = porEscopo[channelNotificationScope(dm.id)];
    const items: MenuItem[] = [
      { label: "Marcar como lida", onSelect: () => void markRead(dm.id) },
    ];
    if (!group && outro) {
      items.push({ separator: true });
      items.push({
        label: "Perfil",
        onSelect: () =>
          ui.openProfile(
            outro,
            linha ? anchorOf(linha) : { x: e.clientX, y: e.clientY, width: 0, height: 0 },
          ),
      });
      items.push({
        label: "Chamada",
        icon: <Phone size={18} />,
        onSelect: () => void startCall(dm.id, false),
      });
    }
    if (group) {
      items.push({ separator: true });
      items.push({
        label: "Convidar para o grupo",
        icon: <UserPlus size={18} />,
        onSelect: () => ui.openModal({ kind: "addGroupMembers", channelId: dm.id }),
      });
      items.push({
        label: "Alterar ícone",
        icon: <Settings size={18} />,
        onSelect: () => ui.openModal({ kind: "groupSettings", channelId: dm.id }),
      });
    }
    items.push({ separator: true });
    items.push(submenuSilenciar("Silenciar conversa", escopo, setting, t));
    items.push({ separator: true });
    // fechar não apaga nada: a conversa volta sozinha com mensagem nova
    items.push({ label: "Fechar conversa", icon: <X size={18} />, onSelect: () => void hide(dm.id) });
    if (group) {
      items.push({
        label: "Sair do grupo",
        icon: <LogOut size={18} />,
        danger: true,
        onSelect: () => void leaveGroup(dm.id),
      });
    }
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID do canal",
        onSelect: () => void navigator.clipboard?.writeText(dm.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  /**
   * A lista em si — a mesma nos dois leiautes. Só a moldura muda: no desktop a
   * coluna de 294px com o campo de busca no topo; no celular o cabeçalho
   * "Mensagens" com a fileira de ações e o botão flutuante.
   */
  const corpoDaLista = (
      <div role="list" aria-label="Conversas" className="flex-1 overflow-y-auto pb-[78px] pt-2">
      {/* ── d-social ── a home do modo DM, com o badge de pedidos pendentes.
          No celular ela não existe: "Adicionar amigos" já é a pílula do
          cabeçalho, e na captura a lista começa direto nas conversas. */}
      {!celular && (
      <button
        type="button"
        // marca sem pixel: o shell do celular ouve o toque na lista por
        // delegação para empilhar a tela certa (ver `ShellMobile`)
        data-amigos-button
        onClick={() => setFriendsOpen(true)}
        aria-current={friendsOpen ? "true" : undefined}
        className={"mx-2 flex h-10 w-[calc(100%-1rem)] items-center gap-3 rounded-lg pl-3 pr-2 text-left " + (friendsOpen ? "bg-sel text-txt-primary" : "text-txt-faint hover:bg-hov hover:text-txt-normal")}
      >
        <Amigos size={21} aria-hidden="true" className="shrink-0" />
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
      )}

      {novos.length > 0 && (
        <>
          <h3 className="pl-5 pr-5 pt-3 pb-0.5 text-xs font-semibold text-txt-muted">
            Pessoas
          </h3>
          {novos.map((u) => (
            <button
              key={u.id}
              type="button"
              role="listitem"
              data-dm-button
              onClick={() => {
                setQuery("");
                void openWith(u.id);
              }}
              className="mx-2 mb-0.5 flex h-12 w-[calc(100%-1rem)] items-center gap-3 rounded-lg pl-[10px] pr-2 text-left text-txt-faint hover:bg-hov hover:text-txt-normal"
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

      {/* linha da largura do item (278px), logo antes do título da seção */}
      {!celular && <div className="mx-2 mt-3 border-t border-border" />}

      {!celular && (
      <div className="group flex items-center justify-between pl-5 pr-3.5 pt-3 pb-0.5">
        <h3 className="text-xs font-semibold text-txt-muted group-hover:text-txt-normal">
          Mensagens diretas
        </h3>
        <Tooltip label="Nova conversa">
          <button
            type="button"
            onClick={() => openModal({ kind: "createGroupDM" })}
            aria-label="Nova conversa"
            className="text-txt-muted transition hover:text-txt-primary"
          >
            <Plus size={20} />
          </button>
        </Tooltip>
      </div>
      )}

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
            onContextMenu={(e) => openMenu(e, dm, e.currentTarget)}
            className={`group mx-2 mb-0.5 flex h-12 items-center rounded-lg pl-[10px] pr-2 ${
              active
                ? "bg-sel text-txt-primary"
                : unread
                  ? "text-txt-primary hover:bg-hov"
                  : "text-txt-faint hover:bg-hov hover:text-txt-normal"
            }`}
          >
            <button
              type="button"
              data-dm-button
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
            {/* Um só encaixe de 24px na borda direita para o badge e o X:
                em repouso mostra o número, no hover o X toma o lugar dele,
                como no Discord. Antes o X invisível ficava ao lado e
                empurrava o badge 24px para dentro da linha. */}
            <span className="relative grid h-6 w-6 shrink-0 place-items-center">
              {/* em conversa toda mensagem não lida conta, como no Discord —
                  o número é de mensagens, não só de menções */}
              {dm.unreadCount > 0 && !active && (
                <span
                  aria-label={`${dm.unreadCount} não lidas`}
                  className="absolute grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[12px] font-bold leading-none text-white group-hover:hidden group-focus-within:hidden"
                >
                  {rotuloDoContador(dm.unreadCount)}
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
            </span>
          </div>
        );
      })}
    </div>
  );

  if (celular) {
    /*
      Cabeçalho de celular, medido em `discord-mobile-dms-2024.png`: título
      "Mensagens" grande, e abaixo a fileira com dois botões redondos (busca e
      caixa de entrada) e a pílula larga "Adicionar amigos". A busca de conversa
      do desktop (um campo de 32px no topo) vira o **botão redondo**, e o campo
      só aparece quando ele é tocado — num telefone um campo permanente ali
      custa uma linha inteira que a lista quer.
    */
    return (
      <aside className="flex w-[294px] shrink-0 flex-col bg-panel">
        <div className="shrink-0 border-b border-border px-4 pb-3 pt-2">
          <h1 className="py-1 font-display text-2xl font-bold tracking-title text-txt-primary">
            Mensagens
          </h1>
          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBuscaAberta((v) => !v)}
              aria-label="Buscar conversa"
              aria-expanded={buscaAberta}
              /* Alvo de 44 com **círculo de 40** dentro: 40 é a medida da
                 captura e 44 é o piso de toque, e aqui os dois se contradizem.
                 Em vez de escolher, o desenho fica com a medida e a área
                 clicável cresce por fora — o pixel é o do Discord e o dedo tem
                 o alvo do HIG. */
              className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-txt-secondary transition"
            >
              <span className="grid h-[40px] w-[40px] place-items-center rounded-full bg-hov transition active:bg-border-strong">
                <Search size={18} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(EVENTO_CAIXA_DE_ENTRADA))}
              aria-label="Caixa de entrada"
              /* mesmo alvo de 44 com desenho de 40 do botão de busca */
              className="relative grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-txt-secondary transition"
            >
              <span className="grid h-[40px] w-[40px] place-items-center rounded-full bg-hov transition active:bg-border-strong">
                <Inbox size={18} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFriendsOpen(true)}
              data-amigos-button
              /* A pílula fica nos 40 medidos: o piso de 44 existe para alvo
                 pequeno, e este tem ~200px de largura — quem erra um botão
                 desses não erra por 4px de altura. */
              className="flex h-[40px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-hov px-3 text-sm font-medium text-txt-normal transition active:bg-border-strong"
            >
              <UserPlus size={18} aria-hidden="true" className="shrink-0" />
              <span className="truncate whitespace-nowrap">Adicionar amigos</span>
              {pendentes > 0 && (
                <span
                  aria-label={`${pendentes} pendentes`}
                  className="grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[11px] font-bold leading-none text-white"
                >
                  {pendentes}
                </span>
              )}
            </button>
          </div>
          {buscaAberta && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              aria-label="Encontrar ou começar uma conversa"
              placeholder="Encontrar ou começar uma conversa"
              className="mt-2 h-[40px] w-full rounded-full bg-hov px-4 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
            />
          )}
        </div>

        {corpoDaLista}

        {/* Botão flutuante de nova conversa: 56pt, a 20 da borda direita e 20
            da base da coluna — medido na captura (109px/1,9707 = 55,3). */}
        <button
          type="button"
          onClick={() => openModal({ kind: "createGroupDM" })}
          aria-label="Nova conversa"
          className="absolute bottom-5 right-5 z-10 grid h-[56px] w-[56px] place-items-center rounded-full bg-accent text-accent-ink shadow-high transition active:bg-accent-hover"
        >
          <MessageSquarePlus size={24} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[294px] shrink-0 flex-col bg-panel">
      <div className="flex h-[49px] shrink-0 items-center border-b border-border px-2.5 shadow-header">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setBuscaFocada(true)}
          onBlur={() => setBuscaFocada(false)}
          type="search"
          aria-label="Encontrar ou começar uma conversa"
          placeholder="Encontrar ou começar uma conversa"
          /* o campo é `hov` (#222225) e não `void`: medido no print do Discord
             `2026-09-04 102757` (x 46-77, y 42-71), lá ele CLAREIA sobre a
             coluna em vez de escurecer — e com a coluna em #121214 um campo
             Void Ink sumiria dentro dela */
          className={
            "h-8 w-full rounded-lg bg-hov px-1.5 text-sm text-txt-normal outline-none placeholder:text-txt-muted " +
            (buscaFocada || query ? "text-left" : "text-center")
          }
        />
      </div>

      {corpoDaLista}
    </aside>
  );
}
