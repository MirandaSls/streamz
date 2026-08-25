"use client";

import { useEffect } from "react";
import { Volume2 } from "lucide-react";
import { type NotificationLevel } from "@newdisc/shared";
import { RadioCards, Section, Toggle } from "@/components/settings/controls";
import { useT } from "@/lib/i18n";
import { tocarSomDeNotificacao } from "@/lib/notification-sound";
import { useGlobalSetting, useNotifications } from "@/stores/notifications";
import { useSettings } from "@/stores/settings";

/**
 * Notificações: os interruptores locais (desktop, som, contador no ícone,
 * "não perturbe") e o **padrão** de nível, que é do servidor.
 *
 * A separação é de propósito: se notificar neste dispositivo é preferência
 * daqui; quanto um servidor notifica precisa valer no celular também.
 */
export default function NotificacoesTab() {
  const t = useT();
  const s = useSettings();
  const global = useGlobalSetting();
  const loaded = useNotifications((st) => st.loaded);
  const load = useNotifications((st) => st.load);
  const setGlobalLevel = useNotifications((st) => st.setGlobalLevel);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  return (
    <>
      <Section title={t("notif.esteDispositivo")}>
        <Toggle
          label={t("notif.desktop")}
          checked={s.desktopNotifications}
          onChange={(desktopNotifications) => s.set({ desktopNotifications })}
        />
        <Toggle
          label={t("notif.som")}
          checked={s.notificationSound}
          onChange={(notificationSound) => s.set({ notificationSound })}
          extra={
            <button
              type="button"
              onClick={() => tocarSomDeNotificacao(s.outputVolume / 100)}
              aria-label={t("notif.tocarSom")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
            >
              <Volume2 size={18} />
            </button>
          }
        />
        <Toggle
          label={t("notif.badge")}
          checked={s.badgeCount}
          onChange={(badgeCount) => s.set({ badgeCount })}
        />
        <Toggle
          label={t("notif.dnd")}
          hint={t("notif.dndAjuda")}
          checked={s.dndSilencesAll}
          onChange={(dndSilencesAll) => s.set({ dndSilencesAll })}
        />
      </Section>

      <Section title={t("notif.padrao")}>
        <RadioCards<NotificationLevel>
          legend={t("notif.padrao")}
          legendaOculta
          columns={3}
          value={global?.level ?? "ALL"}
          onChange={(level) => void setGlobalLevel(level)}
          options={[
            { value: "ALL", label: t("notif.tudo") },
            { value: "MENTIONS", label: t("notif.mencoes") },
            { value: "NONE", label: t("notif.nada") },
          ]}
        />
      </Section>
    </>
  );
}
