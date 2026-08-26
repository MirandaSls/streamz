"use client";

import { Compass, Plus } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { ui, useUI } from "@/stores/ui";

/** Iniciais de cada palavra, como o Discord faz com servidores sem ícone. */
function acronym(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

/** Badge vermelho de contagem (menções), no canto do ícone. */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} ${count === 1 ? "menção" : "menções"}`}
      className="absolute -bottom-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-[3px] border-rail bg-red px-1 text-[11px] font-bold leading-none text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Um item do rail: círculo que vira quadrado arredondado no hover/ativo, com a
 * "pílula" branca à esquerda (ponto se há não lido, curta no hover, alta
 * quando ativo) e o tooltip.
 */
function RailItem({
  label,
  active = false,
  unread = false,
  mentions = 0,
  green = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  unread?: boolean;
  mentions?: number;
  green?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative flex w-full justify-center">
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 w-2 -translate-y-1/2 rounded-r-full bg-white transition-all duration-200 ${
          active ? "h-10" : unread ? "h-2 group-hover:h-5" : "h-0 group-hover:h-5"
        }`}
      />
      <Tooltip label={label} side="right">
        <button
          type="button"
          onClick={onClick}
          aria-label={unread && !active ? `${label} (não lido)` : label}
          aria-current={active ? "page" : undefined}
          className={`relative grid h-12 w-12 place-items-center overflow-hidden text-[15px] font-semibold transition-all duration-200 ${
            active
              ? "rounded-2xl bg-accent text-accent-ink"
              : green
                ? "rounded-[24px] bg-panel text-green group-hover:rounded-2xl group-hover:bg-green group-hover:text-accent-ink"
                : "rounded-[24px] bg-panel text-txt-normal group-hover:rounded-2xl group-hover:bg-accent group-hover:text-accent-ink"
          }`}
        >
          {children}
          <Badge count={mentions} />
        </button>
      </Tooltip>
    </div>
  );
}

/** Logo do app no botão "Mensagens diretas" (o Discord põe o logo dele aqui). */
function Logo() {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" fill="currentColor" aria-hidden="true">
      <path d="M23.7 1.7A23 23 0 0 0 18 0l-.7 1.5a21 21 0 0 0-6.6 0L10 0a23 23 0 0 0-5.7 1.7C.7 7.1-.3 12.4.2 17.6A23 23 0 0 0 7.2 20l1.5-2.4a15 15 0 0 1-2.4-1.1l.6-.4a16.5 16.5 0 0 0 14.2 0l.6.4-2.4 1.1L20.8 20a23 23 0 0 0 7-2.4c.6-6-1-11.3-4.1-15.9ZM9.4 14.3c-1.4 0-2.5-1.3-2.5-2.8s1.1-2.8 2.5-2.8 2.5 1.3 2.5 2.8-1.1 2.8-2.5 2.8Zm9.2 0c-1.4 0-2.5-1.3-2.5-2.8s1.1-2.8 2.5-2.8 2.5 1.3 2.5 2.8-1.1 2.8-2.5 2.8Z" />
    </svg>
  );
}

/** Coluna 1: mensagens diretas, servidores e as duas formas de ganhar um novo. */
export default function GuildRail() {
  const guilds = useGuilds((s) => s.guilds);
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const select = useGuilds((s) => s.select);
  const create = useGuilds((s) => s.create);
  const openDMs = useDMs((s) => s.openList);
  const dms = useDMs((s) => s.channels);
  const view = useUI((s) => s.view);

  const dmUnread = dms.some((d) => d.lastMessageAt && (!d.lastReadAt || d.lastMessageAt > d.lastReadAt));
  const dmMentions = dms.reduce((n, d) => n + d.mentionCount, 0);

  return (
    <nav
      aria-label="Servidores"
      className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail pt-3 pb-2"
    >
      <RailItem
        label="Mensagens diretas"
        active={view === "dm"}
        unread={dmUnread}
        mentions={dmMentions}
        onClick={() => void openDMs()}
      >
        <Logo />
      </RailItem>

      <div aria-hidden="true" className="my-0.5 h-0.5 w-8 shrink-0 rounded bg-rail-divider" />

      {guilds.map((guild) => (
        <RailItem
          key={guild.id}
          label={guild.name}
          active={view === "guild" && activeGuildId === guild.id}
          unread={guild.unread}
          mentions={guild.mentionCount}
          onClick={() => select(guild)}
        >
          {guild.iconUrl ? (
            // o ícone é servido pelo proxy público da API; a sigla é o fallback
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={guild.iconUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            acronym(guild.name)
          )}
        </RailItem>
      ))}

      <RailItem label="Adicionar um servidor" green onClick={() => void create()}>
        <Plus size={24} />
      </RailItem>
      {/* h-moderacao: a bússola vira "Descobrir"; entrar por código é um link
          dentro dela, como no Discord */}
      <RailItem label="Descobrir servidores" green onClick={() => ui.openModal({ kind: "discover" })}>
        <Compass size={24} />
      </RailItem>
    </nav>
  );
}
