"use client";

import { useRef, type KeyboardEvent } from "react";
import type { Channel } from "@newdisc/shared";
import UserFooter from "@/components/layout/UserFooter";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { useUI } from "@/stores/ui";

/** Ícone do canal: privado, voz ou texto. */
function channelIcon(channel: Channel): string {
  if (channel.private) return "🔒";
  return channel.type === "VOICE" ? "🔊" : "#";
}

/** Coluna 2 no modo servidor: canais, convite e criação. */
export default function ChannelSidebar() {
  const listRef = useRef<HTMLDivElement>(null);

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

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-black/20 px-4 py-3 font-semibold">
        <span className="truncate">{guild?.name ?? "Selecione um servidor"}</span>
        {guild && (
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => void createInvite()}
              aria-label="Criar convite"
              title="Criar convite"
              className="text-base text-neutral-400 transition hover:text-white"
            >
              🔗
            </button>
            <button
              type="button"
              onClick={() => openModal({ kind: "createChannel" })}
              aria-label="Novo canal"
              title="Novo canal"
              className="text-lg text-neutral-400 transition hover:text-white"
            >
              +
            </button>
          </div>
        )}
      </div>

      <div
        ref={listRef}
        role="list"
        aria-label="Canais"
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto p-2"
      >
        {loading && <p className="px-2 py-1 text-sm text-neutral-500">Carregando canais…</p>}
        {!loading && channels.length === 0 && (
          <p className="px-2 py-1 text-sm text-neutral-500">
            {guild ? "Nenhum canal ainda. Crie um pelo + acima." : "Escolha um servidor no rail."}
          </p>
        )}
        {channels.map((channel) => {
          const active =
            (channel.type === "VOICE" ? voiceChannelId : activeChannelId) === channel.id;
          return (
            <div
              key={channel.id}
              role="listitem"
              className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${
                active ? "bg-black/30 text-white" : "text-neutral-400"
              }`}
            >
              <button
                type="button"
                data-channel-button
                onClick={() => select(channel)}
                aria-current={active ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-1 rounded text-left"
              >
                <span aria-hidden="true" className="text-neutral-500">
                  {channelIcon(channel)}
                </span>
                <span className="truncate">{channel.name ?? "canal"}</span>
                {channel.readOnly && (
                  <span aria-label="Somente leitura" title="Somente leitura">
                    📢
                  </span>
                )}
              </button>
              {channel.private && canModerate && (
                <button
                  type="button"
                  onClick={() => openModal({ kind: "channelAccess", channelId: channel.id })}
                  aria-label={`Gerenciar acesso de ${channel.name ?? "canal"}`}
                  title="Gerenciar acesso"
                  className="hidden text-xs text-neutral-400 transition hover:text-white group-focus-within:block group-hover:block"
                >
                  ⚙️
                </button>
              )}
            </div>
          );
        })}
      </div>

      <UserFooter />
    </aside>
  );
}
