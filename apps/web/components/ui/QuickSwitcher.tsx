"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Lock, Megaphone, MessageSquare, Server, Users, Volume2 } from "lucide-react";
import { isGroupChannel } from "@newdisc/shared";
import Dialog from "@/components/modals/Dialog";
import { useT } from "@/lib/i18n";
import { rank, type QuickItem, type QuickKind } from "@/lib/quick-switcher";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useUI } from "@/stores/ui";

/**
 * Busca rápida (Ctrl+K): canais (`#`), conversas (`@`) e servidores (`*`) numa
 * caixa só, navegável com as setas.
 *
 * A lista de candidatos é a que o app já tem carregada — canais do servidor
 * aberto, conversas e servidores. Buscar canal de servidor fechado exigiria
 * carregar todos os canais de todos os servidores no boot; enquanto isso não
 * existe, escolher o servidor pelo `*` leva o usuário até lá em dois passos.
 */

const RECENTES_KEY = "quickSwitcher.recentes";
const MAX_RECENTES = 5;

function lerRecentes(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(RECENTES_KEY) : null;
    const lista: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista.filter((i): i is string => typeof i === "string") : [];
  } catch {
    return [];
  }
}

function registrarRecente(id: string) {
  try {
    const proximos = [id, ...lerRecentes().filter((i) => i !== id)].slice(0, MAX_RECENTES);
    localStorage.setItem(RECENTES_KEY, JSON.stringify(proximos));
  } catch {
    // sem storage os recentes simplesmente não persistem
  }
}

/** Ícone de cada tipo de resultado (o mesmo da coluna 2, para reconhecer). */
function ItemIcon({ kind, extra }: { kind: QuickKind; extra?: string }) {
  const cls = "shrink-0 text-txt-muted";
  if (kind === "guild") return <Server size={20} className={cls} aria-hidden="true" />;
  if (kind === "dm") {
    return extra === "GROUP" ? (
      <Users size={20} className={cls} aria-hidden="true" />
    ) : (
      <MessageSquare size={20} className={cls} aria-hidden="true" />
    );
  }
  if (extra === "VOICE") return <Volume2 size={20} className={cls} aria-hidden="true" />;
  if (extra === "readOnly") return <Megaphone size={20} className={cls} aria-hidden="true" />;
  if (extra === "private") return <Lock size={20} className={cls} aria-hidden="true" />;
  return <Hash size={20} className={cls} aria-hidden="true" />;
}

export default function QuickSwitcher() {
  const t = useT();
  const closeModal = useUI((s) => s.closeModal);
  const channels = useChannels((s) => s.channels);
  const dms = useDMs((s) => s.channels);
  const guilds = useGuilds((s) => s.guilds);
  const guildAtiva = useGuilds((s) => s.guilds.find((g) => g.id === s.activeGuildId) ?? null);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);
  const recentes = useMemo(lerRecentes, []);

  /** `extra` guarda o que decide o ícone sem inflar o contrato do matcher. */
  const extras = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of channels) {
      map[c.id] = c.type === "VOICE" ? "VOICE" : c.readOnly ? "readOnly" : c.private ? "private" : "";
    }
    for (const d of dms) map[d.id] = isGroupChannel(d) ? "GROUP" : "";
    return map;
  }, [channels, dms]);

  const itens = useMemo<QuickItem[]>(
    () => [
      ...channels.map((c) => ({
        id: c.id,
        kind: "channel" as const,
        label: c.name ?? "canal",
        hint: guildAtiva?.name,
      })),
      ...dms.map((d) => ({ id: d.id, kind: "dm" as const, label: dmTitle(d) })),
      ...guilds.map((g) => ({ id: g.id, kind: "guild" as const, label: g.name })),
    ],
    [channels, dms, guilds, guildAtiva],
  );

  const resultados = useMemo(
    () => rank(itens, query, { recentes, limit: 25 }),
    [itens, query, recentes],
  );

  // busca nova recomeça a seleção do topo
  useEffect(() => setCursor(0), [query]);

  // mantém o item selecionado à vista quando se navega com as setas
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function escolher(item: QuickItem | undefined) {
    if (!item) return;
    registrarRecente(item.id);
    closeModal();
    if (item.kind === "guild") {
      const guild = guilds.find((g) => g.id === item.id);
      if (guild) useGuilds.getState().select(guild);
      return;
    }
    if (item.kind === "dm") {
      const dm = dms.find((d) => d.id === item.id);
      if (dm) useDMs.getState().select(dm);
      return;
    }
    const channel = channels.find((c) => c.id === item.id);
    if (channel) useChannels.getState().select(channel);
  }

  function navegar(delta: number) {
    if (resultados.length === 0) return;
    setCursor((c) => (c + delta + resultados.length) % resultados.length);
  }

  return (
    <Dialog title={t("quick.titulo")} onClose={closeModal} className="w-[570px]">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            navegar(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            navegar(-1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            escolher(resultados[cursor]);
          }
        }}
        aria-label={t("quick.placeholder")}
        aria-controls="quick-switcher-resultados"
        placeholder={t("quick.placeholder")}
        className="h-11 w-full rounded-[4px] bg-rail px-3 text-txt-normal outline-none placeholder:text-txt-muted"
      />
      <p className="mt-2 text-xs text-txt-muted">{t("quick.dica")}</p>

      {!query.trim() && resultados.length > 0 && (
        <p className="mt-3 text-xs font-semibold uppercase text-txt-muted">{t("quick.recentes")}</p>
      )}

      <ul
        id="quick-switcher-resultados"
        ref={listaRef}
        role="listbox"
        aria-label={t("quick.titulo")}
        className="mt-2 max-h-[320px] overflow-y-auto"
      >
        {resultados.length === 0 && (
          <li className="py-6 text-center text-sm text-txt-muted">{t("quick.vazio")}</li>
        )}
        {resultados.map((item, indice) => (
          <li key={`${item.kind}-${item.id}`} role="option" aria-selected={indice === cursor}>
            <button
              type="button"
              data-indice={indice}
              onMouseEnter={() => setCursor(indice)}
              onClick={() => escolher(item)}
              className={`flex h-10 w-full items-center gap-2 rounded-[4px] px-2 text-left ${
                indice === cursor ? "bg-hov text-txt-primary" : "text-txt-normal"
              }`}
            >
              <ItemIcon kind={item.kind} extra={extras[item.id]} />
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              {item.hint && <span className="shrink-0 text-xs text-txt-muted">{item.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
