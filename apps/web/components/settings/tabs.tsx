"use client";

import {
  Accessibility,
  Bell,
  Gauge,
  Keyboard,
  Languages,
  Laptop,
  MessagesSquare,
  Paintbrush,
  PhoneCall,
  Server,
  ShieldCheck,
  User,
  UserCircle,
  Users,
  Video,
} from "@/components/ui/icones";
import type { ComponentType, ReactNode } from "react";
import AcessibilidadeTab from "@/components/settings/AcessibilidadeTab";
import AdminChamadasTab from "@/components/settings/admin/AdminChamadasTab";
import AdminMensagensTab from "@/components/settings/admin/AdminMensagensTab";
import AdminServidoresTab from "@/components/settings/admin/AdminServidoresTab";
import AdminUsuariosTab from "@/components/settings/admin/AdminUsuariosTab";
import AdminVisaoGeralTab from "@/components/settings/admin/AdminVisaoGeralTab";
import AparenciaTab from "@/components/settings/AparenciaTab";
import ContaTab from "@/components/settings/ContaTab";
import IdiomaTab from "@/components/settings/IdiomaTab";
import NotificacoesTab from "@/components/settings/NotificacoesTab";
import PerfilTab from "@/components/settings/PerfilTab";
import SegurancaTab from "@/components/settings/SegurancaTab";
import SessoesTab from "@/components/settings/SessoesTab";
import TecladoTab from "@/components/settings/TecladoTab";
import VozTab from "@/components/settings/VozTab";
import type { ChaveDeTexto } from "@/lib/i18n";

/**
 * O índice das configurações: id (que é o valor de `?settings=`), grupo, ícone
 * e componente.
 *
 * Registro único porque três coisas precisam concordar — o menu lateral, o
 * deep link e o que é renderizado à direita. Aba nova é uma linha aqui.
 */

/**
 * `admin` é o grupo do painel da instância (`j-painel-admin`). Ele existe no
 * registro para todo mundo — quem desenha é que decide se aparece: a
 * `SettingsModal` só monta este grupo quando `GET /admin/me` disse que sim, e
 * a API recusa as rotas de qualquer jeito. Esconder aqui não seria segurança,
 * e listar aqui não é vazamento: são só nomes de aba.
 */
export type SettingsGroup = "usuario" | "app" | "admin";

export interface SettingsTab {
  id: string;
  group: SettingsGroup;
  label: ChaveDeTexto;
  icon: ReactNode;
  Component: ComponentType;
  /**
   * As seções da página, para o menu de segundo nível (ver `TelaCheia`).
   *
   * Cada `id` precisa casar com o `id` de um `<Section>` do componente — é o
   * contrato entre o menu e a página. Aba sem seções continua funcionando: ela
   * só não abre o segundo nível.
   */
  secoes?: { id: string; label: ChaveDeTexto }[];
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  {
    id: "conta",
    group: "usuario",
    label: "aba.conta",
    icon: <User size={20} />,
    Component: ContaTab,
    secoes: [
      { id: "minha-conta", label: "conta.secMinhaConta" },
      { id: "senha", label: "conta.secSenha" },
      { id: "encerrar", label: "conta.secEncerrar" },
    ],
  },
  { id: "perfil", group: "usuario", label: "aba.perfil", icon: <UserCircle size={20} />, Component: PerfilTab },
  {
    id: "privacidade",
    group: "usuario",
    label: "aba.privacidade",
    icon: <ShieldCheck size={20} />,
    Component: SegurancaTab,
  },
  { id: "dispositivos", group: "usuario", label: "aba.sessoes", icon: <Laptop size={20} />, Component: SessoesTab },

  {
    id: "aparencia",
    group: "app",
    label: "aba.aparencia",
    icon: <Paintbrush size={20} />,
    Component: AparenciaTab,
    secoes: [
      { id: "previa", label: "aparencia.previa" },
      { id: "tema", label: "aparencia.tema" },
      { id: "mensagens", label: "aparencia.mensagens" },
    ],
  },
  {
    id: "acessibilidade",
    group: "app",
    label: "aba.acessibilidade",
    icon: <Accessibility size={20} />,
    Component: AcessibilidadeTab,
    secoes: [
      { id: "legibilidade", label: "acess.secLegibilidade" },
      { id: "cor", label: "acess.secCor" },
      { id: "movimento", label: "acess.secMovimento" },
      { id: "chat", label: "acess.secChat" },
    ],
  },
  {
    id: "voz",
    group: "app",
    label: "aba.voz",
    icon: <Video size={20} />,
    Component: VozTab,
    secoes: [
      { id: "dispositivos", label: "voz.dispositivos" },
      { id: "modo", label: "voz.modo" },
      { id: "processamento", label: "voz.processamento" },
      { id: "testar", label: "voz.testarMic" },
      { id: "camera", label: "voz.previaCamera" },
    ],
  },
  {
    id: "notificacoes",
    group: "app",
    label: "aba.notificacoes",
    icon: <Bell size={20} />,
    Component: NotificacoesTab,
    secoes: [
      { id: "dispositivo", label: "notif.esteDispositivo" },
      { id: "padrao", label: "notif.padrao" },
      { id: "sons", label: "notif.sons" },
    ],
  },
  { id: "teclado", group: "app", label: "aba.teclado", icon: <Keyboard size={20} />, Component: TecladoTab },
  { id: "idioma", group: "app", label: "aba.idioma", icon: <Languages size={20} />, Component: IdiomaTab },

  // ── j-painel-admin ── só aparecem para o administrador da instância
  {
    id: "admin-visao",
    group: "admin",
    label: "aba.adminVisao",
    icon: <Gauge size={20} />,
    Component: AdminVisaoGeralTab,
  },
  {
    id: "admin-usuarios",
    group: "admin",
    label: "aba.adminUsuarios",
    icon: <Users size={20} />,
    Component: AdminUsuariosTab,
  },
  {
    id: "admin-chamadas",
    group: "admin",
    label: "aba.adminChamadas",
    icon: <PhoneCall size={20} />,
    Component: AdminChamadasTab,
  },
  {
    id: "admin-mensagens",
    group: "admin",
    label: "aba.adminMensagens",
    icon: <MessagesSquare size={20} />,
    Component: AdminMensagensTab,
  },
  {
    id: "admin-servidores",
    group: "admin",
    label: "aba.adminServidores",
    icon: <Server size={20} />,
    Component: AdminServidoresTab,
  },
];

/** true para aba que só o administrador da instância enxerga. */
export function ehAbaDeAdmin(tab: SettingsTab): boolean {
  return tab.group === "admin";
}

export const ABA_PADRAO = "conta";

/**
 * A aba pedida, ou a padrão quando o id não existe (link velho ou digitado).
 *
 * `admin` diz se as abas de administração contam: sem ele, um `?settings=`
 * apontando para uma delas cai na aba padrão em vez de abrir uma tela que só
 * responderia 403.
 */
export function abaOuPadrao(id: string | null | undefined, admin = false): SettingsTab {
  const aba = SETTINGS_TABS.find((t) => t.id === id);
  if (!aba || (ehAbaDeAdmin(aba) && !admin)) return SETTINGS_TABS[0];
  return aba;
}
