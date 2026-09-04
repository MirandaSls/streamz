"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Lock, Megaphone, Server, Users, Volume2 } from "@/components/ui/icones";
import { isGroupChannel, type Channel, type PublicUser, type UserStatus } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { rank, type QuickItem, type QuickKind } from "@/lib/quick-switcher";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { goToChannel } from "@/stores/messages-navigate";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui, useUI } from "@/stores/ui";

/**
 * Busca rápida (Ctrl+K), no formato do Discord: **sem título**, ancorada no
 * terço superior, o campo é a primeira coisa da caixa.
 *
 * A lista de candidatos vai além do que o app já tem em memória: os canais de
 * **todos** os servidores são buscados na primeira abertura e guardados em
 * cache — sem isso, procurar um canal de servidor fechado obrigava a um desvio
 * de dois passos. Amigos sem conversa aberta também entram: escolher um deles
 * abre a conversa.
 */

const RECENTES_KEY = "quickSwitcher.recentes";
const MAX_RECENTES = 5;
/** Prefixo dos itens que ainda não têm conversa aberta (`user:<id>`). */
const PREFIXO_USUARIO = "user:";

/** Prefixos de filtro mostrados como pílulas com o campo vazio. */
const PREFIXOS = [
  ["*", "servidores"],
  ["@", "usuários"],
  ["#", "canais de texto"],
  ["!", "canais de voz"],
];

/**
 * Canais por servidor, buscados uma vez por sessão da aba. O quick switcher é
 * reaberto o tempo todo; refazer N requisições a cada Ctrl+K seria pior que o
 * problema que isso resolve.
 */
const cacheDeCanais = new Map<string, Channel[]>();

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

/** O que cada resultado precisa para se desenhar (ícone, avatar, caminho). */
interface Detalhe {
  kind: QuickKind;
  /** canal: tipo/estado que decide o ícone. */
  variante?: "VOICE" | "readOnly" | "private" | "GROUP" | "";
  /** conversa 1-a-1 ou amigo: o avatar e a bolinha de status. */
  user?: PublicUser;
  /** grupo de conversa: mosaico dos participantes. */
  grupo?: { iconUrl: string | null; members: PublicUser[] };
  /** servidor: ícone próprio. */
  guild?: { name: string; iconUrl: string | null };
  /** servidor a que o canal pertence (para o "Servidor › #canal"). */
  guildId?: string | null;
}

export default function QuickSwitcher() {
  const t = useT();
  const closeModal = useUI((s) => s.closeModal);
  const canaisDoAtivo = useChannels((s) => s.channels);
  const dms = useDMs((s) => s.channels);
  const guilds = useGuilds((s) => s.guilds);
  const amigos = useFriends((s) => s.friends);
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const statuses = usePresence((s) => s.statuses);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  /** enquanto se navega pelo teclado, passar o mouse não muda a seleção. */
  const [tecladoNoComando, setTecladoNoComando] = useState(false);
  const [canaisPorServidor, setCanaisPorServidor] = useState<Map<string, Channel[]>>(
    () => new Map(cacheDeCanais),
  );
  const listaRef = useRef<HTMLUListElement>(null);
  const recentes = useMemo(lerRecentes, []);

  // os canais dos outros servidores só existem depois desta busca
  useEffect(() => {
    let vivo = true;
    const faltando = guilds.filter((g) => !cacheDeCanais.has(g.id) && g.id !== activeGuildId);
    if (faltando.length === 0) return;
    void Promise.all(
      faltando.map((g) =>
        api
          .getGuild(g.id)
          .then((cheio) => cacheDeCanais.set(g.id, cheio.channels ?? []))
          .catch(() => undefined),
      ),
    ).then(() => vivo && setCanaisPorServidor(new Map(cacheDeCanais)));
    return () => {
      vivo = false;
    };
  }, [guilds, activeGuildId]);

  const { itens, detalhes } = useMemo(() => {
    const detalhes = new Map<string, Detalhe>();
    const itens: QuickItem[] = [];
    const nomeDoServidor = new Map(guilds.map((g) => [g.id, g.name]));

    const todosOsCanais: { canal: Channel; guildId: string }[] = [];
    for (const c of canaisDoAtivo) {
      if (activeGuildId) todosOsCanais.push({ canal: c, guildId: activeGuildId });
    }
    for (const [guildId, lista] of canaisPorServidor) {
      if (guildId === activeGuildId) continue;
      for (const c of lista) todosOsCanais.push({ canal: c, guildId });
    }

    for (const { canal, guildId } of todosOsCanais) {
      detalhes.set(canal.id, {
        kind: "channel",
        variante:
          canal.type === "VOICE"
            ? "VOICE"
            : canal.readOnly
              ? "readOnly"
              : canal.private
                ? "private"
                : "",
        guildId,
      });
      itens.push({
        id: canal.id,
        kind: "channel",
        label: canal.name ?? "canal",
        hint: `${nomeDoServidor.get(guildId) ?? ""} › #${canal.name ?? "canal"}`,
      });
    }

    const comConversa = new Set<string>();
    for (const d of dms) {
      const grupo = isGroupChannel(d);
      const outro = grupo ? undefined : d.others[0];
      if (outro) comConversa.add(outro.id);
      detalhes.set(d.id, {
        kind: "dm",
        variante: grupo ? "GROUP" : "",
        user: outro,
        grupo: grupo ? { iconUrl: d.iconUrl, members: d.others } : undefined,
      });
      itens.push({
        id: d.id,
        kind: "dm",
        label: dmTitle(d),
        hint: outro ? `@${outro.username}` : undefined,
      });
    }

    // amigos que ainda não têm conversa: escolher um deles abre a conversa
    for (const a of amigos) {
      if (comConversa.has(a.id)) continue;
      const id = `${PREFIXO_USUARIO}${a.id}`;
      detalhes.set(id, { kind: "dm", user: a });
      itens.push({
        id,
        kind: "dm",
        label: a.displayName?.trim() || a.username,
        hint: `@${a.username}`,
      });
    }

    for (const g of guilds) {
      detalhes.set(g.id, { kind: "guild", guild: { name: g.name, iconUrl: g.iconUrl } });
      itens.push({ id: g.id, kind: "guild", label: g.name });
    }

    return { itens, detalhes };
  }, [canaisDoAtivo, canaisPorServidor, dms, amigos, guilds, activeGuildId]);

  /** `!` filtra canais de voz; os outros prefixos são do próprio matcher. */
  const soVoz = query.trimStart().startsWith("!");
  const consulta = soVoz ? query.trimStart().slice(1) : query;
  const candidatos = useMemo(
    () => (soVoz ? itens.filter((i) => detalhes.get(i.id)?.variante === "VOICE") : itens),
    [itens, detalhes, soVoz],
  );

  const resultados = useMemo(
    () => rank(candidatos, consulta, { recentes, limit: 50 }),
    [candidatos, consulta, recentes],
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
    const detalhe = detalhes.get(item.id);
    registrarRecente(item.id);
    closeModal();
    if (item.kind === "guild") {
      const guild = guilds.find((g) => g.id === item.id);
      if (guild) useGuilds.getState().select(guild);
      return;
    }
    if (item.kind === "dm") {
      if (item.id.startsWith(PREFIXO_USUARIO)) {
        ui.setView("dm");
        void useDMs.getState().openWith(item.id.slice(PREFIXO_USUARIO.length));
        return;
      }
      const dm = dms.find((d) => d.id === item.id);
      if (dm) {
        ui.setView("dm");
        useDMs.getState().select(dm);
      }
      return;
    }
    // canal de qualquer servidor: quem sabe trocar de servidor é o navegador
    void goToChannel({ guildId: detalhe?.guildId ?? null, channelId: item.id });
  }

  function navegar(delta: number) {
    if (resultados.length === 0) return;
    setTecladoNoComando(true);
    setCursor((c) => (c + delta + resultados.length) % resultados.length);
  }

  const vazia = !query.trim();

  return (
    <Dialog
      title={t("quick.titulo")}
      hideHeader
      showClose={false}
      align="top"
      onClose={closeModal}
      className="w-[570px]"
      bodyClassName="!p-0"
    >
      {/* o campo é o primeiro elemento: no Discord o quick switcher não tem título */}
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
        className="h-14 w-full bg-transparent px-4 text-xl text-txt-primary outline-none placeholder:text-txt-muted"
      />

      {/* as pílulas de prefixo saem de cena assim que se digita, como no Discord */}
      {vazia && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-xs text-txt-muted">
          {PREFIXOS.map(([prefixo, o]) => (
            <li key={prefixo} className="flex items-center gap-1.5">
              <kbd className="rounded bg-void px-1.5 py-0.5 font-mono text-[11px] font-semibold text-txt-normal">
                {prefixo}
              </kbd>
              {o}
            </li>
          ))}
        </ul>
      )}

      {vazia && resultados.length > 0 && (
        <p className="px-4 pb-1 text-xs font-semibold uppercase text-txt-muted">
          {t("quick.recentes")}
        </p>
      )}

      <ul
        id="quick-switcher-resultados"
        ref={listaRef}
        role="listbox"
        aria-label={t("quick.titulo")}
        onMouseMove={() => setTecladoNoComando(false)}
        className="max-h-[400px] overflow-y-auto px-2 pb-2"
      >
        {resultados.length === 0 && (
          <li className="py-6 text-center text-sm text-txt-muted">{t("quick.vazio")}</li>
        )}
        {resultados.map((item, indice) => {
          const selecionado = indice === cursor;
          const detalhe = detalhes.get(item.id);
          return (
            <li key={`${item.kind}-${item.id}`} role="option" aria-selected={selecionado}>
              <button
                type="button"
                data-indice={indice}
                // mover o mouse não rouba a seleção de quem está no teclado
                onMouseEnter={() => !tecladoNoComando && setCursor(indice)}
                onClick={() => escolher(item)}
                className={`flex h-10 w-full items-center gap-2 rounded-[4px] px-2 text-left ${
                  selecionado ? "bg-accent text-accent-ink" : "text-txt-normal"
                }`}
              >
                <ItemIcon detalhe={detalhe} statuses={statuses} selecionado={selecionado} />
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                {item.hint && (
                  <span
                    className={`shrink-0 truncate text-xs ${
                      selecionado ? "text-accent-ink/70" : "text-txt-muted"
                    }`}
                  >
                    {item.hint}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-border px-4 py-2 text-xs text-txt-muted">
        <span className="font-semibold uppercase text-txt-secondary">Protip:</span> ↑ ↓ para
        navegar · ↵ para abrir · Esc para fechar
      </p>
    </Dialog>
  );
}

/** Ícone do resultado: avatar nas conversas, ícone do servidor nos servidores. */
function ItemIcon({
  detalhe,
  statuses,
  selecionado,
}: {
  detalhe: Detalhe | undefined;
  statuses: Record<string, UserStatus>;
  selecionado: boolean;
}) {
  const cls = `shrink-0 ${selecionado ? "text-accent-ink" : "text-txt-muted"}`;
  if (!detalhe) return <Hash size={20} className={cls} aria-hidden="true" />;

  if (detalhe.kind === "guild") {
    const { name, iconUrl } = detalhe.guild ?? { name: "", iconUrl: null };
    return iconUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
    ) : name ? (
      <span
        aria-hidden="true"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-void text-[10px] font-semibold text-txt-normal"
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    ) : (
      <Server size={20} className={cls} aria-hidden="true" />
    );
  }

  if (detalhe.kind === "dm") {
    if (detalhe.grupo) {
      return (
        <GroupAvatar
          iconUrl={detalhe.grupo.iconUrl}
          members={detalhe.grupo.members}
          size="sm"
          className="shrink-0"
        />
      );
    }
    if (detalhe.user) {
      return (
        <Avatar
          user={detalhe.user}
          size="sm"
          status={resolveStatus(statuses, detalhe.user)}
          surface="border-chat"
        />
      );
    }
    return <Users size={20} className={cls} aria-hidden="true" />;
  }

  if (detalhe.variante === "VOICE") return <Volume2 size={20} className={cls} aria-hidden="true" />;
  if (detalhe.variante === "readOnly")
    return <Megaphone size={20} className={cls} aria-hidden="true" />;
  if (detalhe.variante === "private") return <Lock size={20} className={cls} aria-hidden="true" />;
  return <Hash size={20} className={cls} aria-hidden="true" />;
}
