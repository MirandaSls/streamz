"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
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
  Pencil,
  Plus,
  Settings,
  Trash2,
  UserPlus,
  Volume2,
} from "lucide-react";
import { isUnread, type Category, type Channel } from "@newdisc/shared";
import UserFooter from "@/components/layout/UserFooter";
import Tooltip from "@/components/ui/Tooltip";
import VoiceChannelMembers from "@/components/voice/VoiceChannelMembers";
import { useAuth } from "@/stores/auth";
import { useCategories } from "@/stores/categories";
import { groupByCategory, type CategoryGroup } from "@/stores/channel-order";
import { useChannels } from "@/stores/channels";
import { useCanModerate, useGuilds, useIsOwner } from "@/stores/guilds";
import { anchorOf, ui, useUI, type MenuItem } from "@/stores/ui";

/** Ícone do canal: voz, anúncio (somente leitura), privado ou texto. */
function ChannelIcon({ channel }: { channel: Channel }) {
  const cls = "shrink-0 text-txt-faint";
  if (channel.type === "VOICE") return <Volume2 size={20} className={cls} aria-hidden="true" />;
  if (channel.type === "ANNOUNCEMENT" || channel.readOnly) {
    return <Megaphone size={20} className={cls} aria-hidden="true" />;
  }
  if (channel.private) return <Lock size={20} className={cls} aria-hidden="true" />;
  return <Hash size={20} className={cls} aria-hidden="true" />;
}

/** O que está sendo arrastado agora (só moderação arrasta). */
type Arrasto = { tipo: "canal" | "categoria"; id: string } | null;
/** Onde a linha de inserção aparece. */
type Alvo =
  | { tipo: "canal"; categoryId: string | null; index: number }
  | { tipo: "categoria"; index: number }
  | null;

/** Linha de 2px que marca onde o item vai cair. */
function LinhaDeSolta({ ativa }: { ativa: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`mx-2 h-0.5 rounded-full transition ${ativa ? "bg-accent" : "bg-transparent"}`}
    />
  );
}

/**
 * Cabeçalho de categoria: chevron + nome em caixa-alta e o "+" de criar canal
 * dentro dela no hover, como no Discord.
 */
function CategoryHeader({
  label,
  collapsed,
  onToggle,
  onCreate,
  onContextMenu,
  dragProps,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  onCreate?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  dragProps?: Record<string, unknown>;
}) {
  return (
    <div className="group flex items-center pr-2" onContextMenu={onContextMenu} {...dragProps}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center gap-0.5 pl-2 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted hover:text-txt-normal"
      >
        {collapsed ? (
          <ChevronRight size={12} aria-hidden="true" />
        ) : (
          <ChevronDown size={12} aria-hidden="true" />
        )}
        <span className="truncate">{label}</span>
      </button>
      {onCreate && (
        <Tooltip label="Criar canal">
          <button
            type="button"
            onClick={onCreate}
            aria-label={`Criar canal em ${label}`}
            className="text-txt-muted opacity-0 transition hover:text-txt-primary group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Plus size={18} />
          </button>
        </Tooltip>
      )}
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
  const listRef = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto>(null);
  const [alvo, setAlvo] = useState<Alvo>(null);

  const guild = useGuilds((s) => s.guilds.find((g) => g.id === s.activeGuildId) ?? null);
  const createInvite = useGuilds((s) => s.createInvite);
  const leaveGuild = useGuilds((s) => s.leave);
  const removeGuild = useGuilds((s) => s.remove);
  const user = useAuth((s) => s.user);
  const canModerate = useCanModerate(user?.id);
  const isOwner = useIsOwner(user?.id);

  const channels = useChannels((s) => s.channels);
  const loading = useChannels((s) => s.loading);
  const activeChannelId = useChannels((s) => s.activeChannelId);
  const voiceChannelId = useChannels((s) => s.voiceChannelId);
  const select = useChannels((s) => s.select);
  const rename = useChannels((s) => s.rename);
  const removeChannel = useChannels((s) => s.remove);
  const dropChannel = useChannels((s) => s.dropChannel);
  const dropCategory = useChannels((s) => s.dropCategory);
  const markGuildRead = useChannels((s) => s.markGuildRead);

  const openModal = useUI((s) => s.openModal);
  const categories = useCategories((s) => s.categories);
  const collapsed = useCategories((s) => s.collapsed);
  const toggleCollapsed = useCategories((s) => s.toggleCollapsed);
  const setAllCollapsed = useCategories((s) => s.setAllCollapsed);
  const criarCategoria = useCategories((s) => s.create);
  const renomearCategoria = useCategories((s) => s.rename);
  const apagarCategoria = useCategories((s) => s.remove);

  const grupos = groupByCategory(channels, categories);
  // sem nenhuma categoria o Discord ainda separa "texto" de "voz": mantemos o
  // agrupamento por tipo até o servidor criar a primeira categoria de verdade
  const semCategorias = categories.length === 0;
  const texto = grupos[0].channels.filter((c) => c.type !== "VOICE");
  const voz = grupos[0].channels.filter((c) => c.type === "VOICE");

  /** Menu do cabeçalho do servidor (o chevron do Discord). */
  function openGuildMenu(e: MouseEvent<HTMLButtonElement>) {
    if (!guild) return;
    const r = e.currentTarget.getBoundingClientRect();
    const items: MenuItem[] = [
      { label: "Convidar pessoas", icon: <UserPlus size={18} />, onSelect: () => void createInvite() },
      { label: "Criar canal", icon: <Plus size={18} />, onSelect: () => openModal({ kind: "createChannel" }) },
    ];
    if (canModerate) {
      items.push({ label: "Criar categoria", icon: <FolderPlus size={18} />, onSelect: () => void novaCategoria() });
      items.push({ label: "Convites", icon: <Link2 size={18} />, onSelect: () => openModal({ kind: "invites", guildId: guild.id }) });
      items.push({
        label: "Configurações do servidor",
        icon: <Settings size={18} />,
        onSelect: () => openModal({ kind: "serverSettings", guildId: guild.id }),
      });
    }
    items.push({ separator: true });
    items.push({
      label: "Marcar servidor como lido",
      icon: <CheckCheck size={18} />,
      onSelect: () => void markGuildRead(guild.id),
    });
    items.push({ separator: true });
    if (isOwner) {
      items.push({ label: "Apagar servidor", icon: <Trash2 size={18} />, danger: true, onSelect: () => void removeGuild(guild.id) });
    } else {
      items.push({ label: "Sair do servidor", icon: <LogOut size={18} />, danger: true, onSelect: () => void leaveGuild(guild.id) });
    }
    ui.openContextMenu(r.left + 10, r.bottom + 4, items);
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

  /** Botão direito num canal: leitura, configurações e moderação. */
  function openChannelMenu(e: MouseEvent, channel: Channel) {
    e.preventDefault();
    const items: MenuItem[] = [
      { label: "Marcar como lido", icon: <CheckCheck size={18} />, onSelect: () => void useChannels.getState().markRead(channel.id) },
      { label: "Copiar ID do canal", onSelect: () => void navigator.clipboard?.writeText(channel.id) },
    ];
    if (channel.type === "ANNOUNCEMENT") {
      items.push({ label: "Seguir canal (em breve)", icon: <Megaphone size={18} />, disabled: true, onSelect: () => {} });
    }
    if (canModerate) {
      items.push({ separator: true });
      items.push({ label: "Renomear canal", icon: <Pencil size={18} />, onSelect: () => void rename(channel) });
      items.push({
        label: "Configurações do canal",
        icon: <Settings size={18} />,
        onSelect: () => openModal({ kind: "channelSettings", channelId: channel.id }),
      });
      if (channel.private) {
        items.push({
          label: "Gerenciar acesso",
          icon: <Lock size={18} />,
          onSelect: () => openModal({ kind: "channelSettings", channelId: channel.id, tab: "permissoes" }),
        });
      }
      items.push({ label: "Apagar canal", icon: <Trash2 size={18} />, danger: true, onSelect: () => void removeChannel(channel) });
    }
    ui.openContextMenu(e.clientX, e.clientY, items);
  }

  /** Botão direito numa categoria: renomear, apagar e colapsar tudo. */
  function openCategoryMenu(e: MouseEvent, category: Category) {
    e.preventDefault();
    if (!guild) return;
    const items: MenuItem[] = [
      {
        label: collapsed.includes(category.id) ? "Expandir categoria" : "Recolher categoria",
        onSelect: () => toggleCollapsed(category.id),
      },
      { label: "Recolher todas as categorias", onSelect: () => setAllCollapsed(true) },
      { label: "Expandir todas as categorias", onSelect: () => setAllCollapsed(false) },
    ];
    if (canModerate) {
      items.push({ separator: true });
      items.push({
        label: "Criar canal",
        icon: <Plus size={18} />,
        onSelect: () => openModal({ kind: "createChannel", categoryId: category.id }),
      });
      items.push({
        label: "Renomear categoria",
        icon: <Pencil size={18} />,
        onSelect: () => void renomearCategoria(guild.id, category),
      });
      items.push({
        label: "Apagar categoria",
        icon: <Trash2 size={18} />,
        danger: true,
        onSelect: () => void apagarCategoria(guild.id, category),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items);
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

  function sobreCanal(e: DragEvent, grupo: CategoryGroup, index: number) {
    if (arrasto?.tipo !== "canal") return;
    e.preventDefault();
    setAlvo({ tipo: "canal", categoryId: grupo.category?.id ?? null, index: indiceNaLinha(e, index) });
  }

  function sobreCabecalho(e: DragEvent, grupo: CategoryGroup, indexCategoria: number) {
    if (!arrasto) return;
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
    }
  }

  function alvoDeCanal(categoryId: string | null, index: number): boolean {
    return alvo?.tipo === "canal" && alvo.categoryId === categoryId && alvo.index === index;
  }

  function renderChannel(channel: Channel, grupo: CategoryGroup, index: number) {
    const active = (channel.type === "VOICE" ? voiceChannelId : activeChannelId) === channel.id;
    const name = channel.name ?? "canal";
    const unread = !active && channel.type !== "VOICE" && isUnread(channel);
    const arrastando = arrasto?.tipo === "canal" && arrasto.id === channel.id;
    return (
      <div key={channel.id}>
        <LinhaDeSolta ativa={alvoDeCanal(grupo.category?.id ?? null, index)} />
        <div
          role="listitem"
          draggable={canModerate}
          onDragStart={(e) => inicioArrasto(e, "canal", channel.id)}
          onDragEnd={fimArrasto}
          onDragOver={(e) => sobreCanal(e, grupo, index)}
          onDrop={soltar}
          onContextMenu={(e) => openChannelMenu(e, channel)}
          className={`group relative mx-2 flex h-8 items-center rounded-[4px] pl-2 pr-1 ${
            arrastando ? "opacity-40" : ""
          } ${
            active
              ? "bg-sel text-txt-primary"
              : unread
                ? "text-txt-primary hover:bg-hov"
                : "text-txt-faint hover:bg-hov hover:text-txt-normal"
          }`}
        >
          {unread && (
            // ponto branco na margem esquerda, como o Discord marca canal não lido
            <span aria-hidden="true" className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-white" />
          )}
          <button
            type="button"
            data-channel-button
            onClick={() => select(channel)}
            aria-current={active ? "true" : undefined}
            className={`flex h-full min-w-0 flex-1 items-center gap-1.5 text-left ${unread ? "font-semibold" : "font-medium"}`}
          >
            <ChannelIcon channel={channel} />
            <span className="truncate">{name}</span>
          </button>
          {channel.mentionCount > 0 && !active && (
            <span
              aria-label={`${channel.mentionCount} menções`}
              className="grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[11px] font-bold leading-none text-white"
            >
              {channel.mentionCount}
            </span>
          )}
          {canModerate && (
            <Tooltip label="Configurações do canal">
              <button
                type="button"
                onClick={() => openModal({ kind: "channelSettings", channelId: channel.id })}
                aria-label={`Configurações de ${name}`}
                className="grid h-6 w-6 place-items-center rounded text-txt-muted opacity-0 transition hover:text-txt-primary group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Settings size={16} />
              </button>
            </Tooltip>
          )}
        </div>
        {channel.type === "VOICE" && <VoiceChannelMembers channelId={channel.id} />}
      </div>
    );
  }

  /**
   * Desenha um bloco da lista. `override` existe para o modo sem categorias:
   * os canais continuam sendo um bloco só (é sobre ele que a reordenação
   * calcula os índices), mas aparecem sob os rótulos por tipo — o template
   * padrão de um servidor novo no Discord.
   */
  function renderGrupo(
    grupo: CategoryGroup,
    indexCategoria: number,
    override?: { chave: string; label: string; channels: Channel[] },
  ) {
    const category = grupo.category;
    const chave = override?.chave ?? category?.id ?? "sem-categoria";
    const rotulo = override?.label ?? category?.name ?? "";
    const lista = override?.channels ?? grupo.channels;
    const colapsavel = !!category || !!override;
    const fechada = colapsavel && collapsed.includes(chave);
    // categoria fechada ainda mostra o canal ativo, como no Discord
    const visiveis = fechada
      ? lista.filter((c) => c.id === activeChannelId || c.id === voiceChannelId)
      : lista;

    if (!colapsavel && grupo.channels.length === 0) return null;
    if (override && lista.length === 0) return null;

    return (
      <div key={chave} className={colapsavel ? "mt-4" : "mt-1"}>
        {colapsavel && (
          <>
            {category && (
              <LinhaDeSolta ativa={alvo?.tipo === "categoria" && alvo.index === indexCategoria} />
            )}
            <CategoryHeader
              label={rotulo}
              collapsed={fechada}
              onToggle={() => toggleCollapsed(chave)}
              onCreate={
                canModerate
                  ? () => openModal({ kind: "createChannel", categoryId: category?.id ?? null })
                  : undefined
              }
              onContextMenu={category ? (e) => openCategoryMenu(e, category) : undefined}
              dragProps={
                category
                  ? {
                      draggable: canModerate,
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
        <div className="mt-0.5">
          {visiveis.map((c) => renderChannel(c, grupo, grupo.channels.indexOf(c)))}
          {/* zona de solta no fim do bloco (inclusive quando ele está vazio) */}
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
            className="h-3"
          >
            <LinhaDeSolta ativa={alvoDeCanal(category?.id ?? null, grupo.channels.length)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <button
        type="button"
        onClick={openGuildMenu}
        disabled={!guild}
        aria-haspopup="menu"
        className="flex h-12 shrink-0 items-center justify-between px-4 font-semibold text-txt-primary shadow-header transition hover:bg-hov disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="truncate">{guild?.name ?? "Selecione um servidor"}</span>
        {guild && <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-txt-secondary" />}
      </button>

      <div
        ref={listRef}
        role="list"
        aria-label="Canais"
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto pb-2 pt-2"
      >
        {loading && <p className="px-4 py-1 text-sm text-txt-muted">Carregando canais…</p>}
        {!loading && channels.length === 0 && categories.length === 0 && (
          <p className="px-4 py-1 text-sm text-txt-muted">
            {guild ? "Nenhum canal ainda. Crie um pelo menu do servidor." : "Escolha um servidor no rail."}
          </p>
        )}

        {semCategorias
          ? // servidor que nunca criou categoria: rótulos por tipo, um bloco só
            [
              { chave: "tipo:texto", label: "Canais de texto", channels: texto },
              { chave: "tipo:voz", label: "Canais de voz", channels: voz },
            ].map((v) => renderGrupo(grupos[0], -1, v))
          : grupos.map((grupo, i) => renderGrupo(grupo, i - 1))}
      </div>

      <UserFooter />
    </aside>
  );
}
