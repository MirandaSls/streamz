"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
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
import { Button, Select } from "@/components/ui/primitivos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Ícone por família de ação, **24px** — `.icon__43dab{height:24px;width:24px}`
 * de `css-bruto/sob-demanda/d6f353f39f71fa89.css` (o módulo do próprio
 * registro de auditoria: as classes `target*` daquele arquivo — Ban, Channel,
 * Guild, Member, MemberRole, Role, Invite, Message… — são a mesma partição por
 * família que já tínhamos, então só o tamanho mudou (era 18).
 */
function ActionIcon({ action }: { action: AuditAction }) {
  const cls = "shrink-0 text-text-muted";
  if (action === "MEMBER_BAN" || action === "MEMBER_UNBAN") return <Gavel size={24} className={cls} aria-hidden="true" />;
  if (action === "MEMBER_KICK") return <UserX size={24} className={cls} aria-hidden="true" />;
  if (action.startsWith("MEMBER_TIMEOUT")) return <Timer size={24} className={cls} aria-hidden="true" />;
  if (action.startsWith("CHANNEL")) return <Hash size={24} className={cls} aria-hidden="true" />;
  if (action.startsWith("ROLE") || action === "MEMBER_ROLE_UPDATE") return <Shield size={24} className={cls} aria-hidden="true" />;
  if (action.startsWith("INVITE")) return <Link2 size={24} className={cls} aria-hidden="true" />;
  if (action.startsWith("MESSAGE")) return <MessageSquare size={24} className={cls} aria-hidden="true" />;
  if (action === "GUILD_UPDATE") return <Settings size={24} className={cls} aria-hidden="true" />;
  return <Trash2 size={24} className={cls} aria-hidden="true" />;
}

/** "nome: antes → depois", com um traço no lugar do vazio. */
function valor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : `${v.length} item(ns)`;
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

/**
 * Uma entrada do registro, medida em `.auditLog__43dab` do mesmo arquivo
 * (`d6f353f39f71fa89.css` — tema escuro, as regras `.theme-light` não se
 * aplicam aqui): cartão próprio (não é mais uma linha com borda inferior),
 * `border` + `--radius-sm` (8px → `rounded-lg`), fundo `--card-background-
 * default`, `padding: var(--space-4)` (4px → `p-1`).
 *
 * Dentro, o cabeçalho (`.header__43dab`) é `padding-block:10px;padding-
 * inline:10px 20px` (→ `py-2.5 pl-2.5 pr-5`), com o ícone, depois o bloco de
 * título+hora (`.timeWrap__43dab`, `margin:0 10px` → `mx-2.5`, coluna) e por
 * fim o avatar (`.avatar__43dab{margin-inline-start:10px}` → `ml-2.5`).
 *
 * **Expansível** (o pedido do cartão): sem `changes` nem `reason` o cabeçalho
 * é `.headerDefault__43dab` (`cursor:default`, não é botão); com algo pra
 * mostrar é `.headerClickable__43dab` (`cursor:pointer`) e, aberto,
 * `.headerExpanded__43dab{background-color:var(--card-secondary-bg);border-
 * radius:var(--radius-xs)}` (4px → `rounded`). O detalhe (`.changeDetails__
 * 43dab{padding:0 8px 10px}` → `px-2 pb-2.5`) fica recolhido por padrão; cada
 * linha (`.detail__43dab{margin-top:8px;margin-inline-start:40px}` → `mt-2
 * ml-10`) usa o traço (`.dash__43dab{margin:0 10px}` → `mx-2.5`) entre
 * campo e valor. O hover de `hover:bg-interactive-background-hover` e a seta
 * (`ChevronRight`/`ChevronDown`, 18px) não vêm deste CSS — é a convenção já
 * usada em `components/settings/aplicativos/pecas.tsx` para linha que abre e
 * fecha, porque este arquivo não expõe outra.
 */
function Entry({ entry }: { entry: AuditLogEntry }) {
  const [aberto, setAberto] = useState(false);
  const ator = entry.actor ? displayNameOf(entry.actor) : "Conta removida";
  const temDetalhes = entry.changes.length > 0 || !!entry.reason;

  const avatar = entry.actor ? (
    <Avatar user={entry.actor} size="md" surface="border-background-base-lower" />
  ) : (
    <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full bg-input-background-default" />
  );

  const cabecalho = (
    <>
      <ActionIcon action={entry.action} />
      <div className="mx-2.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className="font-medium text-text-strong">{ator}</span>
          <span className="text-text-default">{AUDIT_ACTION_LABELS[entry.action].toLowerCase()}</span>
          {entry.targetName && <span className="truncate font-medium text-text-strong">{entry.targetName}</span>}
        </div>
        <time className="text-xs text-text-muted" dateTime={entry.createdAt}>
          {horaCompleta(entry.createdAt)}
        </time>
      </div>
      <div className="ml-2.5 shrink-0">{avatar}</div>
      {temDetalhes &&
        (aberto ? (
          <ChevronDown size={18} aria-hidden="true" className="ml-2 shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={18} aria-hidden="true" className="ml-2 shrink-0 text-text-muted" />
        ))}
    </>
  );

  return (
    <div role="listitem" className="flex flex-col rounded-lg border border-border-subtle bg-card-background-default p-1">
      {temDetalhes ? (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className={`flex w-full items-center rounded py-2.5 pl-2.5 pr-5 text-left transition-colors hover:bg-interactive-background-hover focus-visible:bg-interactive-background-hover ${
            aberto ? "bg-card-secondary-bg" : ""
          }`}
        >
          {cabecalho}
        </button>
      ) : (
        <div className="flex w-full items-center py-2.5 pl-2.5 pr-5">{cabecalho}</div>
      )}

      {aberto && temDetalhes && (
        <div className="flex flex-col px-2 pb-2.5">
          {entry.changes.map((c, i) => (
            <div key={`${c.field}-${i}`} className="ml-10 mt-2 flex items-baseline text-xs">
              <span className="shrink-0 text-text-muted">{c.field}</span>
              {/* `.dash__43dab{margin:0 10px}` — separador entre o campo e o
                  valor, não a seta de "antes → depois" (essa é nossa, já
                  existia em `valor()`). */}
              <span className="mx-2.5 shrink-0 text-text-muted">—</span>
              <span className="min-w-0 text-text-default">
                {valor(c.before)} → {valor(c.after)}
              </span>
            </div>
          ))}
          {entry.reason && (
            <p className="ml-10 mt-2 text-xs text-text-muted">Motivo: {entry.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Registro de auditoria do servidor: quem fez o quê, filtrável por moderador e
 * por ação, com paginação por cursor ("Carregar mais").
 *
 * Estados: **vazio** (nenhuma entrada — mensagem já existia); **carregando**
 * (`loading`, texto "Carregando…" abaixo da lista); **erro** (toda falha de
 * API usa `ui.toast` + `errorMessage`, o padrão do resto do app — nenhuma
 * tela de erro própria); **sem permissão** (não existe *dentro* desta peça:
 * `ServerSettingsModal.tsx`, fora desta lista de arquivos, só mostra a aba
 * "Registro de auditoria" para quem tem `MANAGE_GUILD` — o mesmo padrão de
 * `CargosTab.tsx`); **hover/foco/desabilitado**: a linha expansível usa
 * `hover:bg-interactive-background-hover`/`focus-visible:` (convenção do
 * app, ver `Entry`), e "Carregar mais" herda de `Button` (`disabled` durante
 * `loading`).
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
        <Select<string>
          id="audit-user"
          tamanho="sm"
          valor={userId}
          aoMudar={setUserId}
          opcoes={[
            { valor: "", rotulo: "Todos os membros" },
            ...members.map((m) => ({ valor: m.user.id, rotulo: displayNameOf(m.user) })),
          ]}
          className="celular:h-[44px] celular:text-[max(16px,1em)]"
        />

        <label className="sr-only" htmlFor="audit-action">
          Filtrar por ação
        </label>
        <Select<AuditAction | "">
          id="audit-action"
          tamanho="sm"
          valor={action}
          aoMudar={setAction}
          opcoes={[
            { valor: "", rotulo: "Todas as ações" },
            ...AUDIT_ACTIONS.map((a) => ({ valor: a, rotulo: AUDIT_ACTION_LABELS[a] })),
          ]}
          className="celular:h-[44px] celular:text-[max(16px,1em)]"
        />
      </div>

      {/*
        Cada entrada agora é o próprio cartão (`.auditLog__43dab`, ver
        `Entry`); o que falta medir é o espaço ENTRE cartões — este CSS não
        cobre o contêiner que os empilha. Reaproveita o `margin-bottom:
        var(--space-4)` (4px) da linha de banido em `BanimentosTab.tsx`
        (`.bannedUser__4b8d8`, mesma família — lista de moderação, cartões
        arredondados) em vez de inventar um número: `gap-1`.
      */}
      <div role="list" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
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
        <Button
          variante="secundario"
          tamanho="sm"
          disabled={loading}
          onClick={() => void load(true)}
          className="mt-3 shrink-0 celular:h-[44px]"
        >
          Carregar mais
        </Button>
      )}
    </div>
  );
}
