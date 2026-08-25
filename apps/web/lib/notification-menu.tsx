"use client";

import { AtSign, Bell, BellOff, BellRing, Check, Clock } from "lucide-react";
import {
  MUTE_PRESETS_MINUTES,
  isMuted,
  type NotificationLevel,
  type NotificationSetting,
} from "@newdisc/shared";
import type { ChaveDeTexto } from "@/lib/i18n";
import { useNotifications } from "@/stores/notifications";
import { ui, type MenuItem } from "@/stores/ui";

/**
 * Menu de notificação de um canal ou de um servidor — o que abre no sino do
 * cabeçalho e no menu do servidor.
 *
 * Mora fora dos componentes porque os três pontos de entrada (sino, menu do
 * servidor, botão direito no canal) precisam do *mesmo* menu: níveis, silenciar
 * por um tempo e dessilenciar. O `ContextMenu` do app não tem submenu, então a
 * lista é plana com um separador, na mesma ordem do Discord.
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

/** Itens do menu para um escopo, já ligados na store. */
export function itensDeNotificacao(
  escopo: EscopoDeNotificacao,
  setting: NotificationSetting | undefined,
  t: (chave: ChaveDeTexto) => string,
): MenuItem[] {
  const store = useNotifications.getState();
  const canal = escopo.tipo === "canal";
  const nivelAtual = setting?.level ?? "ALL";
  const silenciado = isMuted(setting);

  const definirNivel = (level: NotificationLevel) =>
    canal
      ? void store.setChannelLevel(escopo.channelId, level)
      : void store.setGuildLevel(escopo.guildId, level);

  const silenciar = (minutos: number | null) =>
    canal
      ? void store.muteChannel(escopo.channelId, minutos)
      : void store.muteGuild(escopo.guildId, minutos);

  const dessilenciar = () =>
    canal ? void store.unmuteChannel(escopo.channelId) : void store.unmuteGuild(escopo.guildId);

  const itens: MenuItem[] = NIVEIS.map(({ level, chave, icone }) => ({
    label: t(chave),
    // o ✓ substitui o ícone do nível quando é o escolhido — sem submenu, é o
    // único jeito de o menu plano mostrar em que estado o canal está
    icon: level === nivelAtual ? <Check size={18} /> : icone,
    onSelect: () => definirNivel(level),
  }));

  itens.push({ separator: true });

  if (silenciado) {
    itens.push({ label: t("notif.dessilenciar"), icon: <Bell size={18} />, onSelect: dessilenciar });
  } else {
    for (const minutos of MUTE_PRESETS_MINUTES) {
      itens.push({
        label: t(CHAVE_DA_DURACAO[minutos]),
        icon: <Clock size={18} />,
        onSelect: () => silenciar(minutos),
      });
    }
    itens.push({
      label: t("notif.ateReativar"),
      icon: <BellOff size={18} />,
      onSelect: () => silenciar(null),
    });
  }

  return itens;
}

/** Abre o menu de notificação nas coordenadas dadas. */
export function abrirMenuDeNotificacao(
  x: number,
  y: number,
  escopo: EscopoDeNotificacao,
  setting: NotificationSetting | undefined,
  t: (chave: ChaveDeTexto) => string,
): void {
  ui.openContextMenu(x, y, itensDeNotificacao(escopo, setting, t));
}
