"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Gavel,
  Hash,
  Link2,
  MessageSquare,
  Settings,
  Shield,
  Timer,
  Trash2,
  UserX,
} from "@/components/ui/icones";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  displayNameOf,
  type AuditAction,
  type AuditLogEntry,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/** Ícone por família de ação — o registro é lido de relance, não palavra a palavra. */
function ActionIcon({ action }: { action: AuditAction }) {
  const cls = "shrink-0 text-text-muted";
  if (action === "MEMBER_BAN" || action === "MEMBER_UNBAN") return <Gavel size={18} className={cls} aria-hidden="true" />;
  if (action === "MEMBER_KICK") return <UserX size={18} className={cls} aria-hidden="true" />;
  if (action.startsWith("MEMBER_TIMEOUT")) return <Timer size={18} className={cls} aria-hidden="true" />;
  if (action.startsWith("CHANNEL")) return <Hash size={18} className={cls} aria-hidden="true" />;
  if (action.startsWith("ROLE") || action === "MEMBER_ROLE_UPDATE") return <Shield size={18} className={cls} aria-hidden="true" />;
  if (action.startsWith("INVITE")) return <Link2 size={18} className={cls} aria-hidden="true" />;
  if (action.startsWith("MESSAGE")) return <MessageSquare size={18} className={cls} aria-hidden="true" />;
  if (action === "GUILD_UPDATE") return <Settings size={18} className={cls} aria-hidden="true" />;
  return <Trash2 size={18} className={cls} aria-hidden="true" />;
}

/** "nome: antes → depois", com um traço no lugar do vazio. */
function valor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : `${v.length} item(ns)`;
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

function Entry({ entry }: { entry: AuditLogEntry }) {
  const ator = entry.actor ? displayNameOf(entry.actor) : "Conta removida";
  return (
    <div role="listitem" className="flex gap-3 border-b border-border-subtle px-3 py-3 last:border-b-0">
      {entry.actor ? (
        <Avatar user={entry.actor} size="md" surface="border-background-base-lower" />
      ) : (
        <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full bg-input-background-default" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <ActionIcon action={entry.action} />
          <span className="font-medium text-text-strong">{ator}</span>
          <span className="text-text-default">{AUDIT_ACTION_LABELS[entry.action].toLowerCase()}</span>
          {entry.targetName && <span className="font-medium text-text-strong">{entry.targetName}</span>}
        </div>
        {entry.changes.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {entry.changes.map((c, i) => (
              <li key={`${c.field}-${i}`} className="text-xs text-text-muted">
                {c.field}: {valor(c.before)} → {valor(c.after)}
              </li>
            ))}
          </ul>
        )}
        {entry.reason && <p className="mt-1 text-xs text-text-muted">Motivo: {entry.reason}</p>}
      </div>
      <time className="shrink-0 text-xs text-text-muted" dateTime={entry.createdAt}>
        {horaCompleta(entry.createdAt)}
      </time>
    </div>
  );
}

/**
 * Registro de auditoria do servidor: quem fez o quê, filtrável por moderador e
 * por ação, com paginação por cursor ("Carregar mais").
 */
export default function AuditLogTab({ guildId }: { guildId: string }) {
  const members = useGuilds((s) => s.members);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<AuditAction | "">("");
  const [userId, setUserId] = useState("");

  const load = useCallback(
    async (proximaPagina = false) => {
      setLoading(true);
      try {
        const page = await api.auditLog(guildId, {
          action: action || undefined,
          userId: userId || undefined,
          cursor: proximaPagina ? (cursor ?? undefined) : undefined,
        });
        setEntries((prev) => (proximaPagina ? [...prev, ...page.entries] : page.entries));
        setCursor(page.nextCursor);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível carregar o registro"), "error");
      } finally {
        setLoading(false);
      }
    },
    // `cursor` de propósito fora: trocar de filtro sempre recomeça na primeira
    // página, e a paginação lê o cursor do estado no momento do clique
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guildId, action, userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-col">
      <TituloDaPagina
        titulo="Registro de auditoria"
        subtitulo="Quem fez o quê neste servidor. Ações de moderação entram aqui sozinhas."
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="audit-user">
          Filtrar por moderador
        </label>
        <select
          id="audit-user"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="h-9 rounded-[3px] bg-input-background-default px-2 text-sm text-text-default outline-none celular:h-[44px] celular:text-[max(16px,1em)]"
        >
          <option value="">Todos os membros</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {displayNameOf(m.user)}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="audit-action">
          Filtrar por ação
        </label>
        <select
          id="audit-action"
          value={action}
          onChange={(e) => setAction(e.target.value as AuditAction | "")}
          className="h-9 rounded-[3px] bg-input-background-default px-2 text-sm text-text-default outline-none celular:h-[44px] celular:text-[max(16px,1em)]"
        >
          <option value="">Todas as ações</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {AUDIT_ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      <div role="list" className="min-h-0 flex-1 overflow-y-auto rounded bg-input-background-default/40">
        {entries.length === 0 && !loading && (
          <p className="px-3 py-4 text-sm text-text-muted">
            Nada registrado ainda. Ações de moderação aparecem aqui automaticamente.
          </p>
        )}
        {entries.map((e) => (
          <Entry key={e.id} entry={e} />
        ))}
        {loading && <p className="px-3 py-3 text-sm text-text-muted">Carregando…</p>}
      </div>

      {cursor && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(true)}
          className="mt-3 h-9 celular:h-[44px] shrink-0 rounded-[3px] bg-input-background-default text-sm font-medium text-text-default transition hover:bg-interactive-background-hover disabled:opacity-50"
        >
          Carregar mais
        </button>
      )}
    </div>
  );
}
