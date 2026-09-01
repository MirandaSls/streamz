"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
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
      <Section id="dispositivo" title={t("notif.esteDispositivo")}>
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

      <Section id="padrao" title={t("notif.padrao")} semDivisoria>
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
/** Quantos sons ficam à vista antes do "mostrar mais" (o print mostra quatro). */
const SONS_A_VISTA = 4;

/**
 * A lista de sons, um por evento.
 *
 * Cada linha tem o seu interruptor e o seu **"Prévia do som"** — e a prévia é
 * um link sob o rótulo, não um ícone no canto: o que se está decidindo ali é
 * "quero ouvir isto?", e a única forma de responder é ouvindo. Um alto-falante
 * mudo à direita fazia a prévia parecer o próprio controle de volume.
 *
 * Só os primeiros ficam à vista. São dez eventos, e a lista inteira aberta
 * empurra o resto da página para fora da tela por uma preferência que quase
 * ninguém mexe — o resto entra num "mostrar mais" que diz o que tem lá dentro.
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

  const visiveis = aberto ? SONS : SONS.slice(0, SONS_A_VISTA);
  const escondidos = SONS.slice(SONS_A_VISTA);

  return (
    <Section id="sons" title={t("notif.sons")}>
      <Row
        label={t("notif.som")}
        hint="Sem isto, notificação nenhuma faz barulho neste aparelho."
        control={
          <Switch
            checked={s.notificationSound}
            onChange={(notificationSound) => s.set({ notificationSound })}
            label={t("notif.som")}
          />
        }
      />

      <div className={s.notificationSound ? "" : "opacity-50"}>
        {visiveis.map((som) => (
          <Row
            key={som.nome}
            label={som.rotulo}
            hint={
              <button
                type="button"
                onClick={() => ouvir(som.nome)}
                className="text-txt-link hover:underline"
              >
                Prévia do som
              </button>
            }
            control={
              <Switch
                checked={!desligados[som.nome]}
                onChange={(v) => alternar(som.nome, v)}
                label={som.rotulo}
                disabled={!s.notificationSound}
              />
            }
          />
        ))}
      </div>

      {escondidos.length > 0 && (
        <Row
          label={aberto ? "Mostrar menos sons" : `Mostrar ${escondidos.length} mais sons`}
          // dizer quais são: sem isso, "mostrar mais 6" não informa se vale abrir
          hint={escondidos
            .slice(0, 3)
            .map((som) => som.rotulo)
            .join(", ")
            .concat(escondidos.length > 3 ? " e mais" : "")}
          control={
            <button
              type="button"
              aria-expanded={aberto}
              onClick={() => setAberto((v) => !v)}
              aria-label={aberto ? "Mostrar menos sons" : "Mostrar mais sons"}
              className="grid h-8 w-8 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
            >
              <ChevronRight
                size={18}
                aria-hidden="true"
                className={`transition-transform ${aberto ? "-rotate-90" : "rotate-90"}`}
              />
            </button>
          }
        />
      )}
    </Section>
  );
}
