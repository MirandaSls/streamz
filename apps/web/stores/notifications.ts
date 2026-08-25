import { create } from "zustand";
import {
  GLOBAL_NOTIFICATION_SCOPE,
  channelNotificationScope,
  effectiveNotificationLevel,
  guildNotificationScope,
  isMuted,
  type NotificationLevel,
  type NotificationSetting,
} from "@newdisc/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Preferências de notificação vindas do servidor (nível e silêncio por canal,
 * por servidor e o padrão global).
 *
 * Vale a pena separar de `stores/settings`: aquilo é preferência do
 * dispositivo (localStorage), isto tem de valer no celular e no desktop, então
 * é da conta. As duas se encontram só na hora de decidir se uma mensagem
 * notifica — em `hooks/useRealtime`.
 */

interface NotificationsState {
  /** por escopo canônico ("global" | "guild:<id>" | "channel:<id>"). */
  porEscopo: Record<string, NotificationSetting>;
  loaded: boolean;

  load: () => Promise<void>;
  /** Aplica uma preferência que chegou pelo gateway (outra aba/dispositivo). */
  apply: (setting: NotificationSetting) => void;

  setChannelLevel: (channelId: string, level: NotificationLevel) => Promise<void>;
  setGuildLevel: (guildId: string, level: NotificationLevel) => Promise<void>;
  setGlobalLevel: (level: NotificationLevel) => Promise<void>;
  /** `minutos` null = silenciar até eu reativar; `false` em `muted` dessilencia. */
  muteChannel: (channelId: string, minutos: number | null) => Promise<void>;
  muteGuild: (guildId: string, minutos: number | null) => Promise<void>;
  unmuteChannel: (channelId: string) => Promise<void>;
  unmuteGuild: (guildId: string) => Promise<void>;
  clear: () => void;
}

/** Instante em que um silêncio de `minutos` expira (null = para sempre). */
function ate(minutos: number | null): string | null {
  return minutos === null ? null : new Date(Date.now() + minutos * 60_000).toISOString();
}

export const useNotifications = create<NotificationsState>((set, get) => {
  async function salvar(
    body: Parameters<typeof api.updateNotificationSetting>[0],
  ): Promise<void> {
    try {
      get().apply(await api.updateNotificationSetting(body));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar a preferência"), "error");
    }
  }

  return {
    porEscopo: {},
    loaded: false,

    load: async () => {
      try {
        const lista = await api.notificationSettings();
        set({
          porEscopo: Object.fromEntries(lista.map((s) => [s.scope, s])),
          loaded: true,
        });
      } catch {
        // preferência é conveniência: sem ela o padrão (notificar tudo) vale
        set({ loaded: true });
      }
    },

    apply: (setting) =>
      set((s) => ({ porEscopo: { ...s.porEscopo, [setting.scope]: setting } })),

    setChannelLevel: (channelId, level) => salvar({ channelId, level }),
    setGuildLevel: (guildId, level) => salvar({ guildId, level }),
    setGlobalLevel: (level) => salvar({ level }),

    muteChannel: (channelId, minutos) =>
      salvar({ channelId, muted: true, mutedUntil: ate(minutos) }),
    muteGuild: (guildId, minutos) => salvar({ guildId, muted: true, mutedUntil: ate(minutos) }),
    unmuteChannel: (channelId) => salvar({ channelId, muted: false, mutedUntil: null }),
    unmuteGuild: (guildId) => salvar({ guildId, muted: false, mutedUntil: null }),

    clear: () => set({ porEscopo: {}, loaded: false }),
  };
});

// ── leitura (fora de componentes e em hooks) ───────────────────────────────

export function settingOfChannel(channelId: string): NotificationSetting | undefined {
  return useNotifications.getState().porEscopo[channelNotificationScope(channelId)];
}

export function settingOfGuild(guildId: string | null): NotificationSetting | undefined {
  if (!guildId) return undefined;
  return useNotifications.getState().porEscopo[guildNotificationScope(guildId)];
}

/** Nível efetivo de um canal: canal > servidor > padrão global. */
export function levelForChannel(channelId: string, guildId: string | null): NotificationLevel {
  const { porEscopo } = useNotifications.getState();
  return effectiveNotificationLevel(
    porEscopo[channelNotificationScope(channelId)],
    guildId ? porEscopo[guildNotificationScope(guildId)] : undefined,
    porEscopo[GLOBAL_NOTIFICATION_SCOPE],
  );
}

/** true quando o canal está silenciado por si ou pelo servidor. */
export function isChannelMuted(channelId: string, guildId: string | null): boolean {
  return isMuted(settingOfChannel(channelId)) || isMuted(settingOfGuild(guildId));
}

/** Versão reativa de `settingOfChannel` (para o sino do cabeçalho). */
export function useChannelSetting(channelId: string | null): NotificationSetting | undefined {
  return useNotifications((s) =>
    channelId ? s.porEscopo[channelNotificationScope(channelId)] : undefined,
  );
}

/** Versão reativa de `settingOfGuild`. */
export function useGuildSetting(guildId: string | null): NotificationSetting | undefined {
  return useNotifications((s) =>
    guildId ? s.porEscopo[guildNotificationScope(guildId)] : undefined,
  );
}

/** O padrão global, que a aba Notificações edita. */
export function useGlobalSetting(): NotificationSetting | undefined {
  return useNotifications((s) => s.porEscopo[GLOBAL_NOTIFICATION_SCOPE]);
}
