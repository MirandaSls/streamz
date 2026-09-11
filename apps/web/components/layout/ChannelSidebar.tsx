"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Hash,
  Link2,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  UserPlus,
  Volume2,
  X,
} from "@/components/ui/icones";
import {
  Permission,
  channelLinkPath,
  channelNotificationScope,
  guildBannerBackground,
  guildNotificationScope,
  isMuted,
  isUnread,
  type Category,
  type Channel,
  type Guild,
} from "@streamz/shared";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { useEhMobile } from "@/hooks/useEhMobile";
import { MENU_WIDTH, MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import Cronometro from "@/components/voice/Cronometro";
import VoiceChannelMembers from "@/components/voice/VoiceChannelMembers";
import { useAuth } from "@/stores/auth";
import { urlPublica } from "@/lib/links-do-app";
import { canalVisivel } from "@/stores/categoria-colapso";
import { useCategories } from "@/stores/categories";
import { groupByCategory, type CategoryGroup } from "@/stores/channel-order";
import { useChannels } from "@/stores/channels";
import { useCanModerate, useGuilds, useIsOwner } from "@/stores/guilds";
import { useCan } from "@/stores/permissions";
import { podeSoltarEm } from "@/stores/voice-mover";
import { useT } from "@/lib/i18n";
import { submenuNotificacoes, submenuSilenciar } from "@/lib/notification-menu";
import { errorMessage } from "@/stores/socket-adapter";
import { useNotifications } from "@/stores/notifications";
import { api } from "@/lib/api";
import { preaquecerCadeiaDeVoz, useVoice } from "@/stores/voice";
import { useSettings } from "@/stores/settings";
import { ui, useUI, type MenuItem } from "@/stores/ui";

/** Ícone do canal: voz, anúncio (somente leitura), privado ou texto. */
function ChannelIcon({ channel }: { channel: Channel }) {
  const cls = "shrink-0 text-channels-default";
  if (channel.type === "VOICE") return <Volume2 size={20} className={cls} aria-hidden="true" />;
  if (channel.type === "ANNOUNCEMENT" || channel.readOnly) {
    return <Megaphone size={20} className={cls} aria-hidden="true" />;
  }
  if (channel.private) return <Lock size={20} className={cls} aria-hidden="true" />;
  return <Hash size={20} className={cls} aria-hidden="true" />;
}

/**
 * O que está sendo arrastado agora (só moderação arrasta).
 *
 * `membro-voz` é o participante de um canal de voz indo para outro (`userId` e o
 * canal de onde ele saiu) — a regra de onde ele pode cair é pura, em
 * `stores/voice-mover`.
 */
type Arrasto =
  | { tipo: "canal" | "categoria"; id: string }
  | { tipo: "membro-voz"; userId: string; deChannelId: string }
  | null;
/** Onde a linha de inserção (ou o realce, no caso do participante) aparece. */
type Alvo =
  | { tipo: "canal"; categoryId: string | null; index: number }
  | { tipo: "categoria"; index: number }
  | { tipo: "membro-voz"; channelId: string }
  | null;

/** Linha de 2px que marca onde o item vai cair. */
function LinhaDeSolta({ ativa }: { ativa: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`mx-2 h-0.5 rounded-full transition ${ativa ? "bg-brand-500" : "bg-transparent"}`}
    />
  );
}

/**
 * Cabeçalho de categoria: nome + chevron (14px, caixa mista) e o "+" de criar
 * canal dentro dela.
 *
 * **O "+" não é de hover.** Medido na print `2026-09-03 201805`: o cursor está
 * sobre o canal "warframe" (os dois botões dele estão acesos) e mesmo assim os
 * três cabeçalhos mostram o "+". Ele era `opacity-0` aqui, e só aparecia quando
 * o ponteiro passava por cima do próprio cabeçalho.
 *
 * Medidas da mesma print (coluna de 294, 1:1 pelo `h-9` do canal, que lá mede
 * 36 exatos):
 *
 * | item | Discord | aqui |
 * |---|---|---|
 * | glifo do "+" | 12×12 | `Plus size={20}` → 11,7 (o quadro do ativo desenha 0,583 do tamanho) |
 * | centro do "+" | x=315,5 | x=318 — a mesma coluna da engrenagem do canal (`pr-1` + botão de 24), que na print está em 315,5 também |
 * | rótulo | começa em x=67 | `mx-2` + `pl-[10px]` = 67 |
 * | altura da linha | 12 de conteúdo, centro 29 abaixo do canal anterior | `h-[22px]` com `mt-4` + 2 da linha de solta = 29 |
 * | próximo canal | 42 abaixo do canal anterior | 16+2+22+2 = 42 |
 *
 * A cor é a mesma do rótulo e a mesma dos nomes de canal não lidos — na print
 * os três picam no mesmo valor (129,130,138), o que é `text-text-muted`.
 */
function CategoryHeader({
  label,
  collapsed,
  onToggle,
  onCreate,
  onEdit,
  onContextMenu,
  dragProps,
  celular = false,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  onCreate?: () => void;
  onEdit?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  dragProps?: Record<string, unknown>;
  /**
   * No celular o cabeçalho é **caixa alta, com o chevron à esquerda** e sem
   * botão nenhum na linha — medido em `discord-mobile-servidor-2024.png`
   * ("FAVORITES", "CHAT", "COMMUNITY"). Criar canal e editar categoria moram no
   * menu do servidor e no toque longo; uma fileira de alvos de 22px ao lado do
   * rótulo não é tocável de qualquer modo.
   */
  celular?: boolean;
}) {
  return (
    /*
      O `group` existe só pela engrenagem, que é de hover (o "+" não é). Ele não
      mexe no hover dos canais: as regras `group-hover` deles estão na linha do
      canal, que é irmã deste cabeçalho e não descendente dele.
    */
    <div
      className={`group mx-2 flex items-center pr-1 ${celular ? "h-[36px]" : "h-[22px]"}`}
      onContextMenu={onContextMenu}
      {...dragProps}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        /*
          Fonte do corpo e peso médio, não a de display em negrito: medido, o
          Discord usa a mesma família do resto da coluna aqui. E o chevron vem
          **depois** do texto, não antes — o texto começa em x=100, alinhado com
          o nome do servidor acima e com o `#` dos canais abaixo. Com o chevron
          na frente, essa coluna de alinhamento se perdia.
        */
        className={`flex min-w-0 flex-1 items-center gap-1 pl-2.5 text-sm font-medium text-text-muted hover:text-text-default ${
          celular ? "gap-1.5 text-xs font-semibold uppercase tracking-wide" : ""
        }`}
      >
        {/* o chevron troca de lado no celular: na captura ele vem **antes** do
            rótulo, e o rótulo é caixa alta */}
        {celular &&
          (collapsed ? (
            <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
          ))}
        <span className="truncate">{label}</span>
        {!celular &&
          (collapsed ? (
            <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
          ))}
      </button>
      {/* A engrenagem da categoria abre o mesmo modal do item "Editar
          categoria" do menu de contexto. Ao contrário do "+", ela é de hover —
          as classes são as mesmas dos dois botões de hover do canal, para os
          três acenderem igual. Fica à esquerda do "+" para não mover o "+",
          cuja coluna (x=318) está medida na print. */}
      {onEdit && !celular && (
        <BotaoDeIcone
          rotulo="Editar categoria"
          icone={<Settings size={18} />}
          tamanho="sm"
          onClick={onEdit}
          aria-label={`Editar ${label}`}
          className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        />
      )}
      {onCreate && !celular && (
        <BotaoDeIcone
          rotulo="Criar canal"
          icone={<Plus size={20} />}
          tamanho="sm"
          onClick={onCreate}
          aria-label={`Criar canal em ${label}`}
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
function CabecalhoDoServidor({
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

/**
 * Coluna 2 no modo servidor: cabeçalho com menu, categorias reais e canais.
 *
 * O arrastar-e-soltar usa o DnD nativo do HTML5 em vez de uma biblioteca
 * (`@dnd-kit` e afins): a lista é vertical, curta e sem colisão complexa, e o
 * cálculo da nova ordem já é lógica pura testada (`stores/channel-order`) — não
 * havia o que uma dependência a mais fosse resolver aqui.
 */
export default function ChannelSidebar() {
  /**
   * No celular o cabeçalho desta coluna é outro — ver `CabecalhoDoServidor`.
   * O do desktop (nome + chevron + convidar, 49px) é o medido no computador.
   */
  const celular = useEhMobile();
  /** "N membros" do cabeçalho do celular; a lista já vem carregada pela store. */
  const totalDeMembros = useGuilds((s) => s.members.length);
  const listRef = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto>(null);
  const [alvo, setAlvo] = useState<Alvo>(null);

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
  /** Arrastar alguém de um canal de voz para outro (bit novo, ver ADR-0002). */
  const podeMoverMembros = useCan(Permission.MOVE_MEMBERS);

  const channels = useChannels((s) => s.channels);
  const loading = useChannels((s) => s.loading);
  const activeChannelId = useChannels((s) => s.activeChannelId);
  const vozAqui = useVoice((s) => s.channelId);
  const vozDesde = useVoice((s) => s.desde);
  const voiceChannelId = useChannels((s) => s.voiceChannelId);
  const select = useChannels((s) => s.select);
  const rename = useChannels((s) => s.rename);
  const removeChannel = useChannels((s) => s.remove);
  const dropChannel = useChannels((s) => s.dropChannel);
  const dropCategory = useChannels((s) => s.dropCategory);

  const openModal = useUI((s) => s.openModal);
  const abrirVoiceChat = useUI((s) => s.abrirVoiceChat);
  // o chevron do cabeçalho vira X enquanto o dropdown está aberto, como no
  // Discord; quem fecha o menu é o host, então o estado espelha a store
  const contextMenu = useUI((s) => s.contextMenu);
  const [menuAberto, setMenuAberto] = useState(false);
  useEffect(() => {
    if (!contextMenu) setMenuAberto(false);
  }, [contextMenu]);

  const categories = useCategories((s) => s.categories);
  const collapsed = useCategories((s) => s.collapsed);
  const toggleCollapsed = useCategories((s) => s.toggleCollapsed);
  const setAllCollapsed = useCategories((s) => s.setAllCollapsed);
  const criarCategoria = useCategories((s) => s.create);
  const apagarCategoria = useCategories((s) => s.remove);

  /*
    Um bloco por categoria, mais o bloco sem título do topo para os canais
    soltos — e nada além disso.

    Aqui existia um segundo modo: enquanto o servidor não tivesse categoria
    nenhuma, a coluna **inventava** os títulos "Canais de Texto" e "Canais de
    Voz" separando os canais soltos por tipo. Como eram desenho e não dado, a
    primeira categoria de verdade que alguém criasse desligava esse modo: os
    dois títulos sumiam e os canais iam todos para o bloco sem título. Agora as
    duas categorias padrão são linhas em `Category`, criadas junto com o
    servidor (e criadas para os antigos pelo passo de boot da API), então
    aparecem, se renomeiam e se apagam como qualquer outra.
  */
  const grupos = groupByCategory(channels, categories);

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
   * Botão direito num canal.
   *
   * "Renomear canal" e "Gerenciar acesso" saíram: no Discord existe só "Editar
   * canal", e renomear e permissões são abas de dentro dele. "Seguir canal (em
   * breve)" saiu porque o Discord nunca mostra item morto — ou existe, ou não
   * aparece.
   */
  function openChannelMenu(e: MouseEvent, channel: Channel) {
    e.preventDefault();
    const setting = porEscopo[channelNotificationScope(channel.id)];
    const escopo = { tipo: "canal" as const, channelId: channel.id };
    const items: MenuItem[] = [
      {
        label: "Marcar como lido",
        icon: <CheckCheck size={18} />,
        onSelect: () => void useChannels.getState().markRead(channel.id),
      },
      { separator: true },
      { label: "Convidar pessoas", icon: <UserPlus size={18} />, onSelect: () => void createInvite() },
      {
        label: "Copiar link do canal",
        icon: <Link2 size={18} />,
        // origem pública e caminho do contrato: montar a URL à mão com
        // `window.location.origin` copiava `http://tauri.localhost/...` no desktop
        onSelect: () =>
          void navigator.clipboard?.writeText(
            urlPublica(channelLinkPath(channel.guildId, channel.id)),
          ),
      },
      { separator: true },
      submenuSilenciar("Silenciar canal", escopo, setting, t),
      submenuNotificacoes(escopo, setting, t),
    ];
    if (podeGerenciarCanais) {
      items.push({ separator: true });
      items.push({
        label: "Editar canal",
        icon: <Settings size={18} />,
        onSelect: () => openModal({ kind: "channelSettings", channelId: channel.id }),
      });
      items.push({
        label: "Apagar canal",
        icon: <Trash2 size={18} />,
        danger: true,
        onSelect: () => void removeChannel(channel),
      });
    }
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID do canal",
        onSelect: () => void navigator.clipboard?.writeText(channel.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  /** Botão direito numa categoria. */
  function openCategoryMenu(e: MouseEvent, category: Category) {
    e.preventDefault();
    if (!guild) return;
    // "recolher/expandir todas" é UM item que alterna, não dois lado a lado
    const todasFechadas = categories.length > 0 && categories.every((c) => collapsed.includes(c.id));
    const items: MenuItem[] = [
      {
        label: "Marcar como lida",
        icon: <CheckCheck size={18} />,
        onSelect: () => {
          for (const c of channels.filter((c) => c.categoryId === category.id)) {
            void useChannels.getState().markRead(c.id);
          }
        },
      },
      { separator: true },
      {
        label: collapsed.includes(category.id) ? "Expandir categoria" : "Recolher categoria",
        onSelect: () => toggleCollapsed(category.id),
      },
      {
        label: todasFechadas ? "Expandir todas as categorias" : "Recolher todas as categorias",
        onSelect: () => setAllCollapsed(!todasFechadas),
      },
    ];
    if (podeGerenciarCanais) {
      items.push({ separator: true });
      /*
        "Editar categoria" era um `prompt` de renomear. Agora abre o mesmo modal
        da engrenagem do cabeçalho, com abas (geral e permissões) — como no
        Discord, onde renomear é um campo dentro de "Editar categoria" e não uma
        caixinha à parte.
      */
      items.push({
        label: "Editar categoria",
        icon: <Pencil size={18} />,
        onSelect: () => openModal({ kind: "categorySettings", categoryId: category.id }),
      });
      items.push({
        label: "Apagar categoria",
        icon: <Trash2 size={18} />,
        danger: true,
        onSelect: () => void apagarCategoria(guild.id, category),
      });
      // no Discord "Criar canal" vem depois de excluir, no fim do bloco
      items.push({
        label: "Criar canal",
        icon: <Plus size={18} />,
        onSelect: () => openModal({ kind: "createChannel", categoryId: category.id }),
      });
    }
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID da categoria",
        onSelect: () => void navigator.clipboard?.writeText(category.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  /**
   * Setas navegam entre canais sem tirar a mão do teclado; o próprio `button`
   * cuida de Enter/Espaço. Home/End vão para as pontas.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-channel-button]") ?? [],
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    event.preventDefault();
    items[next]?.focus();
  }

  // ── arrastar-e-soltar ────────────────────────────────────────

  function inicioArrasto(e: DragEvent, tipo: "canal" | "categoria", id: string) {
    e.dataTransfer.effectAllowed = "move";
    // o Firefox só inicia o arrasto se houver algum dado no dataTransfer
    e.dataTransfer.setData("text/plain", id);
    setArrasto({ tipo, id });
  }

  function fimArrasto() {
    setArrasto(null);
    setAlvo(null);
  }

  /** Metade de cima do item = soltar antes; metade de baixo = soltar depois. */
  function indiceNaLinha(e: DragEvent, index: number): number {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY - r.top > r.height / 2 ? index + 1 : index;
  }

  function sobreCanal(e: DragEvent, grupo: CategoryGroup, index: number, channel: Channel) {
    // participante de voz sendo arrastado: o alvo é o canal inteiro, não uma
    // posição entre canais — realce em vez de linha
    if (arrasto?.tipo === "membro-voz") {
      if (!podeSoltarEm(arrasto, channel, podeMoverMembros)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setAlvo({ tipo: "membro-voz", channelId: channel.id });
      return;
    }
    if (arrasto?.tipo !== "canal") return;
    e.preventDefault();
    setAlvo({ tipo: "canal", categoryId: grupo.category?.id ?? null, index: indiceNaLinha(e, index) });
  }

  function sobreCabecalho(e: DragEvent, grupo: CategoryGroup, indexCategoria: number) {
    // cabeçalho de categoria não recebe gente: mover é de canal de voz para
    // canal de voz, e uma categoria não é uma sala
    if (!arrasto || arrasto.tipo === "membro-voz") return;
    e.preventDefault();
    if (arrasto.tipo === "canal") {
      // soltar no cabeçalho joga o canal para o topo daquela categoria
      setAlvo({ tipo: "canal", categoryId: grupo.category?.id ?? null, index: 0 });
    } else {
      setAlvo({ tipo: "categoria", index: indiceNaLinha(e, indexCategoria) });
    }
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    const atual = arrasto;
    const destino = alvo;
    fimArrasto();
    if (!atual || !destino) return;
    if (atual.tipo === "canal" && destino.tipo === "canal") {
      void dropChannel(atual.id, destino.categoryId, destino.index);
    } else if (atual.tipo === "categoria" && destino.tipo === "categoria") {
      void dropCategory(atual.id, destino.index);
    } else if (atual.tipo === "membro-voz" && destino.tipo === "membro-voz") {
      void moverMembro(atual.userId, destino.channelId);
    }
  }

  /**
   * Solta o participante no canal de voz alvo.
   *
   * Quem troca de sala é o cliente **movido**, ao receber o `voice.moved`; aqui
   * não se toca no estado local: os dois `voice.state` do servidor (saiu de lá,
   * entrou aqui) já redesenham as duas listas para todo mundo. Recusa da API
   * (sem permissão, alvo que saiu da voz no meio do arrasto) vira toast.
   */
  async function moverMembro(userId: string, channelId: string) {
    if (!guild) return;
    try {
      await api.moverParaCanalDeVoz(guild.id, userId, channelId);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível mover esta pessoa"), "error");
    }
  }

  function alvoDeCanal(categoryId: string | null, index: number): boolean {
    return alvo?.tipo === "canal" && alvo.categoryId === categoryId && alvo.index === index;
  }

  /**
   * Canal silenciado (por ele mesmo ou pelo servidor) não conta como não lido.
   *
   * Virou função porque a categoria recolhida também precisa da resposta, para
   * decidir quais canais continuam à vista.
   */
  function estaSilenciado(channel: Channel): boolean {
    return (
      isMuted(porEscopo[channelNotificationScope(channel.id)]) ||
      (channel.guildId ? isMuted(porEscopo[guildNotificationScope(channel.guildId)]) : false)
    );
  }

  function renderChannel(channel: Channel, grupo: CategoryGroup, index: number) {
    // um só destaque para os dois tipos: canal de voz agora também é canal
    // aberto (ele tem chat de texto), e continua marcado depois de desligar
    const active = activeChannelId === channel.id;
    const name = channel.name ?? "canal";
    const silenciado = estaSilenciado(channel);
    // canal de voz entra na conta do não lido como qualquer outro: o chat de
    // texto dele é real, e mensagem lá não pode passar despercebida
    const unread = !active && !silenciado && isUnread(channel);
    // conectado à voz **deste** canal: no Discord ganha ícone verde e nome branco
    const conectadoAqui = vozAqui === channel.id;
    const arrastando = arrasto?.tipo === "canal" && arrasto.id === channel.id;
    // alvo do arrasto de um participante: realce no canal inteiro. Linha de
    // inserção não serve aqui — não há "entre dois" numa sala de voz
    const alvoDeMembro = alvo?.tipo === "membro-voz" && alvo.channelId === channel.id;
    return (
      <div key={channel.id}>
        <LinhaDeSolta ativa={alvoDeCanal(grupo.category?.id ?? null, index)} />
        <div
          role="listitem"
          draggable={podeGerenciarCanais}
          onDragStart={(e) => inicioArrasto(e, "canal", channel.id)}
          onDragEnd={fimArrasto}
          onDragOver={(e) => sobreCanal(e, grupo, index, channel)}
          onDrop={soltar}
          onContextMenu={(e) => openChannelMenu(e, channel)}
          className={`group relative mx-2 flex h-9 items-center rounded-lg pl-[10px] pr-1 ${
            arrastando ? "opacity-40" : ""
          } ${alvoDeMembro ? "bg-interactive-background-hover ring-2 ring-inset ring-brand-500" : ""} ${
            active
              ? "bg-interactive-background-selected text-text-strong"
              : unread
                ? "text-text-strong hover:bg-interactive-background-hover"
                : "text-channels-default hover:bg-interactive-background-hover hover:text-text-default"
          } ${silenciado && !active ? "opacity-50" : ""}`}
        >
          {unread && (
            // ponto branco na margem esquerda, como o Discord marca canal não lido
            <span aria-hidden="true" className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-switch-thumb-background-default" />
          )}
          <button
            type="button"
            data-channel-button
            // `"clique"`: num canal de VOZ isto **entra na chamada**, sem
            // antessala nem prompt (ver `stores/voice-entrada.ts`)
            onClick={() => select(channel, "clique")}
            // passar o mouse por um canal de voz é o aviso mais barato de que o
            // clique pode vir: aproveita para pagar o chunk e o `.wasm` da
            // supressão avançada antes da hora (ver `preaquecerCadeiaDeVoz`,
            // que não faz nada para quem não a escolheu)
            onPointerEnter={channel.type === "VOICE" ? preaquecerCadeiaDeVoz : undefined}
            aria-current={active ? "true" : undefined}
            className={`flex h-full min-w-0 flex-1 items-center gap-2.5 text-left ${unread ? "font-semibold" : "font-medium"}`}
          >
            <ChannelIcon channel={channel} />
            <span className="truncate">{name}</span>
          </button>
          {channel.mentionCount > 0 && !active && (
            <span
              aria-label={`${channel.mentionCount} menções`}
              className="grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[11px] font-bold leading-none text-control-critical-primary-text-default"
            >
              {channel.mentionCount}
            </span>
          )}
          {/* Cronômetro da call: alinhado à direita, a 10px da borda da linha,
              como no Discord. Some no hover, que é quando os dois botões do
              canal tomam o lugar dele. */}
          {vozAqui === channel.id && vozDesde !== null && (
            <Cronometro
              desde={vozDesde}
              className="ml-auto mr-1.5 shrink-0 text-xs text-status-positive group-hover:hidden"
            />
          )}

          {/* O hover do canal no Discord mostra DOIS botões: convite e editar.
              Ficam **fora do fluxo** (`absolute`): invisíveis eles ainda
              ocupavam 48px, e era isso que empurrava o cronômetro para longe
              da borda. Só aparecem no hover ou com foco de teclado. */}
          <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
            {/* O balão do canal de VOZ, que a print `image (1).png` mostra à
                esquerda do convite e da engrenagem: ele abre a conversa **da
                call** (a coluna de 450 da direita, ver `PainelDeChatDaCall`).
                Só existe em canal de voz — no de texto a conversa é a própria
                coluna, e o botão não teria o que abrir. */}
            {channel.type === "VOICE" && (
              <BotaoDeIcone
                rotulo="Abrir conversa"
                icone={<MessageSquare size={18} />}
                tamanho="sm"
                onClick={() => {
                  // `"balao"`: abre o canal **sem** entrar — é aqui que a
                  // `VistaDoCanalDeVoz` aparece, com a conversa ao lado
                  select(channel, "balao");
                  abrirVoiceChat();
                }}
                aria-label={`Abrir a conversa de ${name}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              />
            )}
            <BotaoDeIcone
              rotulo="Criar convite"
              icone={<UserPlus size={18} />}
              tamanho="sm"
              onClick={() => void createInvite()}
              aria-label={`Criar convite para ${name}`}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            />
            {podeGerenciarCanais && (
              <BotaoDeIcone
                rotulo="Editar canal"
                icone={<Settings size={18} />}
                tamanho="sm"
                onClick={() => openModal({ kind: "channelSettings", channelId: channel.id })}
                aria-label={`Editar ${name}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              />
            )}
          </span>
        </div>
        {channel.type === "VOICE" && (
          <VoiceChannelMembers
            channelId={channel.id}
            guildId={channel.guildId}
            podeMover={podeMoverMembros}
            onArrastarMembro={(userId) =>
              setArrasto({ tipo: "membro-voz", userId, deChannelId: channel.id })
            }
            onFimDoArrasto={fimArrasto}
          />
        )}
      </div>
    );
  }

  /**
   * Desenha um bloco da lista: o cabeçalho da categoria (quando há uma) e os
   * canais dela. O bloco dos canais soltos não tem cabeçalho — no Discord eles
   * ficam no topo, sem título — e some quando está vazio.
   */
  function renderGrupo(grupo: CategoryGroup, indexCategoria: number) {
    const category = grupo.category;
    const chave = category?.id ?? "sem-categoria";
    const rotulo = category?.name ?? "";
    const lista = grupo.channels;
    const colapsavel = !!category;
    const fechada = colapsavel && collapsed.includes(chave);
    /*
      Categoria fechada não esconde tudo: o canal ativo continua à vista e,
      junto com ele, o que tem novidade — não lido ou menção. É o que o Discord
      faz, e é o que impede o colapso de engolir uma mensagem nova (ou um canal
      recém-criado, que entra aqui já como ativo). A regra é pura e testada em
      `stores/categoria-colapso`.

      Silenciado zera o "não lido" (a mesma conta do `renderChannel`), mas **não**
      as menções: o canal silenciado já desenha a pílula vermelha quando alguém
      me cita, e escondê-lo aqui apagaria da tela a citação que a pílula mostra.
    */
    const visiveis = lista.filter((c) =>
      canalVisivel({
        recolhida: fechada,
        ativo: c.id === activeChannelId || c.id === voiceChannelId,
        naoLido: !estaSilenciado(c) && isUnread(c),
        mencoes: c.mentionCount,
      }),
    );

    // categoria vazia continua desenhada (é onde se solta o primeiro canal);
    // o bloco sem título, não — senão sobraria um respiro no topo da coluna
    if (!colapsavel && grupo.channels.length === 0) return null;

    return (
      <div key={chave} className={colapsavel ? "mt-4" : "mt-1"}>
        {colapsavel && (
          <>
            {/* 2px que a medida do cabeçalho conta: a linha existe em todo
                cabeçalho de categoria e só acende no alvo do arrasto */}
            <LinhaDeSolta
              ativa={alvo?.tipo === "categoria" && alvo.index === indexCategoria}
            />
            <CategoryHeader
              label={rotulo}
              collapsed={fechada}
              onToggle={() => toggleCollapsed(chave)}
              // numa categoria cabem os dois tipos — inclusive nas duas
              // padrão, que agora são categorias comuns —, então quem pergunta
              // é o modal, como no Discord
              onCreate={
                podeGerenciarCanais
                  ? () => openModal({ kind: "createChannel", categoryId: category?.id ?? null })
                  : undefined
              }
              onEdit={
                podeGerenciarCanais && category
                  ? () => openModal({ kind: "categorySettings", categoryId: category.id })
                  : undefined
              }
              celular={celular}
              onContextMenu={category ? (e) => openCategoryMenu(e, category) : undefined}
              dragProps={
                category
                  ? {
                      draggable: podeGerenciarCanais,
                      onDragStart: (e: DragEvent) => inicioArrasto(e, "categoria", category.id),
                      onDragEnd: fimArrasto,
                      onDragOver: (e: DragEvent) => sobreCabecalho(e, grupo, indexCategoria),
                      onDrop: soltar,
                    }
                  : undefined
              }
            />
          </>
        )}
        {/* sem margem: cada canal já traz 2px de linha de solta na frente, e
            era esse par que empurrava o primeiro canal 2px abaixo da print */}
        <div>
          {visiveis.map((c) => renderChannel(c, grupo, grupo.channels.indexOf(c)))}
          {/*
            Zona de solta no fim do bloco (inclusive quando ele está vazio).
            `-mb-3` tira os 12px dela do fluxo: ela passa a ocupar os 12
            primeiros pixels da margem do bloco seguinte, que é espaço morto de
            qualquer jeito. Em fluxo, esses 12px somavam ao `mt-4` do próximo
            cabeçalho e abriam 54px entre um canal e o cabeçalho seguinte, onde
            a print tem 42 — era o buraco mais visível da coluna.
          */}
          <div
            onDragOver={(e) => {
              if (arrasto?.tipo !== "canal") return;
              e.preventDefault();
              setAlvo({
                tipo: "canal",
                categoryId: category?.id ?? null,
                index: grupo.channels.length,
              });
            }}
            onDrop={soltar}
            className="h-3 -mb-3"
          >
            <LinhaDeSolta ativa={alvoDeCanal(category?.id ?? null, grupo.channels.length)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="flex w-[294px] shrink-0 flex-col bg-background-base-lowest">
      {/*
        O cabeçalho deixa de ser um botão só. No Discord o chevron fica **colado
        ao nome**, não na extremidade, e sobra a ponta direita para o botão de
        convidar — que a gente não tinha em lugar nenhum visível, só enterrado
        no menu de contexto.

        Botão dentro de botão não é HTML válido, então o que era um vira dois
        irmãos: o do menu ocupa o espaço do nome, o de convidar fica ao lado.
      */}
      {celular ? (
        <CabecalhoDoServidor
          guild={guild}
          membros={totalDeMembros}
          onMenu={openGuildMenu}
          onConvidar={() => void createInvite()}
        />
      ) : (
      <div className="flex h-[49px] shrink-0 items-center border-b border-border-subtle pl-5 pr-3 shadow-elevation-low">
        <button
          type="button"
          onClick={openGuildMenu}
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
            onClick={() => void createInvite()}
            aria-label={`Convidar pessoas para ${guild.name}`}
            className="shrink-0"
          />
        )}
      </div>
      )}

      <div
        ref={listRef}
        role="list"
        aria-label="Canais"
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto pb-[78px] pt-2"
      >
        {loading && <p className="px-4 py-1 text-sm text-text-muted">Carregando canais…</p>}
        {!loading && channels.length === 0 && categories.length === 0 && (
          <p className="px-4 py-1 text-sm text-text-muted">
            {guild ? "Nenhum canal ainda. Crie um pelo menu do servidor." : "Escolha um servidor no rail."}
          </p>
        )}

        {grupos.map((grupo, i) => renderGrupo(grupo, i - 1))}
      </div>

    </aside>
  );
}
