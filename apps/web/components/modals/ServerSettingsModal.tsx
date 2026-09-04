"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Permission } from "@streamz/shared";
import { useControleDeAlteracoes } from "@/components/ui/alteracoes";
import JanelaDeConfiguracoes, { ItemPerigo } from "@/components/ui/JanelaDeConfiguracoes";
import PerfilDoServidorTab from "@/components/settings/server/PerfilDoServidorTab";
import EngajamentoTab from "@/components/settings/server/EngajamentoTab";
import EmojiTab from "@/components/settings/server/EmojiTab";
import MembrosTab from "@/components/settings/server/MembrosTab";
import CargosTab from "@/components/settings/server/CargosTab";
import ConvitesTab from "@/components/settings/server/ConvitesTab";
import AcessoTab from "@/components/settings/server/AcessoTab";
import AuditLogTab from "@/components/settings/server/AuditLogTab";
import BanimentosTab from "@/components/settings/server/BanimentosTab";
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
 * Os grupos do menu lateral, na ordem e com os rótulos do Discord (print
 * `docs/Reference/Captura de tela 2026-09-04 100541.png`).
 *
 * O primeiro grupo não tem cabeçalho no print — vem logo abaixo do nome do
 * servidor em caixa-alta —, e por isso `label` é opcional na
 * `JanelaDeConfiguracoes`.
 *
 * Do menu do print faltam aqui, de propósito, os itens sem recurso por trás:
 * "Tag do servidor", "Vantagens de Impulso", "Figurinhas", "Painel de efeitos
 * sonoros", "Integrações", "Diretório de Apps", "Configurações de Segurança",
 * "Visão geral da comunidade", "Onboarding", "Análises do servidor" e "Modelo
 * do servidor". Sobra um item que o Discord **não** tem, "Denúncias": a fila
 * existe no produto, e escondê-la para copiar o menu tiraria acesso a uma tela
 * que funciona.
 */
const GRUPOS: { id: string; label?: string; abas: ServerSettingsTab[] }[] = [
  { id: "servidor", abas: ["overview", "engajamento"] },
  { id: "expressoes", label: "Expressões", abas: ["emoji"] },
  { id: "pessoas", label: "Pessoas", abas: ["members", "roles", "invites", "acesso"] },
  { id: "moderacao", label: "Moderação", abas: ["audit", "bans", "reports"] },
];

/**
 * "Configurações do servidor" — desenhada pela `JanelaDeConfiguracoes` de
 * `components/ui`, a mesma moldura das de usuário, canal e grupo.
 *
 * Entra nela em `fecharComoEsc`: nas configurações **do servidor** o Discord não
 * tem a barra de 48 com o X simples; o título é da página e o fechar é o X
 * redondo com "ESC" ao lado da coluna de conteúdo. As de usuário continuam com
 * a barra, que é como os prints de 2026-09-01 as mostram.
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
  const podeEmojis = useCan(Permission.MANAGE_EMOJIS);
  const alteracoes = useControleDeAlteracoes();

  const abas: Aba[] = [
    {
      id: "overview",
      label: "Perfil do servidor",
      permission: Permission.MANAGE_GUILD,
      render: () => <PerfilDoServidorTab guildId={guildId} />,
    },
    {
      id: "engajamento",
      label: "Engajamento",
      permission: Permission.MANAGE_GUILD,
      render: () => <EngajamentoTab guildId={guildId} />,
    },
    {
      id: "emoji",
      label: "Emoji",
      permission: Permission.MANAGE_EMOJIS,
      render: () => <EmojiTab guildId={guildId} />,
    },
    {
      id: "members",
      label: "Membros",
      render: () => <MembrosTab guildId={guildId} />,
    },
    {
      id: "roles",
      label: "Cargos",
      permission: Permission.MANAGE_ROLES,
      render: () => <CargosTab guildId={guildId} />,
    },
    {
      id: "invites",
      label: "Convites",
      permission: Permission.MANAGE_GUILD,
      render: () => <ConvitesTab guildId={guildId} />,
    },
    {
      id: "acesso",
      label: "Acesso",
      permission: Permission.MANAGE_GUILD,
      render: () => <AcessoTab guildId={guildId} />,
    },
    {
      id: "audit",
      label: "Registro de auditoria",
      permission: Permission.MANAGE_GUILD,
      render: () => <AuditLogTab guildId={guildId} />,
    },
    {
      id: "bans",
      label: "Banimentos",
      permission: Permission.BAN_MEMBERS,
      render: () => <BanimentosTab guildId={guildId} />,
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
    if (a.permission === Permission.MANAGE_EMOJIS) return podeEmojis;
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
    <JanelaDeConfiguracoes
      titulo={`Configurações de ${guild.name}`}
      cabecalho={guild.name}
      onCabecalho={abrirMenuDoServidor}
      grupos={grupos}
      abaId={ativa}
      onAba={(id) => setAtiva(id as ServerSettingsTab)}
      tituloAba={aba?.label}
      fecharComoEsc
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
    </JanelaDeConfiguracoes>
  );
}
