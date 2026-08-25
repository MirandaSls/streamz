"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  Lock,
  Megaphone,
  Plus,
  Settings,
  UserPlus,
  Volume2,
} from "lucide-react";
import type { Channel } from "@newdisc/shared";
import UserFooter from "@/components/layout/UserFooter";
import Tooltip from "@/components/ui/Tooltip";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { ui, useUI } from "@/stores/ui";

/** Ícone do canal: voz, anúncio (somente leitura), privado ou texto. */
function ChannelIcon({ channel }: { channel: Channel }) {
  const cls = "shrink-0 text-txt-faint";
  if (channel.type === "VOICE") return <Volume2 size={20} className={cls} aria-hidden="true" />;
  if (channel.readOnly) return <Megaphone size={20} className={cls} aria-hidden="true" />;
  if (channel.private) return <Lock size={20} className={cls} aria-hidden="true" />;
  return <Hash size={20} className={cls} aria-hidden="true" />;
}

/**
 * Categoria colapsável ("CANAIS DE TEXTO"), com o "+" de criar canal no hover.
 * O MVP não tem categorias no modelo: agrupamos por tipo, que é exatamente o
 * template padrão de um servidor novo no Discord.
 */
function Category({
  label,
  collapsed,
  onToggle,
  onCreate,
  children,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  onCreate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="group flex items-center pr-2">
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
      {!collapsed && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

/** Coluna 2 no modo servidor: cabeçalho com menu, categorias e canais. */
export default function ChannelSidebar() {
  const listRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const guild = useGuilds((s) => s.guilds.find((g) => g.id === s.activeGuildId) ?? null);
  const createInvite = useGuilds((s) => s.createInvite);
  const user = useAuth((s) => s.user);
  const canModerate = useCanModerate(user?.id);

  const channels = useChannels((s) => s.channels);
  const loading = useChannels((s) => s.loading);
  const activeChannelId = useChannels((s) => s.activeChannelId);
  const voiceChannelId = useChannels((s) => s.voiceChannelId);
  const select = useChannels((s) => s.select);
  const openModal = useUI((s) => s.openModal);

  const text = channels.filter((c) => c.type !== "VOICE");
  const voice = channels.filter((c) => c.type === "VOICE");

  /** Menu do cabeçalho do servidor (o chevron do Discord). */
  function openGuildMenu(e: MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    ui.openContextMenu(r.left + 10, r.bottom + 4, [
      { label: "Convidar pessoas", icon: <UserPlus size={18} />, onSelect: () => void createInvite() },
      { label: "Criar canal", icon: <Plus size={18} />, onSelect: () => openModal({ kind: "createChannel" }) },
      { separator: true },
      { label: "Configurações do servidor", icon: <Settings size={18} />, disabled: true, onSelect: () => undefined },
    ]);
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

  function renderChannel(channel: Channel) {
    const active = (channel.type === "VOICE" ? voiceChannelId : activeChannelId) === channel.id;
    const name = channel.name ?? "canal";
    return (
      <div
        key={channel.id}
        role="listitem"
        className={`group mx-2 flex h-8 items-center rounded-[4px] pl-2 pr-1 ${
          active ? "bg-sel text-txt-primary" : "text-txt-faint hover:bg-hov hover:text-txt-normal"
        }`}
      >
        <button
          type="button"
          data-channel-button
          onClick={() => select(channel)}
          aria-current={active ? "true" : undefined}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left font-medium"
        >
          <ChannelIcon channel={channel} />
          <span className="truncate">{name}</span>
        </button>
        {channel.private && canModerate && (
          <Tooltip label="Gerenciar acesso">
            <button
              type="button"
              onClick={() => openModal({ kind: "channelAccess", channelId: channel.id })}
              aria-label={`Gerenciar acesso de ${name}`}
              className="grid h-6 w-6 place-items-center rounded text-txt-muted opacity-0 transition hover:text-txt-primary group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Settings size={16} />
            </button>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <button
        type="button"
        onClick={guild ? openGuildMenu : undefined}
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
        {!loading && channels.length === 0 && (
          <p className="px-4 py-1 text-sm text-txt-muted">
            {guild ? "Nenhum canal ainda. Crie um pelo menu do servidor." : "Escolha um servidor no rail."}
          </p>
        )}

        {text.length > 0 && (
          <Category
            label="Canais de texto"
            collapsed={!!collapsed.text}
            onToggle={() => setCollapsed((c) => ({ ...c, text: !c.text }))}
            onCreate={() => openModal({ kind: "createChannel" })}
          >
            {text.map(renderChannel)}
          </Category>
        )}
        {voice.length > 0 && (
          <Category
            label="Canais de voz"
            collapsed={!!collapsed.voice}
            onToggle={() => setCollapsed((c) => ({ ...c, voice: !c.voice }))}
            onCreate={() => openModal({ kind: "createChannel" })}
          >
            {voice.map(renderChannel)}
          </Category>
        )}
      </div>

      <UserFooter />
    </aside>
  );
}
