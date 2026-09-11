"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  Amigos,
  Apps,
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
  linhaDaPrevia,
  type DMChannelView,
  type PublicUser,
} from "@streamz/shared";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { BotaoDeIcone, TextInput } from "@/components/ui/primitivos";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { api } from "@/lib/api";
import { useEhMobile } from "@/hooks/useEhMobile";
import { EVENTO_CAIXA_DE_ENTRADA } from "@/lib/caixa-de-entrada";
import { useT } from "@/lib/i18n";
import { submenuSilenciar } from "@/lib/notification-menu";
import { useAplicativos } from "@/stores/aplicativos";
import { autorDaPrevia, dmTitle, useDMs } from "@/stores/dms";
import { useAuth } from "@/stores/auth";
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
  // ── j-bots · F4 ── "Descobrir aplicativos" é um item desta lista
  const appsAbertos = useAplicativos((s) => s.aberto);
  const abrirApps = useAplicativos((s) => s.abrir);
  /*
    Só um item desta coluna fica marcado por vez, porque só um deles está na
    coluna 3. O diretório **cobre** a coluna 3 (`app/app/page.tsx`) sem mexer no
    `view` nem no `open` de amigos, então enquanto ele está aberto a página
    Amigos e a conversa ativa continuam no estado, mas não na tela — e sem esta
    conta duas linhas apareceriam selecionadas ao mesmo tempo.
  */
  const amigosSelecionado = friendsOpen && !appsAbertos;
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
  const meuId = useAuth((s) => s.user?.id);
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
        aria-current={amigosSelecionado ? "true" : undefined}
        className={"mx-2 flex h-10 w-[calc(100%-1rem)] items-center gap-3 rounded-lg pl-3 pr-2 text-left " + (amigosSelecionado ? "bg-interactive-background-selected text-text-strong" : "text-channels-default hover:bg-interactive-background-hover hover:text-text-default")}
      >
        <Amigos size={21} aria-hidden="true" className="shrink-0" />
        <span className="flex-1 font-medium">Amigos</span>
        {pendentes > 0 && (
          <span
            aria-label={pendentes === 1 ? "1 pedido de amizade" : `${pendentes} pedidos de amizade`}
            className="grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[11px] font-bold leading-none text-control-critical-primary-text-default"
          >
            {pendentes}
          </span>
        )}
      </button>
      )}

      {/*
        ── j-bots · F4 ── "Descobrir aplicativos", logo abaixo de "Amigos".

        Aqui, e não na rail de servidores onde nasceu: esta é a coluna em que o
        Discord põe a navegação **da home** (Amigos, Nitro, Loja), e a rail é a
        coluna de servidores. O item copia o botão "Amigos" linha por linha —
        mesma altura de 40, mesmo recuo, ícone de 21 à esquerda, o mesmo `bg-interactive-background-selected`
        de selecionado e o mesmo `hover:bg-interactive-background-hover` — porque é o mesmo tipo de item.

        O ícone é o `Apps`, as quatro formas do App Directory. **Não é uma
        bússola**: o `explore.svg` do acervo não é uma bússola, apesar do nome
        (está escrito em `icones.tsx`), e o robô (`Bot`) é o do portal do
        desenvolvedor, nas configurações.

        `abrir()` não mexe em `ui.view`: o diretório não é um terceiro modo das
        colunas 1 e 2 (ver o cabeçalho de `stores/aplicativos.ts`) — ele abre por
        cima da coluna 3, com esta lista intacta ao lado, que é o que "Amigos"
        também faz. Entrar num servidor o fecha pelo mesmo caminho de sempre (o
        `fecharApps()` do `GuildRail` e o `FecharAoNavegar` de `app/app/page.tsx`).

        **No celular ele fica no mesmo lugar da lista, mas o "Amigos" acima dele
        não existe**: lá "Adicionar amigos" é a pílula do cabeçalho (a condição
        `!celular` logo acima), então este item é a primeira linha da lista. É
        por isso que ele não tem o `!celular` — o item vale nos dois leiautes, e
        no telefone quem empilha a tela cheia é o `ShellMobile`, ouvindo o
        `data-apps-button` por delegação de clique, o mesmo caminho de
        `data-dm-button` e `data-amigos-button`.
      */}
      <button
        type="button"
        data-apps-button
        onClick={() => abrirApps()}
        aria-current={appsAbertos ? "true" : undefined}
        className={"mx-2 flex h-10 w-[calc(100%-1rem)] items-center gap-3 rounded-lg pl-3 pr-2 text-left " + (appsAbertos ? "bg-interactive-background-selected text-text-strong" : "text-channels-default hover:bg-interactive-background-hover hover:text-text-default")}
      >
        <Apps size={21} aria-hidden="true" className="shrink-0" />
        <span className="flex-1 truncate font-medium">Descobrir aplicativos</span>
      </button>

      {novos.length > 0 && (
        <>
          <h3 className="pl-5 pr-5 pt-3 pb-0.5 text-xs font-semibold text-text-muted">
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
              className="mx-2 mb-0.5 flex h-12 w-[calc(100%-1rem)] items-center gap-3 rounded-lg pl-[10px] pr-2 text-left text-channels-default hover:bg-interactive-background-hover hover:text-text-default"
            >
              <Avatar user={u} size="md" status={resolveStatus(statuses, u)} surface="border-background-base-lowest" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{displayNameOf(u)}</span>
                <span className="block truncate text-xs text-text-muted">@{u.username}</span>
              </span>
            </button>
          ))}
        </>
      )}

      {/*
        Linha da largura do item (278px), logo antes do título da seção.

        **Também no celular**, agora que "Descobrir aplicativos" abre a lista
        lá: sem ela o item de navegação encostava na primeira conversa e as duas
        coisas viravam uma lista só. No desktop ela já existia por causa do
        "Amigos" — é o mesmo papel, o de separar a navegação da home das
        conversas. (Lá o título "Mensagens diretas" vem logo abaixo; no celular
        o cabeçalho da tela já diz "Mensagens" e ele seria repetição.)
      */}
      <div className="mx-2 mt-3 border-t border-border-subtle" />

      {!celular && (
      <div className="group flex items-center justify-between pl-5 pr-3.5 pt-3 pb-0.5">
        <h3 className="text-xs font-semibold text-text-muted group-hover:text-text-default">
          Mensagens diretas
        </h3>
        <BotaoDeIcone
          rotulo="Nova conversa"
          icone={<Plus size={20} />}
          tamanho="md"
          onClick={() => openModal({ kind: "createGroupDM" })}
        />
      </div>
      )}

      {loading && channels.length === 0 && (
        <p className="px-4 py-1 text-sm text-text-muted">Carregando conversas…</p>
      )}
      {!loading && channels.length === 0 && (
        <p className="px-4 py-1 text-sm text-text-muted">
          Nenhuma conversa. Busque alguém acima para começar.
        </p>
      )}
      {visible.map((dm) => {
        const title = dmTitle(dm);
        const active = activeId === dm.id && !friendsOpen && !appsAbertos;
        const group = isGroupChannel(dm);
        const other = !group ? dm.others[0] : undefined;
        const unread = !active && isUnread(dm);
        /*
          ── prévia da última mensagem ── "autor: texto" embaixo do nome, na cor
          da linha, medido em `docs/Reference/mobile/discord-mobile-dms-2024.png`.

          **Só no celular**, e isso é paridade, não economia: no Discord do
          desktop a coluna de conversas tem o nome e nada mais — medido no print
          `docs/Reference/Captura de tela 2026-09-04 102757.png`, onde as treze
          conversas mostram só o nome e o grupo mostra "2 membros". A prévia é
          um traço do aplicativo de celular. `DMChannelView.ultimaMensagem` chega
          nas duas telas e a store a mantém em dia nas duas; se um dia o desktop
          quiser a linha, é este `celular &&` que sai.

          A calha é a mesma que o "N membros" do grupo já ocupava, então a linha
          continua com 48px nos dois leiautes.
        */
        const previa = celular
          ? linhaDaPrevia(dm.ultimaMensagem, {
              autor: autorDaPrevia(dm, meuId),
              emChamada: (emChamada[dm.id]?.length ?? 0) > 0,
            })
          : "";
        return (
          <div
            key={dm.id}
            role="listitem"
            onContextMenu={(e) => openMenu(e, dm, e.currentTarget)}
            className={`group mx-2 mb-0.5 flex h-12 items-center rounded-lg pl-[10px] pr-2 ${
              active
                ? "bg-interactive-background-selected text-text-strong"
                : unread
                  ? "text-text-strong hover:bg-interactive-background-hover"
                  : "text-channels-default hover:bg-interactive-background-hover hover:text-text-default"
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
                <Avatar user={other} size="md" status={resolveStatus(statuses, other)} surface={active ? "border-interactive-background-selected" : "border-background-base-lowest"} />
              ) : (
                <GroupAvatar iconUrl={dm.iconUrl} size="md" />
              )}
              <span className="min-w-0">
                <span className={`block truncate ${unread ? "font-semibold" : "font-medium"}`}>{title}</span>
                {previa ? (
                  <span className={`block truncate text-xs ${unread ? "font-medium" : ""}`}>
                    {previa}
                  </span>
                ) : group ? (
                  <span className="block truncate text-xs text-text-muted">
                    {dm.others.length + 1} membros
                  </span>
                ) : null}
              </span>
            </button>
            {(emChamada[dm.id]?.length ?? 0) > 0 && (
              <Tooltip label="Chamada em andamento">
                <span
                  data-dm-call={dm.id}
                  aria-label={`Chamada em andamento em ${title}`}
                  className="grid h-6 w-6 place-items-center text-status-positive"
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
                  className="absolute grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[12px] font-bold leading-none text-control-critical-primary-text-default group-hover:hidden group-focus-within:hidden"
                >
                  {rotuloDoContador(dm.unreadCount)}
                </span>
              )}
              <BotaoDeIcone
                rotulo={group ? `Sair do grupo ${title}` : `Fechar conversa com ${title}`}
                icone={group ? <LogOut size={16} /> : <X size={16} />}
                tamanho="sm"
                onClick={() => (group ? void leaveGroup(dm.id) : void hide(dm.id))}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              />
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
      <aside className="flex w-[294px] shrink-0 flex-col bg-background-base-lowest">
        <div className="shrink-0 border-b border-border-subtle px-4 pb-3 pt-2">
          <h1 className="py-1 text-2xl font-bold text-text-strong">
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
              className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-text-subtle transition"
            >
              <span className="grid h-[40px] w-[40px] place-items-center rounded-full bg-interactive-background-hover transition active:bg-border-normal">
                <Search size={18} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(EVENTO_CAIXA_DE_ENTRADA))}
              aria-label="Caixa de entrada"
              /* mesmo alvo de 44 com desenho de 40 do botão de busca */
              className="relative grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-text-subtle transition"
            >
              <span className="grid h-[40px] w-[40px] place-items-center rounded-full bg-interactive-background-hover transition active:bg-border-normal">
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
              className="flex h-[40px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-interactive-background-hover px-3 text-sm font-medium text-text-default transition active:bg-border-normal"
            >
              <UserPlus size={18} aria-hidden="true" className="shrink-0" />
              <span className="truncate whitespace-nowrap">Adicionar amigos</span>
              {pendentes > 0 && (
                <span
                  aria-label={`${pendentes} pendentes`}
                  className="grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[11px] font-bold leading-none text-control-critical-primary-text-default"
                >
                  {pendentes}
                </span>
              )}
            </button>
          </div>
          {buscaAberta && (
            <TextInput
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              aria-label="Encontrar ou começar uma conversa"
              placeholder="Encontrar ou começar uma conversa"
              tamanho="sm"
              classeDaCaixa="mt-2 w-full !h-[40px] !rounded-full !bg-interactive-background-hover !border-transparent !px-4"
              className="!text-sm !text-text-default placeholder:!text-text-muted"
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
          className="absolute bottom-5 right-5 z-10 grid h-[56px] w-[56px] place-items-center rounded-full bg-brand-500 text-control-primary-text-default shadow-popout transition active:bg-control-primary-background-hover"
        >
          <MessageSquarePlus size={24} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[294px] shrink-0 flex-col bg-background-base-lowest">
      <div className="flex h-[49px] shrink-0 items-center border-b border-border-subtle px-2.5 shadow-elevation-low">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setBuscaFocada(true)}
          onBlur={() => setBuscaFocada(false)}
          type="search"
          aria-label="Encontrar ou começar uma conversa"
          placeholder="Encontrar ou começar uma conversa"
          tamanho="sm"
          /* o campo é `hov` (#222225) e não `void`: medido no print do Discord
             `2026-09-04 102757` (x 46-77, y 42-71), lá ele CLAREIA sobre a
             coluna em vez de escurecer — e com a coluna em #121214 um campo
             Void Ink sumiria dentro dela */
          classeDaCaixa="w-full !bg-interactive-background-hover !border-transparent !px-1.5"
          className={
            "!text-sm !text-text-default placeholder:!text-text-muted " +
            (buscaFocada || query ? "text-left" : "text-center")
          }
        />
      </div>

      {corpoDaLista}
    </aside>
  );
}
