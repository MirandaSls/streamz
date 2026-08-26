"use client";

import { useCallback, useEffect, useState } from "react";
import { Laptop, LogOut, Smartphone } from "lucide-react";
import type { SessionInfo } from "@streamz/shared";
import { EmBreve } from "@/components/settings/controls";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/api-error";
import { useT } from "@/lib/i18n";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Dispositivos: as sessões (refresh tokens) ativas, com "encerrar".
 *
 * O endpoint (`GET/DELETE /me/sessions`) é do agente I. Enquanto ele não
 * existir a API responde 404 e a aba mostra o estado "ainda não disponível" —
 * o mesmo tratamento que damos ao R2/LiveKit sem credencial: a tela existe, o
 * recurso é que ainda não.
 */
export default function SessoesTab() {
  const t = useT();
  const [sessoes, setSessoes] = useState<SessionInfo[] | null>(null);
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
    const outras = (sessoes ?? []).filter((s) => !s.current);
    if (outras.length === 0) return;
    const ok = await ui.confirm({
      title: t("sessoes.encerrarTudo"),
      message: t("sessoes.intro"),
      confirmLabel: t("sessoes.encerrar"),
      danger: true,
    });
    if (!ok) return;
    for (const sessao of outras) await encerrar(sessao.id);
  }

  if (indisponivel) {
    return <EmBreve>{t("sessoes.indisponivel")}</EmBreve>;
  }

  const outras = (sessoes ?? []).filter((s) => !s.current);

  return (
    <>
      <p className="mb-3 text-sm text-txt-muted">{t("sessoes.intro")}</p>

      {carregando && <p className="text-sm text-txt-muted">Carregando…</p>}

      {!carregando &&
        (sessoes ?? []).map((sessao) => (
          <div
            key={sessao.id}
            className="flex items-center gap-3 border-b border-[#3f4147] py-3 last:border-b-0"
          >
            {ehCelular(sessao.userAgent) ? (
              <Smartphone size={20} className="shrink-0 text-txt-muted" aria-hidden="true" />
            ) : (
              <Laptop size={20} className="shrink-0 text-txt-muted" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-txt-primary">
                {resumoDoAgente(sessao.userAgent)}
                {sessao.current && (
                  <span className="ml-2 rounded-[3px] bg-green px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {t("sessoes.atual")}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-txt-muted">
                {t("sessoes.desde")} {dataCurta(sessao.createdAt)} · {t("sessoes.expira")}{" "}
                {dataCurta(sessao.expiresAt)}
              </p>
            </div>
            {!sessao.current && (
              <button
                type="button"
                onClick={() => void encerrar(sessao.id)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] px-2 text-sm font-medium text-red transition hover:bg-red hover:text-white"
              >
                <LogOut size={16} aria-hidden="true" />
                {t("sessoes.encerrar")}
              </button>
            )}
          </div>
        ))}

      {!carregando && outras.length === 0 && (
        <p className="py-3 text-sm text-txt-muted">{t("sessoes.vazio")}</p>
      )}

      {outras.length > 0 && (
        <button
          type="button"
          onClick={() => void encerrarTodas()}
          className="mt-4 h-9 rounded-[3px] bg-red px-3 text-sm font-medium text-white hover:bg-red-hover"
        >
          {t("sessoes.encerrarTudo")}
        </button>
      )}
    </>
  );
}

/** O suficiente do user-agent para o usuário reconhecer o aparelho. */
function resumoDoAgente(userAgent?: string): string {
  if (!userAgent) return "Dispositivo desconhecido";
  const so =
    /Windows/i.test(userAgent) ? "Windows"
    : /Android/i.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/i.test(userAgent) ? "iOS"
    : /Mac OS/i.test(userAgent) ? "macOS"
    : /Linux/i.test(userAgent) ? "Linux"
    : "Desconhecido";
  const navegador =
    /Edg\//i.test(userAgent) ? "Edge"
    : /OPR\//i.test(userAgent) ? "Opera"
    : /Chrome\//i.test(userAgent) ? "Chrome"
    : /Firefox\//i.test(userAgent) ? "Firefox"
    : /Safari\//i.test(userAgent) ? "Safari"
    : "App";
  return `${navegador} · ${so}`;
}

function ehCelular(userAgent?: string): boolean {
  return /Android|iPhone|iPad|Mobile/i.test(userAgent ?? "");
}

function dataCurta(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString();
}
