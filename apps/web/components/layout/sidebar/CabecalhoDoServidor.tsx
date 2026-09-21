"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  ChevronDown,
  CirclePlus,
  FolderPlus,
  LogOut,
  MoreHorizontal,
  Search,
  Settings,
  UserPlus,
} from "@/components/ui/icones";
import { Permission, guildNotificationScope, type Guild } from "@streamz/shared";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { useAuth } from "@/stores/auth";
import { useCanaisOcultos } from "@/stores/canais-ocultos";
import { useCategories } from "@/stores/categories";
import { useCanModerate, useGuilds, useIsOwner } from "@/stores/guilds";
import { useNotifications } from "@/stores/notifications";
import { useCan } from "@/stores/permissions";
import { useSettings } from "@/stores/settings";
import { ui, useUI, type MenuItem } from "@/stores/ui";
import { useT } from "@/lib/i18n";
import { submenuNotificacoes } from "@/lib/notification-menu";

/**
 * Topo da coluna de canais: o nome do servidor, o chevron e o menu que ele abre.
 *
 * Saiu da `ChannelSidebar` inteiro — inclusive o menu — porque nada dele é
 * compartilhado com a lista: a lista precisa de canais e de arrasto, o topo
 * precisa do servidor e das ações de servidor. O único fio entre os dois é o
 * `celular`, que o pai já calcula para o cabeçalho de categoria.
 *
 * Redesenhado no cartão 1c-sidebar-cabecalho contra `docs/Reference` (ver o
 * comentário de cada peça, `BarraDoDesktop` e `FaixaDoCelular`, para a origem
 * de cada medida).
 */
export function CabecalhoDoServidor({ celular }: { celular: boolean }) {
  const t = useT();
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === s.activeGuildId) ?? null);
  // ── e-configuracoes ── silenciar canal/servidor
  const porEscopo = useNotifications((s) => s.porEscopo);
  const createInvite = useGuilds((s) => s.createInvite);
  const leaveGuild = useGuilds((s) => s.leave);
  const developerMode = useSettings((s) => s.developerMode);
  const user = useAuth((s) => s.user);
  const canModerate = useCanModerate(user?.id);
  const isOwner = useIsOwner(user?.id);
  /*
    `canModerate` é "tenho **alguma** permissão de gestão" — quem só expulsa
    membros passava por ele e via o "+" e o "Criar canal", que a API recusa com
    403 (`channels.service` e `categories.service` exigem `MANAGE_CHANNELS` nas
    dez rotas). Criar, editar, apagar e reordenar canal e categoria passam a
    perguntar **a mesma** permissão que a API, pelo `useCan` — que roda a
    `computePermissions` do `@streamz/shared`, a mesma função do servidor. O
    dono continua vendo tudo: para ele `computePermissions` devolve
    `ALL_PERMISSIONS`. `canModerate` fica onde ele é certo: o item
    "Configurações do servidor", que é o guarda-chuva de gestão.
  */
  const podeGerenciarCanais = useCan(Permission.MANAGE_CHANNELS);
  const criarCategoria = useCategories((s) => s.create);
  const openModal = useUI((s) => s.openModal);
  // o chevron do cabeçalho gira para cima enquanto o dropdown está aberto,
  // como no Discord; quem fecha o menu é o host, então o estado espelha a store
  const contextMenu = useUI((s) => s.contextMenu);
  const [menuAberto, setMenuAberto] = useState(false);
  useEffect(() => {
    if (!contextMenu) setMenuAberto(false);
  }, [contextMenu]);

  async function novaCategoria() {
    if (!guild) return;
    const nome = await ui.prompt({
      title: "Criar categoria",
      message: "Nome da categoria.",
      placeholder: "Ex.: Assuntos gerais",
      confirmLabel: "Criar",
    });
    if (nome?.trim()) await criarCategoria(guild.id, nome.trim());
  }

  /**
   * Menu do cabeçalho do servidor (o chevron do Discord).
   *
   * "Convites", "Registro de auditoria" e "Denúncias" saíram daqui: no Discord
   * eles moram dentro de Configurações do Servidor, e o dropdown fica com as
   * ações do dia a dia. "Marcar servidor como lido" pertence ao menu do ÍCONE
   * no rail, não a este.
   */
  function openGuildMenu(e: MouseEvent<HTMLButtonElement>) {
    if (!guild) return;
    /*
      Âncora no desktop é a **barra** (o pai do botão), não o botão: o menu fica
      centrado na coluna e nasce 4px abaixo da borda do cabeçalho. Medido em
      `2026-08-31 101733.png` (borda do cabeçalho em y=83, menu em y=88; coluna
      x 81–374 e menu x 118–337, centro 228 nos dois) e em
      `2026-09-04 100527.png` (81→86, mesmo centro). Ancorado no botão, subia
      7px por cima do cabeçalho e saía 11px à esquerda. No celular o menu é
      folha e a âncora do botão fica como estava.
    */
    const r = celular
      ? e.currentTarget.getBoundingClientRect()
      : e.currentTarget.parentElement!.getBoundingClientRect();
    const escopo = porEscopo[guildNotificationScope(guild.id)];
    const items: MenuItem[] = [
      /*
        Rótulo exato do print `101733` (linha do topo do menu): "Convidar para
        o servidor", não "Convidar pessoas" — esse é o texto do botão solto do
        cabeçalho, não o do item de menu. Sem `highlight`: o mesmo print mede
        texto #f0f0f0 e ícone #aaabb1, a cor de qualquer item comum — o Discord
        não pinta nenhum item de menu com o accent (ver o comentário de
        `ContextMenu.tsx` sobre o campo, que ficou sem efeito de propósito).
      */
      {
        label: "Convidar para o servidor",
        icon: <UserPlus size={18} />,
        onSelect: () => void createInvite(),
      },
    ];
    if (canModerate) {
      items.push({
        // rótulo abreviado, medido no mesmo print (linha y=250): "Config. do
        // servidor", não o nome completo — é o que faz o menu de 220px caber
        // sem precisar de barra de rolagem horizontal.
        label: "Config. do servidor",
        icon: <Settings size={18} />,
        onSelect: () => openModal({ kind: "serverSettings", guildId: guild.id }),
      });
    }
    /*
      Ordem da print `2026-09-03 201809`: Convidar, Config. do servidor, Criar
      canal, Criar categoria, e só então o bloco de notificações. Os itens que
      não existem no Streamz (Impulso, Criar evento, Diretório de Apps) ficam de
      fora — o Discord nunca mostra item morto, e criar um botão inerte aqui
      seria pior que não ter. Os dois de criar exigem `MANAGE_CHANNELS`.
    */
    if (podeGerenciarCanais) {
      items.push({
        label: "Criar canal",
        // círculo cheio com o + vazado, 20px de tinta em `101733` (x 135–154)
        icon: <CirclePlus size={18} />,
        onSelect: () => openModal({ kind: "createChannel" }),
      });
      items.push({
        label: "Criar categoria",
        icon: <FolderPlus size={18} />,
        onSelect: () => void novaCategoria(),
      });
    }
    items.push({ separator: true });
    // sem "Silenciar servidor" aqui: no menu do cabeçalho do Discord o grupo de
    // notificação só tem a configuração (revisão visual, `menu-servidor`); o
    // silenciar mora no menu do ícone do servidor na rail (`GuildRail.tsx`)
    // rótulo do print (`101733` y=401, `124207` y=400, `100527` y=471): o
    // Discord abre um modal; aqui fica o submenu de rádio, que é o que existe
    items.push(
      submenuNotificacoes({ tipo: "servidor", guildId: guild.id }, escopo, t, "Config. de notificação"),
    );
    // "Ocultar canais silenciados": o Discord tem este item também aqui, não
    // só no menu do ícone do servidor na rail (`GuildRail.tsx`, que tem a
    // mesma checagem) — os dois lêem e escrevem a mesma preferência por
    // servidor (`stores/canais-ocultos.ts`), então ligar num lugar reflete no
    // outro sem round-trip.
    items.push({
      label: "Ocultar canais silenciados",
      control: "checkbox",
      checked: useCanaisOcultos.getState().ocultarSilenciados(guild.id),
      onSelect: () => useCanaisOcultos.getState().alternar(guild.id),
    });
    // o dono não vê "sair" nem "apagar" aqui: apagar mora em Configurações
    if (!isOwner) {
      items.push({ separator: true });
      items.push({
        label: "Sair do servidor",
        icon: <LogOut size={18} />,
        danger: true,
        onSelect: () => void leaveGuild(guild.id),
      });
    }
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID do servidor",
        onSelect: () => void navigator.clipboard?.writeText(guild.id),
      });
    }
    setMenuAberto(true);
    if (celular) ui.openContextMenu(r.left + 10, r.bottom + 4, items, MENU_WIDTH_WIDE);
    else ui.openContextMenu(r.left + (r.width - MENU_WIDTH_WIDE) / 2, r.bottom + 4, items, MENU_WIDTH_WIDE);
  }

  if (celular) {
    return <FaixaDoCelular guild={guild} onMenu={openGuildMenu} onConvidar={() => void createInvite()} />;
  }
  return (
    <BarraDoDesktop
      guild={guild}
      menuAberto={menuAberto}
      onMenu={openGuildMenu}
      onConvidar={() => void createInvite()}
    />
  );
}

/**
 * Cabeçalho da coluna no **computador**: 49px de altura, nome + chevron.
 *
 * O cabeçalho deixa de ser um botão só. No Discord o chevron fica **colado ao
 * nome**, não na extremidade, e sobra a ponta direita para o botão de convidar —
 * que a gente não tinha em lugar nenhum visível, só enterrado no menu de
 * contexto.
 *
 * Botão dentro de botão não é HTML válido, então o que era um vira dois irmãos:
 * o do menu ocupa o espaço do nome, o de convidar fica ao lado.
 */
function BarraDoDesktop({
  guild,
  menuAberto,
  onMenu,
  onConvidar,
}: {
  guild: Guild | null;
  menuAberto: boolean;
  onMenu: (e: MouseEvent<HTMLButtonElement>) => void;
  onConvidar: () => void;
}) {
  return (
    // 49px + borda de 1px: medido em `101733` (coluna x=95, y 34–82 de
    // conteúdo + linha de borda em 33 e em 83) — a mesma altura do cabeçalho
    // do canal ao lado (`.container__9293f`, `--custom-channel-header-height`
    // resolve no mesmo valor nos dois). `shadow-elevation-low` é o
    // `shadow-header` de antes da onda 0.8: renomeação mecânica, mesmo CSS.
    <div className="flex h-[49px] shrink-0 items-center border-b border-border-subtle pl-5 pr-3 shadow-elevation-low">
      <button
        type="button"
        onClick={onMenu}
        disabled={!guild}
        aria-haspopup="menu"
        aria-expanded={menuAberto}
        /*
          Com o menu aberto o Discord mantém a pílula acesa mesmo se o mouse
          sai do botão (é assim que "101733", tirado com o dropdown aberto,
          mostra o trecho "Notas" com o mesmo fundo — `#222226` a 34,34,37 —
          de `bg-interactive-background-hover` enquanto o resto da barra segue
          na cor base; "201805", fechado e sem hover, não tem pílula nenhuma).
          `hover:` sozinho apaga o fundo assim que o cursor sai a caminho de um
          item do menu, então o estado aberto entra como classe condicional,
          não só pseudo-classe.
        */
        className={`-ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-[4px] py-1 pl-1 pr-2 text-left text-heading-md font-semibold text-text-strong transition hover:bg-interactive-background-hover disabled:cursor-default disabled:hover:bg-transparent ${menuAberto ? "bg-interactive-background-hover" : ""}`}
      >
        <span className="truncate">{guild?.name ?? "Selecione um servidor"}</span>
        {/*
          Um chevron só, que gira: para baixo fechado (`2026-09-03 201805.png`,
          10×6 de tinta em x 115–124, 5px depois do nome) e para cima aberto
          (`101733`, 10×6 em x 147–156). Nenhum print mostra X. Cor #f2f2f3, a
          do nome: `text-strong`. Tamanho 18 porque o 14 dava 8px de tinta.
        */}
        {guild && (
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`shrink-0 text-text-strong transition-transform ${menuAberto ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {guild && (
        <BotaoDeIcone
          rotulo="Convidar pessoas"
          icone={<UserPlus size={20} />}
          tamanho="md"
          comFundo
          onClick={onConvidar}
          aria-label={`Convidar pessoas para ${guild.name}`}
          className="shrink-0"
        />
      )}
    </div>
  );
}

/**
 * Cabeçalho da coluna do servidor **no celular**.
 *
 * Redesenhado contra a captura de loja `lojas/imagens/appstore-iphone-pt-br/05.png`
 * ("Esquadrão da Espada", catálogo — escala desconhecida, então o que sai daqui
 * é presença, ordem e proporção, nunca px; ver §7 da ADR-0009) e a divergência
 * `m-inicio` já registrada pelo revisor visual. Duas correções de forma, não só
 * de vocabulário:
 *
 * 1. **Sem faixa de cor.** A coluna do celular no Discord começa direto no nome
 *    do servidor — não há banner acima dele nessa tela (banner de servidor é
 *    outra superfície, o topo do perfil). A versão anterior desenhava um bloco
 *    de 74px em `guildBannerBackground(bannerColor)`; caiu inteiro, e com ele a
 *    única leitura de `bannerColor` que existia neste arquivo.
 * 2. **`...` no lugar do chevron, sem a linha de membros.** O print mostra nome
 *    + botão de reticências (`MoreHorizontal`) na ponta direita da linha — não
 *    o chevron `›` colado ao nome — e nada de contagem de membros abaixo: essa
 *    informação mora em outra tela (lista de membros), não no cabeçalho.
 *
 * A pílula de busca continua **inerte por enquanto** (§6.6: botão sem função
 * existe como visual, registrado): a busca de mensagens não tem tela no
 * celular. O segundo botão redondo do print (eventos) não existe neste produto
 * e não foi criado — sobra só o de convidar (ver "faltando" na entrega do
 * cartão 1c-sidebar-cabecalho).
 */
function FaixaDoCelular({
  guild,
  onMenu,
  onConvidar,
}: {
  guild: Guild | null;
  onMenu: (e: MouseEvent<HTMLButtonElement>) => void;
  onConvidar: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-border-subtle px-4 pb-3 pt-2.5">
      <button
        type="button"
        onClick={onMenu}
        disabled={!guild}
        aria-haspopup="menu"
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left disabled:cursor-default"
      >
        <span className="min-w-0 truncate text-xl font-bold text-text-strong">
          {guild?.name ?? "Selecione um servidor"}
        </span>
        {/*
          `MoreHorizontal` solto, não `BotaoDeIcone`: o botão inteiro da linha
          já é este `<button>` (abre o mesmo menu do desktop), e o primitivo
          renderizaria um `<button>` filho — inválido dentro de outro. Mesma
          razão que já valia para o chevron que ele substitui.
        */}
        {guild && (
          <MoreHorizontal size={20} aria-hidden="true" className="shrink-0 text-text-subtle" />
        )}
      </button>
      <div className="mt-3 flex items-center gap-2">
        <span
          /* pílula de busca: visual, sem função — ver o comentário do topo */
          aria-hidden="true"
          className="flex h-[40px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-interactive-background-hover text-sm text-text-muted"
        >
          <Search size={16} />
          Buscar
        </span>
        {guild && (
          <button
            type="button"
            onClick={onConvidar}
            aria-label={`Convidar pessoas para ${guild.name}`}
            className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full bg-interactive-background-hover text-text-subtle transition active:bg-border-normal"
          >
            <UserPlus size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
