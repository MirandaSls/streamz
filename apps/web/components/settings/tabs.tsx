"use client";

import {
  Accessibility,
  Bell,
  Keyboard,
  Languages,
  Laptop,
  Paintbrush,
  ShieldCheck,
  User,
  UserCircle,
  Video,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import AcessibilidadeTab from "@/components/settings/AcessibilidadeTab";
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

export type SettingsGroup = "usuario" | "app";

export interface SettingsTab {
  id: string;
  group: SettingsGroup;
  label: ChaveDeTexto;
  icon: ReactNode;
  Component: ComponentType;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: "conta", group: "usuario", label: "aba.conta", icon: <User size={18} />, Component: ContaTab },
  { id: "perfil", group: "usuario", label: "aba.perfil", icon: <UserCircle size={18} />, Component: PerfilTab },
  {
    id: "privacidade",
    group: "usuario",
    label: "aba.privacidade",
    icon: <ShieldCheck size={18} />,
    Component: SegurancaTab,
  },
  { id: "dispositivos", group: "usuario", label: "aba.sessoes", icon: <Laptop size={18} />, Component: SessoesTab },

  { id: "aparencia", group: "app", label: "aba.aparencia", icon: <Paintbrush size={18} />, Component: AparenciaTab },
  {
    id: "acessibilidade",
    group: "app",
    label: "aba.acessibilidade",
    icon: <Accessibility size={18} />,
    Component: AcessibilidadeTab,
  },
  { id: "voz", group: "app", label: "aba.voz", icon: <Video size={18} />, Component: VozTab },
  {
    id: "notificacoes",
    group: "app",
    label: "aba.notificacoes",
    icon: <Bell size={18} />,
    Component: NotificacoesTab,
  },
  { id: "teclado", group: "app", label: "aba.teclado", icon: <Keyboard size={18} />, Component: TecladoTab },
  { id: "idioma", group: "app", label: "aba.idioma", icon: <Languages size={18} />, Component: IdiomaTab },
];

export const ABA_PADRAO = "conta";

/** A aba pedida, ou a padrão quando o id não existe (link velho ou digitado). */
export function abaOuPadrao(id: string | null | undefined): SettingsTab {
  return SETTINGS_TABS.find((t) => t.id === id) ?? SETTINGS_TABS[0];
}
