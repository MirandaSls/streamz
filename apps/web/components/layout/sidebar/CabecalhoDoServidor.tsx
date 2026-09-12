"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  LogOut,
  Plus,
  Search,
  Settings,
  UserPlus,
  X,
} from "@/components/ui/icones";
import {
  Permission,
  guildBannerBackground,
  guildNotificationScope,
  type Guild,
} from "@streamz/shared";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { useAuth } from "@/stores/auth";
import { useCategories } from "@/stores/categories";
import { useCanModerate, useGuilds, useIsOwner } from "@/stores/guilds";
import { useNotifications } from "@/stores/notifications";
import { useCan } from "@/stores/permissions";
import { useSettings } from "@/stores/settings";
import { ui, useUI, type MenuItem } from "@/stores/ui";
import { useT } from "@/lib/i18n";
import { submenuNotificacoes, submenuSilenciar } from "@/lib/notification-menu";

/**
 * Topo da coluna de canais: o nome do servidor, o chevron e o menu que ele abre.
 *
 * Saiu da `ChannelSidebar` inteiro — inclusive o menu — porque nada dele é
 * compartilhado com a lista: a lista precisa de canais e de arrasto, o topo
 * precisa do servidor e das ações de servidor. O único fio entre os dois é o
 * `celular`, que o pai já calcula para o cabeçalho de categoria.
 *
 * As medidas são as que estavam na `ChannelSidebar`; esta passagem não mudou um
 * pixel (as peças são redesenhadas nos cartões seguintes da onda 1).
 */
export function CabecalhoDoServidor({ celular }: { celular: boolean }) {
  const t = useT();
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === s.activeGuildId) ?? null);
  /** "N membros" do cabeçalho do celular; a lista já vem carregada pela store. */
  const totalDeMembros = useGuilds((s) => s.members.length);
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
  // o chevron do cabeçalho vira X enquanto o dropdown está aberto, como no
  // Discord; quem fecha o menu é o host, então o estado espelha a store
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
    const r = e.currentTarget.getBoundingClientRect();
    const escopo = porEscopo[guildNotificationScope(guild.id)];
    const items: MenuItem[] = [
      // único item destacado do menu, como no Discord
      {
        label: "Convidar pessoas",
        icon: <UserPlus size={18} />,
        highlight: true,
        onSelect: () => void createInvite(),
      },
    ];
    if (canModerate) {
      items.push({
        label: "Configurações do servidor",
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
        icon: <Plus size={18} />,
        onSelect: () => openModal({ kind: "createChannel" }),
      });
      items.push({
        label: "Criar categoria",
        icon: <FolderPlus size={18} />,
        onSelect: () => void novaCategoria(),
      });
    }
    items.push({ separator: true });
    items.push(submenuSilenciar("Silenciar servidor", { tipo: "servidor", guildId: guild.id }, escopo, t));
    items.push(submenuNotificacoes({ tipo: "servidor", guildId: guild.id }, escopo, t));
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
    ui.openContextMenu(r.left + 10, r.bottom + 4, items, MENU_WIDTH_WIDE);
  }

  if (celular) {
    return (
      <FaixaDoCelular
        guild={guild}
        membros={totalDeMembros}
        onMenu={openGuildMenu}
        onConvidar={() => void createInvite()}
      />
    );
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
    <div className="flex h-[49px] shrink-0 items-center border-b border-border-subtle pl-5 pr-3 shadow-elevation-low">
      <button
        type="button"
        onClick={onMenu}
        disabled={!guild}
        aria-haspopup="menu"
        aria-expanded={menuAberto}
        className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-[4px] py-1 pl-1 pr-2 text-left font-semibold text-text-strong transition hover:bg-interactive-background-hover disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="truncate">{guild?.name ?? "Selecione um servidor"}</span>
        {guild &&
          (menuAberto ? (
            <X size={14} aria-hidden="true" className="shrink-0 text-text-subtle" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-text-subtle" />
          ))}
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
 * Medido em `docs/Reference/mobile/discord-mobile-servidor-2024.png` (1,9707
 * px/pt): faixa do servidor no topo da coluna, nome grande com o chevron `›`
 * que abre o menu, a linha "N membros", e a pílula "Buscar" ocupando a largura
 * com dois botões redondos à direita. Depois, uma divisória de 1px.
 *
 * Aqui a faixa é a **cor do perfil do servidor** (`bannerColor`, o degradê de
 * `guildBannerBackground`), não uma imagem: o Streamz não tem banner de
 * servidor, tem faixa de cor — e é o que o cartão de prévia já usa. Sem cor
 * escolhida, fica a superfície neutra em vez de um buraco.
 *
 * A pílula de busca é **inerte por enquanto** (§6.6: botão sem função existe
 * como visual, registrado): a busca de mensagens não tem tela no celular. O
 * segundo botão redondo do print (eventos) não existe neste produto e não foi
 * criado — sobra só o de convidar.
 */
function FaixaDoCelular({
  guild,
  membros,
  onMenu,
  onConvidar,
}: {
  guild: Guild | null;
  membros: number;
  onMenu: (e: MouseEvent<HTMLButtonElement>) => void;
  onConvidar: () => void;
}) {
  const faixa = guildBannerBackground(guild?.bannerColor);
  return (
    <div className="shrink-0 border-b border-border-subtle">
      {/* 74pt de faixa, medidos entre o topo da coluna e o fim do banner */}
      <div
        aria-hidden="true"
        style={faixa ? { background: faixa } : undefined}
        className={`h-[74px] w-full ${faixa ? "" : "bg-interactive-background-hover"}`}
      />
      <div className="px-4 pb-3 pt-2.5">
        <button
          type="button"
          onClick={onMenu}
          disabled={!guild}
          aria-haspopup="menu"
          className="flex min-h-[44px] w-full items-center gap-1 text-left disabled:cursor-default"
        >
          <span className="truncate text-xl font-bold text-text-strong">
            {guild?.name ?? "Selecione um servidor"}
          </span>
          {guild && (
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-subtle" />
          )}
        </button>
        {guild && (
          <p className="text-sm text-text-muted">
            {membros === 1 ? "1 membro" : `${membros} membros`}
          </p>
        )}
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
    </div>
  );
}
