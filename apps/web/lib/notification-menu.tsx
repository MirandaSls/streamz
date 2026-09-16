"use client";

import { AtSign, Bell, BellOff, BellRing, Clock } from "@/components/ui/icones";
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

/**
 * Rótulo de um preset de minutos sem chave dedicada em `CHAVE_DA_DURACAO`.
 *
 * `MUTE_PRESETS_MINUTES` (`@streamz/shared`) pode ganhar presets novos (ex.:
 * 180 = "Por 3 horas") sem que `i18n.ts` — fora do escopo deste cartão —
 * ganhe uma chave junto. Decompõe em horas quando o preset é múltiplo de 60
 * (todos são, hoje), na mesma forma "Por N horas" dos que já têm chave; não
 * passa por `useT`/`traduzir`, então sai só em pt-BR, como o resto do menu de
 * contexto (`idioma.ajuda` em `i18n.ts`: a troca de idioma vale para as telas
 * de configuração, o resto do app segue em português).
 */
function rotuloPresetSemChave(minutos: number): string {
  if (minutos % 60 !== 0) return `Por ${minutos} minutos`;
  const horas = minutos / 60;
  return `Por ${horas} hora${horas === 1 ? "" : "s"}`;
}

/** Rótulo de um preset de "silenciar por…", com ou sem chave em `i18n.ts`. */
function rotuloDuracao(minutos: number, t: (chave: ChaveDeTexto) => string): string {
  const chave = CHAVE_DA_DURACAO[minutos];
  return chave ? t(chave) : rotuloPresetSemChave(minutos);
}

const NIVEIS: { level: NotificationLevel; chave: ChaveDeTexto; icone: JSX.Element }[] = [
  { level: "ALL", chave: "notif.tudo", icone: <BellRing size={18} /> },
  { level: "MENTIONS", chave: "notif.mencoes", icone: <AtSign size={18} /> },
  { level: "NONE", chave: "notif.nada", icone: <BellOff size={18} /> },
];

/**
 * Texto curto do nível atual, para usar como `description` do item-pai
 * (print p5: "Config. de notificação" mostra "Nada" embaixo do rótulo).
 * `undefined` é "sem preferência própria neste escopo" — reaproveita
 * `notif.padrao` ("Padrão para servidores e conversas"), a única chave que já
 * existe para esse caso (hoje só na tela de configurações).
 */
export function rotuloDoNivel(
  nivel: NotificationLevel | undefined,
  t: (chave: ChaveDeTexto) => string,
): string {
  const item = nivel ? NIVEIS.find((n) => n.level === nivel) : undefined;
  return item ? t(item.chave) : t("notif.padrao");
}

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

/**
 * "Silenciar X ›": durações e o atalho de dessilenciar quando já está mudo.
 *
 * `rotulo` já era de livre escolha de quem chama — serve tanto para "Silenciar
 * canal"/"Silenciar servidor" quanto para "Silenciar @<nome>" da DM (ESPEC
 * p2, item 13). `semIcones` tira o ícone à esquerda de cada item: os menus do
 * ícone do servidor (p5) e da lista de DM (p2) não têm ícone em nenhum item.
 */
export function submenuSilenciar(
  rotulo: string,
  escopo: EscopoDeNotificacao,
  setting: NotificationSetting | undefined,
  t: (chave: ChaveDeTexto) => string,
  semIcones?: boolean,
): MenuItem {
  const { silenciar, dessilenciar } = acoes(escopo);
  const silenciado = isMuted(setting);

  if (silenciado) {
    return {
      label: t("notif.dessilenciar"),
      icon: semIcones ? undefined : <Bell size={18} />,
      onSelect: dessilenciar,
    };
  }

  const itens: MenuItem[] = MUTE_PRESETS_MINUTES.map((minutos) => ({
    label: rotuloDuracao(minutos, t),
    icon: semIcones ? undefined : <Clock size={18} />,
    onSelect: () => silenciar(minutos),
  }));
  itens.push({
    label: t("notif.ateReativar"),
    icon: semIcones ? undefined : <BellOff size={18} />,
    onSelect: () => silenciar(null),
  });

  return { label: rotulo, icon: semIcones ? undefined : <BellOff size={18} />, submenu: itens };
}

/**
 * "Configurações de Notificação ›": os três níveis como rádio.
 *
 * `rotulo` é opcional como o de `submenuSilenciar`: o cabeçalho do servidor
 * usa "Config. de notificação" (print `2026-08-31 101733`), os outros menus
 * continuam com `aba.notificacoes`. A `description` do item-pai mostra o
 * nível atual (print p5: "Nada" embaixo de "Config. de notificação").
 * `semIcones` tira o ícone à esquerda do item-pai e de cada rádio — os menus
 * do ícone do servidor (p5) e da DM não têm ícone em item nenhum.
 */
export function submenuNotificacoes(
  escopo: EscopoDeNotificacao,
  setting: NotificationSetting | undefined,
  t: (chave: ChaveDeTexto) => string,
  rotulo?: string,
  semIcones?: boolean,
): MenuItem {
  const { definirNivel } = acoes(escopo);
  const nivelAtual = setting?.level ?? "ALL";
  return {
    label: rotulo ?? t("aba.notificacoes"),
    icon: semIcones ? undefined : <Bell size={18} />,
    description: rotuloDoNivel(nivelAtual, t),
    // rádio de verdade: o estado é do item, não um ✓ ocupando o lugar do ícone
    submenu: NIVEIS.map(({ level, chave, icone }) => ({
      label: t(chave),
      icon: semIcones ? undefined : icone,
      control: "radio" as const,
      checked: level === nivelAtual,
      onSelect: () => definirNivel(level),
    })),
  };
}
