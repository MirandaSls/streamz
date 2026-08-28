"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Volume2 } from "lucide-react";
import { type NotificationLevel } from "@streamz/shared";
import { RadioCards, Row, Section, Switch, Toggle } from "@/components/ui/controls";
import { SONS, useSons, type NomeDeSom } from "@/stores/sons";
import { useT } from "@/lib/i18n";
import { tocarSomDeNotificacao } from "@/lib/notification-sound";
import { tocarSom, type SomDeVoz } from "@/lib/ringtone";
import { useGlobalSetting, useNotifications } from "@/stores/notifications";
import { useSettings } from "@/stores/settings";

/**
 * Notificações: os interruptores locais (desktop, som, contador no ícone,
 * "não perturbe"), a lista de sons por evento e o **padrão** de nível, que é
 * do servidor.
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

      <BlocoDeSons />

      <Section title={t("notif.padrao")} semDivisoria>
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

/**
 * "Ativar sons de notificação" e, dentro dele, um interruptor por som.
 *
 * A lista fica recolhida porque são dez linhas para uma preferência que quase
 * ninguém abre — mas quando incomoda, incomoda por *um* som só, e é esse que
 * precisa ser desligável sem calar o resto.
 */
function BlocoDeSons() {
  const t = useT();
  const s = useSettings();
  const desligados = useSons((st) => st.desligados);
  const alternar = useSons((st) => st.alternar);
  const [aberto, setAberto] = useState(false);

  function ouvir(nome: NomeDeSom) {
    if (nome === "mensagem" || nome === "chamada") {
      tocarSomDeNotificacao(s.outputVolume / 100);
      return;
    }
    // a prévia toca mesmo o som desligado: é o que a pessoa está avaliando
    tocarSom(nome as SomDeVoz, (s.outputVolume / 100) * 0.12, true);
  }

  return (
    <Section title="Sons">
      <Row
        label={t("notif.som")}
        hint="Sem isto, notificação nenhuma faz barulho neste aparelho."
        control={
          <div className="flex items-center gap-2">
            <Switch
              checked={s.notificationSound}
              onChange={(notificationSound) => s.set({ notificationSound })}
              label={t("notif.som")}
            />
            <button
              type="button"
              onClick={() => tocarSomDeNotificacao(s.outputVolume / 100)}
              aria-label={t("notif.tocarSom")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
            >
              <Volume2 size={18} />
            </button>
          </div>
        }
      />

      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-border py-3 text-left last:border-b-0"
      >
        <ChevronRight
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-txt-muted transition-transform ${aberto ? "rotate-90" : ""}`}
        />
        <span className="min-w-0 flex-1 text-sm font-medium text-txt-primary">
          Sons individuais
        </span>
        <span className="shrink-0 text-xs text-txt-muted">
          {SONS.length - Object.keys(desligados).length} de {SONS.length} ligados
        </span>
      </button>

      {aberto && (
        <div className={s.notificationSound ? "" : "opacity-50"}>
          {SONS.map((som) => (
            <Row
              key={som.nome}
              label={som.rotulo}
              control={
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!desligados[som.nome]}
                    onChange={(v) => alternar(som.nome, v)}
                    label={som.rotulo}
                    disabled={!s.notificationSound}
                  />
                  <button
                    type="button"
                    onClick={() => ouvir(som.nome)}
                    aria-label={`${t("notif.tocarSom")}: ${som.rotulo}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
                  >
                    <Volume2 size={16} />
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}
    </Section>
  );
}
