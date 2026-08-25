"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SETTINGS_TABS, abaOuPadrao, type SettingsGroup } from "@/components/settings/tabs";
import { escreverAbaNaUrl, limparAbaDaUrl } from "@/hooks/useSettingsRoute";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

/**
 * Shell de configurações — tela cheia com menu à esquerda, como no Discord.
 *
 * Não usa `Dialog` de propósito: aquilo é uma caixa centrada com rodapé de
 * botões, e isto ocupa a janela inteira e não tem "salvar" (toda preferência
 * vale no instante em que muda). O que o `Dialog` dá e aqui é reimplementado
 * de forma explícita é o essencial — `role="dialog"`, Esc fecha e o foco
 * começa dentro.
 *
 * A aba viaja na URL (`?settings=aparencia`) para que um link leve direto a
 * ela; o histórico é substituído, não empilhado, senão cada clique no menu
 * viraria um passo do botão "voltar".
 */

const VERSAO = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "0.0.1";

const GRUPOS: { id: SettingsGroup; label: "config.grupoUsuario" | "config.grupoApp" }[] = [
  { id: "usuario", label: "config.grupoUsuario" },
  { id: "app", label: "config.grupoApp" },
];

export default function SettingsShell({ tab }: { tab?: string }) {
  const t = useT();
  const router = useRouter();
  const closeModal = useUI((s) => s.closeModal);
  const logout = useAuth((s) => s.logout);
  const painelRef = useRef<HTMLDivElement>(null);

  const [abaId, setAbaId] = useState(() => abaOuPadrao(tab).id);
  const aba = abaOuPadrao(abaId);
  const Conteudo = aba.Component;

  // a URL acompanha a aba enquanto a tela está aberta, e é limpa ao fechar
  useEffect(() => {
    escreverAbaNaUrl(abaId);
    return () => limparAbaDaUrl();
  }, [abaId]);

  useEffect(() => {
    painelRef.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    // o listener global de atalhos também vê o Esc; parar aqui evita que ele
    // marque o canal como lido "de brinde" ao fechar as configurações
    event.stopPropagation();
    closeModal();
  }

  return (
    <div
      ref={painelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("config.titulo")}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex bg-chat outline-none"
    >
      <nav aria-label={t("config.titulo")} className="flex w-[218px] shrink-0 flex-col bg-panel">
        <div className="flex-1 overflow-y-auto px-2 py-14">
          {GRUPOS.map((grupo) => (
            <div key={grupo.id} className="mb-4">
              <h2 className="mb-1 px-2.5 text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                {t(grupo.label)}
              </h2>
              {SETTINGS_TABS.filter((item) => item.group === grupo.id).map((item) => {
                const ativo = item.id === aba.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={ativo ? "page" : undefined}
                    onClick={() => setAbaId(item.id)}
                    className={`mb-0.5 flex h-8 w-full items-center gap-2 rounded-[4px] px-2.5 text-left text-sm font-medium transition ${
                      ativo
                        ? "bg-sel text-txt-primary"
                        : "text-txt-faint hover:bg-hov hover:text-txt-normal"
                    }`}
                  >
                    <span aria-hidden="true" className="shrink-0">
                      {item.icon}
                    </span>
                    <span className="truncate">{t(item.label)}</span>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="my-2 h-px bg-[#3f4147]" />
          <button
            type="button"
            onClick={() => {
              closeModal();
              logout();
              router.replace("/login");
            }}
            className="flex h-8 w-full items-center gap-2 rounded-[4px] px-2.5 text-left text-sm font-medium text-txt-faint transition hover:bg-red hover:text-white"
          >
            <LogOut size={18} aria-hidden="true" className="shrink-0" />
            {t("config.sair")}
          </button>

          <p className="px-2.5 py-3 text-[11px] text-txt-faint">
            {t("config.versao")} {VERSAO}
          </p>
        </div>
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[740px] gap-6 px-10 py-14">
          <div className="min-w-0 flex-1">
            <h1 className="mb-5 text-xl font-bold text-txt-primary">{t(aba.label)}</h1>
            <Conteudo />
          </div>

          <div className="sticky top-0 shrink-0">
            <button
              type="button"
              onClick={closeModal}
              aria-label={t("config.fechar")}
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-txt-muted text-txt-muted transition hover:bg-hov hover:text-txt-primary"
            >
              <X size={18} />
            </button>
            <span className="mt-1 block text-center text-[11px] font-bold text-txt-muted">ESC</span>
          </div>
        </div>
      </div>
    </div>
  );
}
