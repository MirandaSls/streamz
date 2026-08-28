"use client";

import { AtSign, Bell, BellOff, BellRing, Clock } from "lucide-react";
import {
  MUTE_PRESETS_MINUTES,
  isMuted,
  type NotificationLevel,
  type NotificationSetting,
} from "@streamz/shared";
import type { ChaveDeTexto } from "@/lib/i18n";
import { useNotifications } from "@/stores/notifications";
import { type MenuItem } from "@/stores/ui";

/**
 * Os dois submenus de notificação de um canal, categoria ou servidor.
 *
 * São **dois**, não um: o Discord separa "Silenciar X ›" (por quanto tempo) de
 * "Configurações de Notificação ›" (qual nível), e os dois convivem no mesmo
 * menu-pai. Antes o app achatava tudo num menu plano que *substituía* o menu de
 * origem — o que não tem volta e perde o contexto de onde a pessoa estava.
 */

export type EscopoDeNotificacao =
  | { tipo: "canal"; channelId: string }
  | { tipo: "servidor"; guildId: string };

/** Rótulo de cada duração do "silenciar por…". */
const CHAVE_DA_DURACAO: Record<number, ChaveDeTexto> = {
  15: "notif.por15",
  60: "notif.por60",
  480: "notif.por480",
  1440: "notif.por1440",
};

const NIVEIS: { level: NotificationLevel; chave: ChaveDeTexto; icone: JSX.Element }[] = [
  { level: "ALL", chave: "notif.tudo", icone: <BellRing size={18} /> },
  { level: "MENTIONS", chave: "notif.mencoes", icone: <AtSign size={18} /> },
  { level: "NONE", chave: "notif.nada", icone: <BellOff size={18} /> },
];

function acoes(escopo: EscopoDeNotificacao) {
  const store = useNotifications.getState();
  const canal = escopo.tipo === "canal";
  return {
    definirNivel: (level: NotificationLevel) =>
      canal
        ? void store.setChannelLevel(escopo.channelId, level)
        : void store.setGuildLevel(escopo.guildId, level),
    silenciar: (minutos: number | null) =>
      canal
        ? void store.muteChannel(escopo.channelId, minutos)
        : void store.muteGuild(escopo.guildId, minutos),
    dessilenciar: () =>
      canal ? void store.unmuteChannel(escopo.channelId) : void store.unmuteGuild(escopo.guildId),
  };
}

/** "Silenciar X ›": durações e o atalho de dessilenciar quando já está mudo. */
export function submenuSilenciar(
  rotulo: string,
  escopo: EscopoDeNotificacao,
  setting: NotificationSetting | undefined,
  t: (chave: ChaveDeTexto) => string,
): MenuItem {
  const { silenciar, dessilenciar } = acoes(escopo);
  const silenciado = isMuted(setting);

  if (silenciado) {
    return {
      label: t("notif.dessilenciar"),
      icon: <Bell size={18} />,
      onSelect: dessilenciar,
    };
  }

  const itens: MenuItem[] = MUTE_PRESETS_MINUTES.map((minutos) => ({
    label: t(CHAVE_DA_DURACAO[minutos]),
    icon: <Clock size={18} />,
    onSelect: () => silenciar(minutos),
  }));
  itens.push({
    label: t("notif.ateReativar"),
    icon: <BellOff size={18} />,
    onSelect: () => silenciar(null),
  });

  return { label: rotulo, icon: <BellOff size={18} />, submenu: itens };
}

/** "Configurações de Notificação ›": os três níveis como rádio. */
export function submenuNotificacoes(
  escopo: EscopoDeNotificacao,
  setting: NotificationSetting | undefined,
  t: (chave: ChaveDeTexto) => string,
): MenuItem {
  const { definirNivel } = acoes(escopo);
  const nivelAtual = setting?.level ?? "ALL";
  return {
    label: t("aba.notificacoes"),
    icon: <Bell size={18} />,
    // rádio de verdade: o estado é do item, não um ✓ ocupando o lugar do ícone
    submenu: NIVEIS.map(({ level, chave, icone }) => ({
      label: t(chave),
      icon: icone,
      control: "radio" as const,
      checked: level === nivelAtual,
      onSelect: () => definirNivel(level),
    })),
  };
}
