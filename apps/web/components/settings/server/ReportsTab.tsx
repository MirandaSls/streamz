"use client";

import { useEffect, useState } from "react";
import { Check, Flag, RotateCcw } from "@/components/ui/icones";
import { REPORT_REASONS, displayNameOf, type ReportView } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { Button, Tabs, type AbaDeTabs } from "@/components/ui/primitivos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { horaCompleta } from "@/lib/format";
import { useModeration } from "@/stores/moderation";

function rotuloDoMotivo(reason: ReportView["reason"]): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

type AbaDeDenuncia = "pendentes" | "resolvidas";

const ABAS_DE_DENUNCIA: AbaDeTabs<AbaDeDenuncia>[] = [
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "resolvidas", rotulo: "Resolvidas" },
];

/**
 * Fila de denúncias do servidor: as pendentes por padrão, com a opção de ver as
 * já resolvidas. Cada linha mostra o texto denunciado no momento da denúncia —
 * a mensagem pode ter sido apagada justamente por causa dela.
 *
 * **"Denúncias" não existe como página das configurações do servidor no
 * Discord** (só existe o **denunciar**, de dentro do menu de contexto da
 * mensagem — a fila de quem recebe é interna da Trust & Safety deles, sem
 * CSS público). Sem referência pra medir a peça inteira, o redesenho é: (1)
 * troca o par de `<button>` escritos à mão pelo primitivo `Tabs` (variante
 * `pilula`), que É medido (`Tabs.tsx`, cartão 0.4-pequenos, print de Amigos
 * 101638) — corrige de vez o `bg-brand-500` na aba ativa, que nem no Discord
 * é a cor de marca (é `--control-secondary-background-active`, sólido, sem
 * borda); (2) a moldura da lista e o cartão por linha seguem a mesma família
 * visual das duas abas de moderação vizinhas nesta carta (`AuditLogTab.tsx`,
 * `BanimentosTab.tsx`: `bg-card-background-default` + `border-border-subtle`
 * + `rounded-xl`, linhas em `bg-background-mod-subtle` + `rounded-lg`) — **não
 * medido no Discord**, é consistência com o que a mesma carta já mediu para
 * as abas ao lado.
 *
 * Estados: **vazio** (mensagem já existia, agora diferenciada por aba);
 * **carregando** (`reportsLoading`, "Carregando…"); **erro** (`ui.toast` +
 * `errorMessage`, padrão do resto do app); **sem permissão** (não existe
 * *dentro* desta peça: `ServerSettingsModal.tsx`, fora desta lista de
 * arquivos, só mostra "Denúncias" para quem tem `MANAGE_MESSAGES`);
 * **hover/foco/desabilitado**: herdados de `Tabs` e `Button`.
 */
export default function ReportsTab({ guildId }: { guildId: string }) {
  const reports = useModeration((s) => s.reports);
  const loading = useModeration((s) => s.reportsLoading);
  const load = useModeration((s) => s.loadReports);
  const resolve = useModeration((s) => s.resolveReport);
  const [aba, setAba] = useState<AbaDeDenuncia>("pendentes");
  const resolvidas = aba === "resolvidas";

  useEffect(() => {
    void load(guildId, resolvidas);
  }, [guildId, resolvidas, load]);

  return (
    <div className="flex min-h-0 flex-col">
      <TituloDaPagina
        titulo="Denúncias"
        subtitulo="O que os membros denunciaram por aqui. Não existe no Discord como página do servidor; existe aqui porque a fila existe."
      />

      <Tabs
        rotulo="Filtrar denúncias"
        variante="pilula"
        valor={aba}
        aoMudar={setAba}
        abas={ABAS_DE_DENUNCIA}
        className="mb-3"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-xl border border-border-subtle bg-card-background-default p-2">
        {loading && <p className="p-2 text-sm text-text-muted">Carregando…</p>}
        {!loading && reports.length === 0 && (
          <p className="p-2 text-sm text-text-muted">
            {resolvidas ? "Nenhuma denúncia resolvida ainda." : "Nenhuma denúncia pendente. Tudo em paz."}
          </p>
        )}

        {reports.map((r) => (
          <div
            key={r.id}
            role="listitem"
            className="flex gap-3 rounded-lg bg-background-mod-subtle p-3"
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

            <Button
              variante="secundario"
              tamanho="sm"
              icone={r.resolved ? <RotateCcw size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
              onClick={() => void resolve(guildId, r.id, !r.resolved)}
              className="self-start celular:h-[44px]"
            >
              {r.resolved ? "Reabrir" : "Resolver"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
