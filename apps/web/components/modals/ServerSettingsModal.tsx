"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Permission, hasPermission } from "@streamz/shared";
import { useControleDeAlteracoes } from "@/components/ui/alteracoes";
import JanelaDeConfiguracoes, { ItemPerigo } from "@/components/ui/JanelaDeConfiguracoes";
import PerfilDoServidorTab from "@/components/settings/server/PerfilDoServidorTab";
import EngajamentoTab from "@/components/settings/server/EngajamentoTab";
import EmojiTab from "@/components/settings/server/EmojiTab";
import SoundboardTab from "@/components/settings/server/SoundboardTab";
import MembrosTab from "@/components/settings/server/MembrosTab";
import CargosTab from "@/components/settings/server/CargosTab";
import ConvitesTab from "@/components/settings/server/ConvitesTab";
import AcessoTab from "@/components/settings/server/AcessoTab";
import AplicativosTab from "@/components/settings/server/AplicativosTab";
import AuditLogTab from "@/components/settings/server/AuditLogTab";
import BanimentosTab from "@/components/settings/server/BanimentosTab";
import ReportsTab from "@/components/settings/server/ReportsTab";
import type { ServerSettingsTab } from "@/components/settings/server/tabs";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { useGuilds, useIsOwner } from "@/stores/guilds";
import { useAuth } from "@/stores/auth";
import { useMyPermissions } from "@/stores/permissions";
import { ui, useUI, type MenuItem } from "@/stores/ui";

/**
 * Metadados de uma aba — sem `render`, que arrasta componente React consigo.
 *
 * Exportado (junto com `ABAS_DO_SERVIDOR` e `abaDoServidorVisivel` abaixo)
 * para o menu do ícone do servidor (`GuildRail.tsx`, "Config. do servidor >"
 * do print p5) montar o mesmo submenu sem instanciar este modal — é o mínimo
 * que ele precisa: id, rótulo e a permissão que decide se a aba aparece.
 * `owner` limita ao dono do servidor.
 */
export interface AbaDoServidor {
  id: ServerSettingsTab;
  label: string;
  permission?: number;
  owner?: boolean;
}

/** Uma entrada do menu lateral, com o que ela desenha. */
interface Aba extends AbaDoServidor {
  render: () => ReactNode;
}

/**
 * A lista de abas do menu lateral, na ordem e com os rótulos do Discord —
 * mesma origem do `GRUPOS` abaixo. Vive fora do componente (sem `render`)
 * para poder ser reaproveitada por quem só precisa saber "quais abas existem
 * e que permissão cada uma pede", sem montar a tela inteira.
 */
export const ABAS_DO_SERVIDOR: AbaDoServidor[] = [
  { id: "overview", label: "Perfil do servidor", permission: Permission.MANAGE_GUILD },
  { id: "engajamento", label: "Engajamento", permission: Permission.MANAGE_GUILD },
  { id: "emoji", label: "Emoji", permission: Permission.MANAGE_EMOJIS },
  { id: "soundboard", label: "Painel de efeitos sonoros", permission: Permission.MANAGE_EMOJIS },
  { id: "members", label: "Membros" },
  { id: "roles", label: "Cargos", permission: Permission.MANAGE_ROLES },
  { id: "invites", label: "Convites", permission: Permission.MANAGE_GUILD },
  { id: "acesso", label: "Acesso", permission: Permission.MANAGE_GUILD },
  { id: "aplicativos", label: "Aplicativos", permission: Permission.MANAGE_GUILD },
  { id: "audit", label: "Registro de auditoria", permission: Permission.MANAGE_GUILD },
  { id: "bans", label: "Banimentos", permission: Permission.BAN_MEMBERS },
  { id: "reports", label: "Denúncias", permission: Permission.MANAGE_MESSAGES },
];

/**
 * `true` quando `bits` (o bitfield de `computePermissions`, já `ALL_PERMISSIONS`
 * para o dono) permite ver esta aba — a mesma checagem que a API faria.
 * Exportada para quem monta uma lista de abas fora deste modal.
 */
export function abaDoServidorVisivel(aba: AbaDoServidor, bits: number, isOwner: boolean): boolean {
  if (aba.owner) return isOwner;
  if (!aba.permission) return true;
  return hasPermission(bits, aba.permission);
}

/** O que cada aba desenha, por id — a metade que `ABAS_DO_SERVIDOR` não leva. */
function renderizadores(guildId: string): Record<ServerSettingsTab, () => ReactNode> {
  return {
    overview: () => <PerfilDoServidorTab guildId={guildId} />,
    engajamento: () => <EngajamentoTab guildId={guildId} />,
    emoji: () => <EmojiTab guildId={guildId} />,
    soundboard: () => <SoundboardTab guildId={guildId} />,
    members: () => <MembrosTab guildId={guildId} />,
    roles: () => <CargosTab guildId={guildId} />,
    invites: () => <ConvitesTab guildId={guildId} />,
    acesso: () => <AcessoTab guildId={guildId} />,
    aplicativos: () => <AplicativosTab guildId={guildId} />,
    audit: () => <AuditLogTab guildId={guildId} />,
    bans: () => <BanimentosTab guildId={guildId} />,
    reports: () => <ReportsTab guildId={guildId} />,
  };
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
  { id: "expressoes", label: "Expressões", abas: ["emoji", "soundboard"] },
  { id: "pessoas", label: "Pessoas", abas: ["members", "roles", "invites", "acesso"] },
  /* ── j-bots ── "Aplicativos" ganhou grupo próprio, e não uma linha em
     "Pessoas": um bot instalado é uma integração do servidor, não gente que
     entrou nele, e o Discord também o tira dali (no menu dele são
     "Integrações" e "Diretório de Apps", acima de "Moderação").
     **Sem `label`**, como o grupo do topo: o cabeçalho em caixa-alta repetiria
     a palavra do único item embaixo dele — "APLICATIVOS / Aplicativos" —, e a
     divisória entre grupos (`i > 0`, não depende do rótulo) já separa. */
  { id: "aplicativos", abas: ["aplicativos"] },
  { id: "moderacao", label: "Moderação", abas: ["audit", "bans", "reports"] },
];

/**
 * "Configurações do servidor" — desenhada pela `JanelaDeConfiguracoes` de
 * `components/ui`, a mesma moldura das de usuário, canal e grupo.
 *
 * Entra nela em `variante="tela-cheia"`: as configurações **do servidor** do
 * Discord não são o modal de 1400 das de usuário, e sim a tela inteira do
 * `standardSidebarView` (prints `2026-09-04 100541`–`100821`) — menu à
 * esquerda sobre `--background-base-lowest`, sem véu, título escrito pela
 * página e o fechar como círculo com "ESC" ao lado da coluna de conteúdo.
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
  const bits = useMyPermissions();
  const alteracoes = useControleDeAlteracoes();

  const render = renderizadores(guildId);
  const abas: Aba[] = ABAS_DO_SERVIDOR.map((a) => ({ ...a, render: render[a.id] }));

  const permitida = (a: Aba) => abaDoServidorVisivel(a, bits, isOwner);
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
      variante="tela-cheia"
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
        // estado "sem permissão": nenhuma aba passou pelo filtro. O Discord nem
        // mostra a entrada "Configurações do servidor" nesse caso; aqui ela
        // pode chegar por um link velho, então a tela explica em vez de abrir
        // vazia
        <p role="status" className="text-text-md text-text-muted">
          Você não tem permissão para gerenciar este servidor.
        </p>
      )}
    </JanelaDeConfiguracoes>
  );
}
