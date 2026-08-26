"use client";

import { useState } from "react";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import AuditLogTab from "@/components/settings/server/AuditLogTab";
import BansTab from "@/components/settings/server/BansTab";
import OnboardingTab from "@/components/settings/server/OnboardingTab";
import ReportsTab from "@/components/settings/server/ReportsTab";
import { SERVER_SETTINGS_TABS, type ServerSettingsTab } from "@/components/settings/server/tabs";
import { useGuilds } from "@/stores/guilds";
import { useUI } from "@/stores/ui";

/**
 * Configurações do servidor.
 *
 * Este é o **casco provisório** das abas de moderação (`components/settings/
 * server/*`): a tela definitiva, com todas as seções, é do agente de cargos.
 * Cada aba é um componente independente e não sabe onde está montada — trocar
 * este casco pelo definitivo é mudar de moldura, não de conteúdo.
 */
export default function ServerSettingsModal({
  guildId,
  tab: inicial,
}: {
  guildId: string;
  tab?: ServerSettingsTab;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const [tab, setTab] = useState<ServerSettingsTab>(inicial ?? "onboarding");

  return (
    <Dialog
      title={guild?.name ?? "Servidor"}
      description="Configurações e moderação do servidor."
      onClose={closeModal}
      className="h-[85vh] w-[820px]"
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <div className="flex min-h-0 flex-1 gap-4">
        <nav aria-label="Seções" className="w-52 shrink-0">
          {SERVER_SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className={`mb-0.5 flex h-8 w-full items-center rounded-[4px] px-2.5 text-left text-sm font-medium transition ${
                tab === t.id
                  ? "bg-sel text-txt-primary"
                  : "text-txt-faint hover:bg-hov hover:text-txt-normal"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === "onboarding" && <OnboardingTab guildId={guildId} />}
          {tab === "audit" && <AuditLogTab guildId={guildId} />}
          {tab === "reports" && <ReportsTab guildId={guildId} />}
          {tab === "bans" && <BansTab guildId={guildId} />}
        </div>
      </div>
    </Dialog>
  );
}
