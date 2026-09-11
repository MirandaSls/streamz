"use client";

import { useEffect, useState } from "react";
import { Check, Flag, RotateCcw } from "@/components/ui/icones";
import { REPORT_REASONS, displayNameOf, type ReportView } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { horaCompleta } from "@/lib/format";
import { useModeration } from "@/stores/moderation";

function rotuloDoMotivo(reason: ReportView["reason"]): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/**
 * Fila de denúncias do servidor: as pendentes por padrão, com a opção de ver as
 * já resolvidas. Cada linha mostra o texto denunciado no momento da denúncia —
 * a mensagem pode ter sido apagada justamente por causa dela.
 */
export default function ReportsTab({ guildId }: { guildId: string }) {
  const reports = useModeration((s) => s.reports);
  const loading = useModeration((s) => s.reportsLoading);
  const load = useModeration((s) => s.loadReports);
  const resolve = useModeration((s) => s.resolveReport);
  const [resolvidas, setResolvidas] = useState(false);

  useEffect(() => {
    void load(guildId, resolvidas);
  }, [guildId, resolvidas, load]);

  return (
    <div className="flex min-h-0 flex-col">
      <TituloDaPagina
        titulo="Denúncias"
        subtitulo="O que os membros denunciaram por aqui. Não existe no Discord como página do servidor; existe aqui porque a fila existe."
      />

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={!resolvidas}
          onClick={() => setResolvidas(false)}
          className={`h-9 celular:h-[44px] rounded-[3px] px-3 text-sm font-medium transition ${
            !resolvidas ? "bg-brand-500 text-control-primary-text-default" : "bg-input-background-default text-text-default hover:bg-interactive-background-hover"
          }`}
        >
          Pendentes
        </button>
        <button
          type="button"
          aria-pressed={resolvidas}
          onClick={() => setResolvidas(true)}
          className={`h-9 celular:h-[44px] rounded-[3px] px-3 text-sm font-medium transition ${
            resolvidas ? "bg-brand-500 text-control-primary-text-default" : "bg-input-background-default text-text-default hover:bg-interactive-background-hover"
          }`}
        >
          Resolvidas
        </button>
      </div>

      <div role="list" className="min-h-0 flex-1 overflow-y-auto rounded bg-input-background-default/40">
        {loading && <p className="px-3 py-4 text-sm text-text-muted">Carregando…</p>}
        {!loading && reports.length === 0 && (
          <p className="px-3 py-4 text-sm text-text-muted">
            {resolvidas ? "Nenhuma denúncia resolvida ainda." : "Nenhuma denúncia pendente. Tudo em paz."}
          </p>
        )}

        {reports.map((r) => (
          <div
            key={r.id}
            role="listitem"
            className="flex gap-3 border-b border-border-subtle px-3 py-3 last:border-b-0"
          >
            <Flag size={18} className="mt-1 shrink-0 text-status-danger" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
                <span className="font-medium text-text-strong">{rotuloDoMotivo(r.reason)}</span>
                {r.channelName && <span className="text-text-muted">em #{r.channelName}</span>}
              </div>

              <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                {r.reporter && <Avatar user={r.reporter} size="sm" surface="border-background-base-lower" />}
                <span>
                  Denunciado por {r.reporter ? displayNameOf(r.reporter) : "conta removida"}
                  {r.target ? ` · autor: ${displayNameOf(r.target)}` : ""} · {horaCompleta(r.createdAt)}
                </span>
              </div>

              {r.messageContent && (
                <blockquote className="mt-2 max-h-24 overflow-y-auto break-words rounded-[3px] border-l-2 border-border-normal bg-input-background-default px-3 py-2 text-sm text-text-default">
                  {r.messageContent}
                </blockquote>
              )}
              {r.details && <p className="mt-1 text-xs text-text-muted">Detalhes: {r.details}</p>}
              {r.resolved && r.resolvedBy && (
                <p className="mt-1 text-xs text-text-muted">
                  Resolvida por {displayNameOf(r.resolvedBy)}
                  {r.resolvedAt ? ` · ${horaCompleta(r.resolvedAt)}` : ""}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void resolve(guildId, r.id, !r.resolved)}
              className="flex h-8 celular:h-[44px] shrink-0 items-center gap-1.5 self-start rounded-[3px] bg-input-background-default px-3 text-sm font-medium text-text-default transition hover:bg-interactive-background-hover"
            >
              {r.resolved ? (
                <>
                  <RotateCcw size={16} aria-hidden="true" />
                  Reabrir
                </>
              ) : (
                <>
                  <Check size={16} aria-hidden="true" />
                  Resolver
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
