"use client";

import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useUI } from "@/stores/ui";

/** Coluna 1: mensagens diretas, servidores e as duas formas de ganhar um novo. */
export default function GuildRail() {
  const guilds = useGuilds((s) => s.guilds);
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const select = useGuilds((s) => s.select);
  const create = useGuilds((s) => s.create);
  const joinByCode = useGuilds((s) => s.joinByCode);
  const openDMs = useDMs((s) => s.openList);
  const view = useUI((s) => s.view);

  return (
    <nav
      aria-label="Servidores"
      className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail py-3"
    >
      <button
        type="button"
        onClick={() => void openDMs()}
        aria-label="Mensagens diretas"
        aria-current={view === "dm" ? "page" : undefined}
        title="Mensagens diretas"
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl transition ${
          view === "dm" ? "bg-accent text-white" : "bg-panel text-neutral-200"
        }`}
      >
        ✉️
      </button>

      <div className="my-1 h-px w-8 shrink-0 bg-black/30" />

      {guilds.map((guild) => {
        const active = view === "guild" && activeGuildId === guild.id;
        return (
          <button
            key={guild.id}
            type="button"
            onClick={() => select(guild)}
            aria-label={`Servidor ${guild.name}`}
            aria-current={active ? "page" : undefined}
            title={guild.name}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-bold transition ${
              active ? "bg-accent text-white" : "bg-panel text-neutral-200"
            }`}
          >
            {guild.name.slice(0, 2).toUpperCase()}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => void create()}
        aria-label="Criar servidor"
        title="Criar servidor"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-panel text-2xl text-green-400 transition hover:brightness-110"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => void joinByCode()}
        aria-label="Entrar com convite"
        title="Entrar com convite"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-panel text-lg text-neutral-300 transition hover:text-white"
      >
        ⤵
      </button>
    </nav>
  );
}
