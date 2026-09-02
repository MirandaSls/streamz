"use client";

import { useCallback, useEffect, useState } from "react";
import { Laptop, LogOut, Smartphone } from "@/components/ui/icones";
import { ehDispositivoMovel, resumoDoDispositivo, type SessaoView } from "@streamz/shared";
import { EmBreve, Section } from "@/components/ui/controls";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/api-error";
import { useT } from "@/lib/i18n";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Dispositivos: as sessões (refresh tokens) ativas.
 *
 * O aparelho **atual** fica isolado no topo, com o mesmo destaque do Discord:
 * ele é o único que não se pode encerrar por engano, e numa lista única ele se
 * confundia com os outros. Encerrar tudo é uma ação só, em vermelho e de
 * largura inteira, porque é o que alguém faz quando desconfia de invasão — e
 * nessa hora não dá para caçar linha por linha.
 */
export default function SessoesTab() {
  const t = useT();
  const [sessoes, setSessoes] = useState<SessaoView[] | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setSessoes(await api.sessions());
      setIndisponivel(false);
    } catch (e) {
      if (isApiError(e, 404)) setIndisponivel(true);
      else ui.toast(errorMessage(e, "Não foi possível carregar suas sessões"), "error");
      setSessoes(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function encerrar(id: string) {
    try {
      await api.revokeSession(id);
      setSessoes((atuais) => atuais?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível encerrar a sessão"), "error");
    }
  }

  async function encerrarTodas() {
    const ok = await ui.confirm({
      title: t("sessoes.encerrarTudo"),
      message: "Todos os outros aparelhos vão precisar entrar de novo.",
      confirmLabel: t("sessoes.encerrar"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.revokeOtherSessions();
      setSessoes((atuais) => atuais?.filter((s) => s.current) ?? null);
      ui.toast("Outras sessões encerradas.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível encerrar as sessões"), "error");
    }
  }

  if (indisponivel) {
    return <EmBreve>{t("sessoes.indisponivel")}</EmBreve>;
  }

  const atual = (sessoes ?? []).find((s) => s.current) ?? null;
  const outras = (sessoes ?? []).filter((s) => !s.current);

  return (
    <>
      <p className="mb-4 text-sm text-txt-muted">{t("sessoes.intro")}</p>

      {carregando && <p className="text-sm text-txt-muted">Carregando…</p>}

      {atual && (
        <Section title={t("sessoes.atual")}>
          <div className="rounded-[6px] border border-border bg-panel px-3 py-3">
            <LinhaDeSessao sessao={atual} />
          </div>
        </Section>
      )}

      {!carregando && (
        <Section title="Outros dispositivos" semDivisoria>
          {outras.length === 0 ? (
            <p className="py-1 text-sm text-txt-muted">{t("sessoes.vazio")}</p>
          ) : (
            outras.map((sessao) => (
              <div
                key={sessao.id}
                className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
              >
                <LinhaDeSessao sessao={sessao} />
                <button
                  type="button"
                  onClick={() => void encerrar(sessao.id)}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] px-2 text-sm font-medium text-red transition hover:bg-red hover:text-white"
                >
                  <LogOut size={16} aria-hidden="true" />
                  {t("sessoes.encerrar")}
                </button>
              </div>
            ))
          )}

          {outras.length > 0 && (
            <button
              type="button"
              onClick={() => void encerrarTodas()}
              className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-[3px] bg-red text-sm font-medium text-white transition hover:bg-red-hover"
            >
              <LogOut size={16} aria-hidden="true" />
              {t("sessoes.encerrarTudo")}
            </button>
          )}
        </Section>
      )}
    </>
  );
}

/** Ícone + aparelho + quando começou. Compartilhado pelas duas listas. */
function LinhaDeSessao({ sessao }: { sessao: SessaoView }) {
  const t = useT();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {ehDispositivoMovel(sessao.userAgent) ? (
        <Smartphone size={20} className="shrink-0 text-txt-muted" aria-hidden="true" />
      ) : (
        <Laptop size={20} className="shrink-0 text-txt-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-txt-primary">
          {resumoDoDispositivo(sessao.userAgent)}
        </p>
        <p className="truncate text-xs text-txt-muted">
          {sessao.ip ? `${sessao.ip} · ` : ""}
          {t("sessoes.desde")} {dataCurta(sessao.createdAt)} · {t("sessoes.expira")}{" "}
          {dataCurta(sessao.expiresAt)}
        </p>
      </div>
    </div>
  );
}

function dataCurta(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString();
}
