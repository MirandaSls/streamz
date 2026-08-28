"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Permission } from "@streamz/shared";
import ServerSettingsOverview from "@/components/modals/ServerSettingsOverview";
import ServerSettingsRoles from "@/components/modals/ServerSettingsRoles";
import ServerSettingsMembers from "@/components/modals/ServerSettingsMembers";
import ServerSettingsBans from "@/components/modals/ServerSettingsBans";
import InvitesPanel from "@/components/modals/InvitesPanel";
import { useControleDeAlteracoes } from "@/components/ui/alteracoes";
import TelaCheia, { ItemPerigo } from "@/components/ui/TelaCheia";
// ── h-moderacao: as abas de moderação, montadas neste mesmo casco ──
import AuditLogTab from "@/components/settings/server/AuditLogTab";
import OnboardingTab from "@/components/settings/server/OnboardingTab";
import ReportsTab from "@/components/settings/server/ReportsTab";
import type { ServerSettingsTab } from "@/components/settings/server/tabs";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { useGuilds, useIsOwner } from "@/stores/guilds";
import { useAuth } from "@/stores/auth";
import { useCan } from "@/stores/permissions";
import { ui, useUI, type MenuItem } from "@/stores/ui";

/** Uma entrada do menu lateral. `owner` limita ao dono do servidor. */
interface Aba {
  id: ServerSettingsTab;
  label: string;
  permission?: number;
  owner?: boolean;
  render: () => ReactNode;
}

/**
 * Os cabeçalhos do menu lateral, na ordem do Discord.
 *
 * Uma lista plana de oito itens obriga a ler todos para achar "Banimentos".
 * Agrupada, a pergunta vira "isto é moderação ou é gente?" — que é a pergunta
 * que a pessoa já está se fazendo.
 */
const GRUPOS: { id: string; label: string; abas: ServerSettingsTab[] }[] = [
  { id: "espaco", label: "Espaço do servidor", abas: ["overview", "roles"] },
  { id: "envolvimento", label: "Envolvimento", abas: ["onboarding"] },
  { id: "moderacao", label: "Moderação", abas: ["audit", "reports", "bans"] },
  { id: "pessoas", label: "Pessoas", abas: ["members", "invites"] },
];

/**
 * "Configurações do servidor" — desenhada pela `TelaCheia` de `components/ui`,
 * a mesma moldura das configurações de usuário, canal e grupo.
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
  const leaveGuild = useGuilds((s) => s.leave);
  const me = useAuth((s) => s.user);
  const isOwner = useIsOwner(me?.id);
  const podeGerenciar = useCan(Permission.MANAGE_GUILD);
  const podeCargos = useCan(Permission.MANAGE_ROLES);
  const podeBanir = useCan(Permission.BAN_MEMBERS);
  const podeModerarMensagens = useCan(Permission.MANAGE_MESSAGES);
  const alteracoes = useControleDeAlteracoes();

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

  function abrirMenuDoServidor(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const items: MenuItem[] = [
      {
        label: "Convidar pessoas",
        onSelect: () => ui.openModal({ kind: "invite", guildId }),
      },
      {
        label: "Criar canal",
        onSelect: () => ui.openModal({ kind: "createChannel" }),
      },
      isOwner
        ? {
            label: "Apagar servidor",
            danger: true,
            // a tela **não** fecha antes: a confirmação empilha por cima e,
            // ao cancelar, as configurações continuam onde estavam
            onSelect: () => void removeGuild(guildId),
          }
        : {
            label: "Sair do servidor",
            danger: true,
            onSelect: () => void leaveGuild(guildId),
          },
    ];
    ui.openContextMenu(rect.left, rect.bottom + 4, items, MENU_WIDTH);
  }

  if (!guild) return null;

  const grupos = GRUPOS.map((g) => ({
    id: g.id,
    label: g.label,
    itens: g.abas
      .map((id) => visiveis.find((a) => a.id === id))
      .filter((a): a is Aba => Boolean(a))
      .map((a) => ({ id: a.id, label: a.label })),
  })).filter((g) => g.itens.length > 0);

  return (
    <TelaCheia
      titulo={`Configurações de ${guild.name}`}
      cabecalho={guild.name}
      onCabecalho={abrirMenuDoServidor}
      grupos={grupos}
      abaId={ativa}
      onAba={(id) => setAtiva(id as ServerSettingsTab)}
      tituloAba={aba?.label}
      rotuloFechar="Fechar configurações"
      controle={alteracoes}
      onClose={closeModal}
      rodapeMenu={
        isOwner ? (
          // a tela **não** fecha antes: a confirmação empilha por cima e, ao
          // cancelar, as configurações continuam onde estavam
          <ItemPerigo onClick={() => void removeGuild(guildId)}>Apagar servidor</ItemPerigo>
        ) : undefined
      }
    >
      {aba ? (
        aba.render()
      ) : (
        <p className="text-sm text-txt-muted">
          Você não tem permissão para gerenciar este servidor.
        </p>
      )}
    </TelaCheia>
  );
}
