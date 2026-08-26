"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Permission } from "@newdisc/shared";
import ServerSettingsOverview from "@/components/modals/ServerSettingsOverview";
import ServerSettingsRoles from "@/components/modals/ServerSettingsRoles";
import ServerSettingsMembers from "@/components/modals/ServerSettingsMembers";
import ServerSettingsBans from "@/components/modals/ServerSettingsBans";
import InvitesPanel from "@/components/modals/InvitesPanel";
// ── h-moderacao: as abas de moderação, montadas neste mesmo casco ──
import AuditLogTab from "@/components/settings/server/AuditLogTab";
import OnboardingTab from "@/components/settings/server/OnboardingTab";
import ReportsTab from "@/components/settings/server/ReportsTab";
import type { ServerSettingsTab } from "@/components/settings/server/tabs";
import { useGuilds, useIsOwner } from "@/stores/guilds";
import { useAuth } from "@/stores/auth";
import { useCan } from "@/stores/permissions";
import { useUI } from "@/stores/ui";

/** Uma entrada do menu lateral. `owner` limita ao dono do servidor. */
interface Aba {
  id: ServerSettingsTab;
  label: string;
  permission?: number;
  owner?: boolean;
  danger?: boolean;
  render: () => ReactNode;
}

/**
 * "Configurações do servidor" — o modal de página inteira do Discord: menu à
 * esquerda, painel à direita, X no canto.
 *
 * Não usa `Dialog` de propósito: `Dialog` é a caixa centrada de 380–480px do
 * app, e esta tela ocupa a janela toda. O que ela repete de lá é o contrato de
 * acessibilidade — `role="dialog"`, `aria-modal`, Esc fecha, foco preso.
 *
 * Cada aba pede a permissão que a API exigiria, e a lista esconde as que o
 * usuário não tem: quem só pode banir vê "Banimentos" e nada mais.
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
  const removeGuild = useGuilds((s) => s.remove);
  const me = useAuth((s) => s.user);
  const isOwner = useIsOwner(me?.id);
  const podeGerenciar = useCan(Permission.MANAGE_GUILD);
  const podeCargos = useCan(Permission.MANAGE_ROLES);
  const podeBanir = useCan(Permission.BAN_MEMBERS);
  const podeModerarMensagens = useCan(Permission.MANAGE_MESSAGES);

  const abas: Aba[] = [
    {
      id: "overview",
      label: "Visão geral",
      permission: Permission.MANAGE_GUILD,
      render: () => <ServerSettingsOverview guildId={guildId} />,
    },
    {
      id: "roles",
      label: "Cargos",
      permission: Permission.MANAGE_ROLES,
      render: () => <ServerSettingsRoles guildId={guildId} />,
    },
    {
      id: "members",
      label: "Membros",
      render: () => <ServerSettingsMembers guildId={guildId} />,
    },
    {
      id: "invites",
      label: "Convites",
      permission: Permission.MANAGE_GUILD,
      render: () => <InvitesPanel guildId={guildId} />,
    },
    {
      id: "bans",
      label: "Banimentos",
      permission: Permission.BAN_MEMBERS,
      render: () => <ServerSettingsBans guildId={guildId} />,
    },
    // ── h-moderacao ──
    {
      id: "onboarding",
      label: "Entrada e regras",
      permission: Permission.MANAGE_GUILD,
      render: () => <OnboardingTab guildId={guildId} />,
    },
    {
      id: "audit",
      label: "Registro de auditoria",
      permission: Permission.MANAGE_GUILD,
      render: () => <AuditLogTab guildId={guildId} />,
    },
    {
      id: "reports",
      label: "Denúncias",
      permission: Permission.MANAGE_MESSAGES,
      render: () => <ReportsTab guildId={guildId} />,
    },
  ];

  const permitida = (a: Aba) => {
    if (a.owner) return isOwner;
    if (!a.permission) return true;
    if (a.permission === Permission.MANAGE_GUILD) return podeGerenciar;
    if (a.permission === Permission.MANAGE_ROLES) return podeCargos;
    if (a.permission === Permission.BAN_MEMBERS) return podeBanir;
    if (a.permission === Permission.MANAGE_MESSAGES) return podeModerarMensagens;
    return false;
  };
  const visiveis = abas.filter(permitida);
  // a aba pedida pelo call site só vale se o usuário puder abri-la
  const [ativa, setAtiva] = useState<ServerSettingsTab>(
    (inicial && visiveis.some((a) => a.id === inicial) ? inicial : visiveis[0]?.id) ?? "members",
  );
  const aba = visiveis.find((a) => a.id === ativa) ?? visiveis[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModal]);

  if (!guild) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Configurações de ${guild.name}`}
      className="fixed inset-0 z-50 flex bg-chat"
    >
      <nav
        aria-label="Seções das configurações"
        className="flex w-[218px] shrink-0 flex-col items-end overflow-y-auto bg-panel py-[60px] pr-2"
      >
        <div className="w-[192px]">
          <h2 className="mb-2 truncate px-2.5 text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
            {guild.name}
          </h2>
          {visiveis.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAtiva(a.id)}
              aria-current={a.id === ativa ? "page" : undefined}
              className={`mb-0.5 flex h-8 w-full items-center rounded-[4px] px-2.5 text-left text-base transition ${
                a.id === ativa
                  ? "bg-sel text-txt-primary"
                  : "text-txt-secondary hover:bg-hov hover:text-txt-normal"
              }`}
            >
              {a.label}
            </button>
          ))}
          {isOwner && (
            <>
              <div aria-hidden="true" className="my-2 h-px bg-[#3f4147]" />
              <button
                type="button"
                onClick={() => {
                  closeModal();
                  void removeGuild(guildId);
                }}
                className="flex h-8 w-full items-center rounded-[4px] px-2.5 text-left text-base text-red transition hover:bg-red hover:text-white"
              >
                Apagar servidor
              </button>
            </>
          )}
        </div>
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[740px] px-10 py-[60px]">
          {aba ? (
            <>
              <h1 className="mb-5 text-xl font-bold text-txt-primary">{aba.label}</h1>
              {aba.render()}
            </>
          ) : (
            <p className="text-sm text-txt-muted">
              Você não tem permissão para gerenciar este servidor.
            </p>
          )}
        </div>
      </div>

      <div className="w-[60px] shrink-0 pt-[60px]">
        <button
          type="button"
          onClick={closeModal}
          aria-label="Fechar configurações"
          data-autofocus
          className="grid h-9 w-9 place-items-center rounded-full border-2 border-txt-muted text-txt-muted transition hover:bg-hov hover:text-txt-primary"
        >
          <X size={18} />
        </button>
        <span className="mt-1 block w-9 text-center text-[11px] font-semibold text-txt-muted">
          ESC
        </span>
      </div>
    </div>
  );
}
