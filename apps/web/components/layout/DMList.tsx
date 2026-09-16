"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  Amigos,
  Apps,
  Inbox,
  LogOut,
  MessageSquarePlus,
  Phone,
  Pin,
  PinOff,
  Plus,
  Search,
  UserPlus,
  X,
} from "@/components/ui/icones";
import {
  WS_EVENTS,
  channelNotificationScope,
  displayNameOf,
  isGroupChannel,
  isMuted,
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
import { urlDeConvite } from "@/lib/links-de-convite";
import { useNomeParaMim } from "@/lib/nome-para-mim";
import { submenuSilenciar } from "@/lib/notification-menu";
import { useAplicativos } from "@/stores/aplicativos";
import { autorDaPrevia, dmTitle, useDMs } from "@/stores/dms";
import { useAuth } from "@/stores/auth";
import { useFriends, usePendingCount } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { useNotas } from "@/stores/notas";
import { useNotifications } from "@/stores/notifications";
import { resolveStatus, usePresence } from "@/stores/presence";
import { useSettings } from "@/stores/settings";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { anchorOf, ui, useUI, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/** Coluna 2 no modo DM: busca de pessoas, conversas 1-a-1 e grupos. */
export default function DMList() {
  const channels = useDMs((s) => s.channels);
  const loading = useDMs((s) => s.loadingList);
  const openWith = useDMs((s) => s.openWith);
  // ── d-social ── a página Amigos é a home do modo DM
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
        /* Era 36 (`h-9`) por `.channel__972a0:not(.dm__972a0) .link__972a0`
           (CSS bruto, `834050.a72484b38a3a361e.css`: `padding-block:8px 8px`
           sobre ícone de 20 = 8+20+8=36) com `pl-2 pr-4` e `gap-2`.
           Rodada de correção (Captura de tela `152318.png`, coluna x=250):
           "Amigos" selecionado mede 38 (y 91–128), com Nitro/Loja/Missões a
           cada 40 (centros em y=109,149,189,229) — o CSS bruto mediu o botão
           sozinho, sem a rima de 40 entre os itens da navegação da home. E o
           glifo/texto ficam mais recuados do que o CSS bruto media: por isso
           `h-9`→`h-[38px]` com `mb-0.5` (fecha o passo de 40), `pl-2`→
           `pl-2.5` e `gap-2`→`gap-3`. */
        className={"mx-2 mb-0.5 flex h-[38px] w-[calc(100%-1rem)] items-center gap-3 rounded-lg pl-2.5 pr-4 text-left " + (amigosSelecionado ? "bg-interactive-background-selected text-text-strong" : "text-channels-default hover:bg-interactive-background-hover hover:text-text-default")}
      >
        <Amigos size={20} aria-hidden="true" className="shrink-0" />
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
        mesma altura de 36, mesmo recuo, ícone de 20 à esquerda, o mesmo `bg-interactive-background-selected`
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
        // mesma medida do "Amigos" acima (h-[38px] mb-0.5, pl-2.5 pr-4, gap-3, ícone 20)
        className={"mx-2 mb-0.5 flex h-[38px] w-[calc(100%-1rem)] items-center gap-3 rounded-lg pl-2.5 pr-4 text-left " + (appsAbertos ? "bg-interactive-background-selected text-text-strong" : "text-channels-default hover:bg-interactive-background-hover hover:text-text-default")}
      >
        <Apps size={20} aria-hidden="true" className="shrink-0" />
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
              // pl-2/gap-2: `.link__972a0{padding-inline:8px 0;gap:8px}` (CSS bruto)
              className="mx-2 mb-0.5 flex h-12 w-[calc(100%-1rem)] items-center gap-2 rounded-lg pl-2 pr-2 text-left text-channels-default hover:bg-interactive-background-hover hover:text-text-default"
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
      {/* `.sectionDivider_e6b769{margin:12px 8px}` (CSS bruto): 12 em cima
          E embaixo, não só em cima — por isso `my-3`, não `mt-3`. */}
      <div className="mx-2 my-3 border-t border-border-subtle" />

      {!celular && (
      /* `.directMessagesHeader_e6b769` (CSS bruto): 48 de altura fixa,
         `padding:8px 16px` com `padding-inline-end:8px` (16 só na esquerda,
         8 nos outros três lados) — não a altura automática com
         `pl-5 pr-3.5 pt-3 pb-0.5` de antes.
         Rodada de correção (print 1:1 vence o CSS bruto, ver cabeçalho do
         cartão): `border-b` saiu — Captura de tela `152318.png`/`101638.png`,
         coluna x=250, mostram o divisor da navegação em y=262/268 e NADA
         abaixo até y=300, e `.privateChannelsHeaderContainer__99e7c` não
         declara borda nenhuma; o nosso `border-b border-border-subtle`
         desenhava uma segunda linha que o Discord não tem. `pl-4` (16) virou
         `pl-5` (20): o texto começa em x=101 na coluna que começa em 81. E o
         `h3` foi de `text-xs` para `text-sm`: a versal "M" mede 10px de altura
         no print (y 280–289), o que dá ≈14px de corpo, não os 12px de
         `text-xs`. */
      <div className="group flex h-12 items-center justify-between pl-5 pr-2 py-2">
        <h3 className="text-sm font-semibold text-text-muted group-hover:text-text-default">
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
      {visible.map((dm) => (
        <LinhaDeConversa key={dm.id} dm={dm} amigosOuAppsAbertos={friendsOpen || appsAbertos} />
      ))}
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
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBuscaAberta((v) => !v)}
              aria-label="Buscar conversa"
              aria-expanded={buscaAberta}
              /* Rodada de correção: a pílula "Adicionar amigos" truncava
                 ("Adicionar ami…") em 390px, e o Discord mostra o rótulo
                 inteiro (`discord-mobile-dms-2024.png`). O piso de toque de
                 44 não pode descer, então quem cede é o espaço que o
                 WRAPPER de 44 tomava na fileira: o botão agora É o círculo
                 de 40 (a medida da captura), e o alvo cresce por FORA da
                 caixa via `::before` (`-inset-0.5` = -2px por lado, 40+2+2=
                 44) — não consome largura do layout como o wrapper de 44
                 consumia. Isso mais o `gap-1` (era `gap-1.5`) logo acima
                 devolvem ~12px para a pílula ao lado. */
              className="relative grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full bg-interactive-background-hover text-text-subtle transition before:absolute before:-inset-0.5 before:content-[''] active:bg-border-normal"
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(EVENTO_CAIXA_DE_ENTRADA))}
              aria-label="Caixa de entrada"
              /* mesma técnica do botão de busca acima */
              className="relative grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full bg-interactive-background-hover text-text-subtle transition before:absolute before:-inset-0.5 before:content-[''] active:bg-border-normal"
            >
              <Inbox size={18} />
            </button>
            <button
              type="button"
              onClick={() => setFriendsOpen(true)}
              data-amigos-button
              /* mesma decisão dos dois botões redondos acima (cartão
                 8j-dms-no-celular, LEIAUTE-MOBILE-COBERTURA.md §6.2): a
                 pílula visual fica nos 40 medidos em `discord-mobile-dms-
                 2024.png`, mas o alvo de toque cresce até o piso de 44 — não
                 só nos dois círculos, nas três peças do cabeçalho, a mesma
                 regra aplicada por igual (o mecanismo mudou nos círculos —
                 ver o comentário deles —, mas o piso continua o mesmo aqui,
                 por wrapper, já que esta peça é `flex-1` e não perde largura
                 para vizinho nenhum). Antes esta era a exceção (a pílula
                 ficava com o alvo de 40 puro, com a justificativa de que
                 ~200px de largura já bastam); a tensão era do dono do shell
                 decidir, e este cartão decide: caixa visual medida, área de
                 toque de 44 — sem exceção por peça. */
              className="flex h-[44px] min-w-0 flex-1 items-center"
            >
              <span className="flex h-[40px] w-full min-w-0 items-center justify-center gap-2 rounded-full bg-interactive-background-hover px-3 text-sm font-medium text-text-default transition active:bg-border-normal">
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
              </span>
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
              /* 40 é medida própria da pílula do celular, não o `sm` de 32
                 — `tamanho` numérico vira `style.height` (inline), que já
                 ganha de qualquer classe sem precisar de `!important`.
                 `paddingLateral={16}` no lugar de `px-4` na `classeDaCaixa`
                 e `tamanhoDoTexto`/`classeDoTexto` no lugar do `className`
                 de tipografia, pelo mesmo motivo (ver cabeçalho de
                 `TextInput`): as classes cruas empatavam com as do
                 primitivo pela ordem do stylesheet gerado. */
              tamanho={40}
              semCaixa
              tamanhoDoTexto="sm"
              classeDoTexto="font-medium text-text-default placeholder:text-text-muted"
              paddingLateral={16}
              classeDaCaixa="mt-2 w-full rounded-full bg-interactive-background-hover border-transparent"
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
      {/* `.searchBar_e6b769{height:var(--custom-channel-header-height)}` = 49
          (`VARIAVEIS.md`). Rodada de correção: container `px-2` (8) virou
          `px-2.5` (10) — Captura de tela `152318.png` mede a caixa a 10px da
          borda da coluna (81→91 e 364→374), não os 8 de antes. E
          `shadow-elevation-low` saiu: a mesma captura, coluna x=250, mostra
          y 82–90 em `#121214` contínuo, sem faixa mais escura por baixo da
          borda, e `.searchBar_e6b769{box-shadow:none}` no CSS bruto confirma. */}
      <div className="flex h-[49px] shrink-0 items-center border-b border-border-subtle px-2.5">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setBuscaFocada(true)}
          onBlur={() => setBuscaFocada(false)}
          type="search"
          aria-label="Encontre ou comece uma conversa"
          placeholder="Encontre ou comece uma conversa"
          tamanho="sm"
          /* o campo é `hov` (#222225) e não `void`: medido no print do Discord
             `2026-09-04 102757` (x 46-77, y 42-71), lá ele CLAREIA sobre a
             coluna em vez de escurecer — e com a coluna em #121214 um campo
             Void Ink sumiria dentro dela. `semCaixa` tira o fundo/borda
             padrão do primitivo para não competir com os daqui — sem
             `!important` (cartão 1f-dm-lista). `paddingLateral={12}` é
             `.searchBarComponent_e6b769{padding:10px 12px}` (CSS bruto,
             valor literal, não var); `tamanhoDoTexto`/`classeDoTexto` trocam
             a tinta e o tamanho do `<input>` pelo mesmo motivo de sempre
             perder para a classe do primitivo (ver cabeçalho de
             `TextInput`).
             Rodada de correção (Captura de tela `152318.png`, coluna
             x=100): a borda é 1px `--input-border-default` (#262629), e não
             `border-transparent` — o Discord não muda a cor no hover, mas
             tem borda. E o placeholder claro (`#fbfbfb`, coluna x=125) vence
             o `--text-muted` (#96979e) que o módulo de CSS bruto indica: no
             print vale o claro e centralizado, e só o foco/texto digitado
             passa para a esquerda — por isso `placeholder:text-text-strong`
             no lugar de `-muted`, com o alinhamento ainda decidido pelo
             `buscaFocada`/`query` abaixo. */
          semCaixa
          tamanhoDoTexto="sm"
          classeDoTexto="font-medium text-text-default placeholder:text-text-strong"
          paddingLateral={12}
          // `border` (largura) vai explícito: `semCaixa` tira o `border` do
          // primitivo junto com a cor, e `border-input-border-default`
          // sozinho não desenha nada sem a largura.
          classeDaCaixa="w-full border border-input-border-default bg-interactive-background-hover"
          className={buscaFocada || query ? "text-left" : "text-center"}
        />
      </div>

      {corpoDaLista}
    </aside>
  );
}

/**
 * Uma linha da lista de conversas — componente próprio (não um trecho do
 * `.map()` de `DMList`) para poder chamar `useNomeParaMim` (apelido de amigo,
 * `docs/CONTRATO-MENUS.md` §3) por conversa: um hook não pode variar de
 * chamada em chamada dentro do mesmo componente, e cada linha tem um `other`
 * diferente — só dá para respeitar a regra dos hooks com uma instância de
 * componente por linha.
 *
 * `amigosOuAppsAbertos` vem do pai: é o único pedaço de estado que decide se
 * a linha "ativa" (`activeId === dm.id`) conta como selecionada de verdade —
 * a página Amigos e o diretório de apps cobrem a coluna 3 sem mudar
 * `activeId` (ver `DMList`), e replicar essa conta aqui bateria com a mesma
 * pergunta feita duas vezes por duas fontes.
 */
function LinhaDeConversa({
  dm,
  amigosOuAppsAbertos,
}: {
  dm: DMChannelView;
  amigosOuAppsAbertos: boolean;
}) {
  const activeId = useDMs((s) => s.activeId);
  const select = useDMs((s) => s.select);
  const leaveGroup = useDMs((s) => s.leaveGroup);
  const markRead = useDMs((s) => s.markRead);
  const hide = useDMs((s) => s.hide);
  const fixar = useDMs((s) => s.fixar);
  const desafixar = useDMs((s) => s.desafixar);
  const statuses = usePresence((s) => s.statuses);
  const emChamada = useVoice((s) => s.states[dm.id]?.length ?? 0);
  const startCall = useVoice((s) => s.startCall);
  const porEscopo = useNotifications((s) => s.porEscopo);
  const developerMode = useSettings((s) => s.developerMode);
  const meuId = useAuth((s) => s.user?.id);
  const celular = useEhMobile();
  const t = useT();

  // ── menus de contexto ── (docs/CONTRATO-MENUS.md §2, §3, §4 e §1)
  const friendsList = useFriends((s) => s.friends);
  const blockedList = useFriends((s) => s.blocked);
  const apelidos = useFriends((s) => s.apelidos);
  const ignoredList = useFriends((s) => s.ignored);
  const removeFriend = useFriends((s) => s.remove);
  const blockFriend = useFriends((s) => s.block);
  const unblockFriend = useFriends((s) => s.unblock);
  const ignorarUsuario = useFriends((s) => s.ignorar);
  const deixarDeIgnorarUsuario = useFriends((s) => s.deixarDeIgnorar);
  const minhasNotas = useNotas((s) => s.minhasNotas);
  const meusServidores = useGuilds((s) => s.guilds);

  const group = isGroupChannel(dm);
  const other = !group ? dm.others[0] : undefined;
  // `useNomeParaMim` exige um usuário: em grupo (sem `other`) o valor não é
  // usado, mas o hook precisa continuar sendo chamado sempre da mesma forma
  const nomeDoOutro = useNomeParaMim(other ?? SEM_OUTRO);
  const title = group ? dmTitle(dm) : nomeDoOutro;

  const active = activeId === dm.id && !amigosOuAppsAbertos;
  const unread = !active && isUnread(dm);
  /*
    ── prévia da última mensagem ── "autor: texto" embaixo do nome, na cor da
    linha, medido em `docs/Reference/mobile/discord-mobile-dms-2024.png`.

    **Só no celular**, e isso é paridade, não economia: no Discord do desktop
    a coluna de conversas tem o nome e nada mais — medido no print
    `docs/Reference/Captura de tela 2026-09-04 102757.png`, onde as treze
    conversas mostram só o nome e o grupo mostra "2 membros". A prévia é um
    traço do aplicativo de celular. `DMChannelView.ultimaMensagem` chega nas
    duas telas e a store a mantém em dia nas duas; se um dia o desktop quiser
    a linha, é este `celular &&` que sai.

    A calha é a mesma que o "N membros" do grupo já ocupava, então a linha
    continua com 48px nos dois leiautes.
  */
  const previa = celular
    ? linhaDaPrevia(dm.ultimaMensagem, { autor: autorDaPrevia(dm, meuId), emChamada: emChamada > 0 })
    : "";

  /**
   * Manda o convite deste servidor pela própria conversa: cria o link (a
   * mesma `api.createInvite` do `InviteModal`) e o envia como mensagem, em vez
   * de abrir outra DM — a pessoa já está na tela certa
   * (`docs/CONTRATO-MENUS.md`, item 9 da tabela, cartão web-dm).
   */
  async function enviarConviteNaConversa(guildId: string) {
    try {
      const invite = await api.createInvite(guildId);
      emit(WS_EVENTS.MESSAGE_CREATE, { channelId: dm.id, content: urlDeConvite(invite.code) });
      ui.toast("Convite enviado");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar o convite"), "error");
    }
  }

  /** "Apps >": a API não tem comandos de app em DM ainda — item único e mudo. */
  function submenuApps(): MenuItem {
    return {
      label: "Apps",
      submenu: [{ label: "Nenhum app disponível", disabled: true, onSelect: () => {} }],
    };
  }

  function submenuConvidarParaOServidor(): MenuItem {
    if (meusServidores.length === 0) {
      return {
        label: "Convidar para o servidor",
        disabled: true,
        submenu: [{ label: "Nenhum servidor disponível", disabled: true, onSelect: () => {} }],
      };
    }
    return {
      label: "Convidar para o servidor",
      submenu: meusServidores.map((g) => ({
        label: g.name,
        onSelect: () => void enviarConviteNaConversa(g.id),
      })),
    };
  }

  function abrirMenu(e: MouseEvent, linha?: HTMLElement | null) {
    e.preventDefault();
    const escopo = { tipo: "canal" as const, channelId: dm.id };
    const setting = porEscopo[channelNotificationScope(dm.id)];
    // Marcar como lida / sep / Fixar ou Desafixar: comum às duas telas (C e a
    // versão de grupo do mesmo cartão)
    const items: MenuItem[] = [
      { label: "Marcar como lida", disabled: !isUnread(dm), onSelect: () => void markRead(dm.id) },
      { separator: true },
      {
        label: dm.fixadaEm ? "Desafixar" : "Fixar",
        icon: dm.fixadaEm ? <PinOff size={18} /> : <Pin size={18} />,
        onSelect: () => void (dm.fixadaEm ? desafixar(dm.id) : fixar(dm.id)),
      },
    ];

    if (!group && other) {
      const notaExistente = minhasNotas[other.id];
      const souAmigo = friendsList.some((f) => f.id === other.id);
      const bloqueado = blockedList.some((b) => b.id === other.id);
      const ignorado = ignoredList?.some((u) => u.id === other.id) ?? false;
      const apelidoExistente = apelidos?.[other.id];

      items.push({ separator: true });
      items.push({
        label: "Perfil",
        onSelect: () =>
          ui.openProfile(
            other,
            linha ? anchorOf(linha) : { x: e.clientX, y: e.clientY, width: 0, height: 0 },
          ),
      });
      items.push({ label: "Iniciar chamada", onSelect: () => void startCall(dm.id, false) });
      items.push({
        label: notaExistente ? "Editar nota" : "Adicionar nota",
        description: "Visível apenas para você",
        onSelect: () => ui.openModal({ kind: "notaDeUsuario", userId: other.id }),
      });
      if (souAmigo) {
        items.push({
          label: apelidoExistente ? "Editar apelido de amigo" : "Adicionar apelido de amigo",
          onSelect: () => ui.openModal({ kind: "apelidoDeAmigo", userId: other.id }),
        });
      }
      items.push({ label: "Fechar mensagem direta", onSelect: () => void hide(dm.id) });
      items.push({ separator: true });
      items.push(submenuApps());
      items.push(submenuConvidarParaOServidor());
      if (souAmigo) {
        items.push({
          // branco no Discord (p2): só "Bloquear" é vermelho
          label: "Desfazer amizade",
          onSelect: () => void removeFriend(other),
        });
      }
      items.push({
        label: ignorado ? "Deixar de ignorar" : "Ignorar",
        onSelect: () => void (ignorado ? deixarDeIgnorarUsuario(other.id) : ignorarUsuario(other.id)),
      });
      items.push({
        label: bloqueado ? "Desbloquear" : "Bloquear",
        danger: !bloqueado,
        onSelect: () => void (bloqueado ? unblockFriend(other.id) : blockFriend(other)),
      });
      items.push({ separator: true });
      items.push(submenuSilenciar(`Silenciar @${nomeDoOutro}`, escopo, setting, t, true));
      if (developerMode) {
        items.push({ separator: true });
        items.push({
          label: "Copiar ID do usuário",
          onSelect: () => void navigator.clipboard?.writeText(other.id),
        });
        items.push({
          label: "Copiar ID do canal",
          onSelect: () => void navigator.clipboard?.writeText(dm.id),
        });
      }
    }

    if (group) {
      items.push({ separator: true });
      items.push({
        label: "Convidar para o grupo",
        onSelect: () => ui.openModal({ kind: "addGroupMembers", channelId: dm.id }),
      });
      items.push({
        label: "Alterar ícone",
        onSelect: () => ui.openModal({ kind: "groupSettings", channelId: dm.id }),
      });
      items.push({ label: "Fechar mensagem direta", onSelect: () => void hide(dm.id) });
      items.push({ separator: true });
      items.push(submenuApps());
      items.push({ separator: true });
      items.push(submenuSilenciar("Silenciar grupo", escopo, setting, t, true));
      items.push({ separator: true });
      items.push({ label: "Sair do grupo", danger: true, onSelect: () => void leaveGroup(dm.id) });
      if (developerMode) {
        items.push({ separator: true });
        items.push({
          label: "Copiar ID do canal",
          onSelect: () => void navigator.clipboard?.writeText(dm.id),
        });
      }
    }

    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  return (
    <div
      role="listitem"
      onContextMenu={(e) => abrirMenu(e, e.currentTarget)}
      // pl-2: `.link__972a0{padding-inline:8px 0}` (CSS bruto); `relative`
      // é o âncora da pílula de não lida logo abaixo
      className={`group relative mx-2 mb-0.5 flex h-12 items-center rounded-lg pl-2 pr-2 ${
        active
          ? "bg-interactive-background-selected text-text-strong"
          : unread
            ? "text-text-strong hover:bg-interactive-background-hover"
            : "text-channels-default hover:bg-interactive-background-hover hover:text-text-default"
      }`}
    >
      {unread && (
        /* `.unreadPill__972a0`: barra de 4×8 encostada FORA da linha, 8px
           para fora da borda esquerda (`inset-inline-start:-8px`) — cai
           exatamente na margem de 8 (`mx-2`) que separa a linha do bordo da
           coluna. `.muted__972a0{opacity:.3}` quando a conversa está
           silenciada. */
        <span
          aria-hidden="true"
          className={`absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r bg-interactive-text-active ${
            isMuted(porEscopo[channelNotificationScope(dm.id)]) ? "opacity-30" : ""
          }`}
        />
      )}
      <button
        type="button"
        data-dm-button
        onClick={() => select(dm)}
        aria-current={active ? "true" : undefined}
        aria-label={unread ? `${title} (não lida)` : title}
        // gap-2: `.link__972a0{gap:8px}` (CSS bruto, não 12)
        className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
      >
        {other ? (
          <Avatar
            user={other}
            size="md"
            status={resolveStatus(statuses, other)}
            surface={active ? "border-interactive-background-selected" : "border-background-base-lowest"}
          />
        ) : (
          <GroupAvatar iconUrl={dm.iconUrl} size="md" />
        )}
        <span className="min-w-0">
          <span className={`block truncate ${unread ? "font-semibold" : "font-medium"}`}>{title}</span>
          {previa ? (
            <span className={`block truncate text-xs ${unread ? "font-medium" : ""}`}>{previa}</span>
          ) : group ? (
            <span className="block truncate text-xs text-text-muted">{dm.others.length + 1} membros</span>
          ) : null}
        </span>
      </button>
      {emChamada > 0 && (
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
      {/* Encaixe de 24px na borda direita: o alfinete cinza da conversa
          fixada (`docs/CONTRATO-MENUS.md` §1, prints p1/p2) em repouso, e o X
          de fechar no hover/foco — os dois ocupam o mesmo lugar porque nunca
          aparecem ao mesmo tempo (o alfinete cede o posto assim que o mouse
          chega, o X de sempre). O `X`/`LogOut` fica em fluxo normal (o
          `place-items-center` do pai o centra); o alfinete é posicionado por
          cima dele porque só existe quando a conversa está fixada. */}
      <span className="relative grid h-6 w-6 shrink-0 place-items-center">
        {dm.fixadaEm && (
          <Pin
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute inset-0 m-auto text-text-muted transition-opacity group-hover:opacity-0"
          />
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
}

/** Preenchimento para `useNomeParaMim` na linha de grupo, que não tem `other`. */
const SEM_OUTRO: Pick<PublicUser, "id" | "username" | "displayName"> = {
  id: "",
  username: "",
  displayName: null,
};
