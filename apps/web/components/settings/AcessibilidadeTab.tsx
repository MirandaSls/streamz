"use client";

import { RadioCards, Slider, Toggle } from "@/components/settings/controls";
import { useT } from "@/lib/i18n";
import { EMOJI_SIZE, useSettings, type SendMode } from "@/stores/settings";

/**
 * Acessibilidade: reduzir movimento, saturação, hora sempre visível, tamanho
 * do emoji e o que o Enter faz no composer.
 *
 * "Reduzir movimento" e a saturação viram classe/variável no `<html>` (ver
 * `stores/settings`), então valem para a interface inteira e não só para as
 * telas que lembrarem de olhar a preferência.
 */
export default function AcessibilidadeTab() {
  const t = useT();
  const s = useSettings();

  return (
    <>
      <Toggle
        label={t("acess.reduzirMovimento")}
        hint={t("acess.reduzirMovimentoAjuda")}
        checked={s.reduceMotion}
        onChange={(reduceMotion) => s.set({ reduceMotion })}
      />
      <Slider
        label={t("acess.saturacao")}
        value={s.saturation}
        min={0}
        max={100}
        format={(v) => `${v}%`}
        onChange={(saturation) => s.set({ saturation })}
      />
      <Toggle
        label={t("acess.mostrarHora")}
        checked={s.alwaysShowTime}
        onChange={(alwaysShowTime) => s.set({ alwaysShowTime })}
      />
      <Slider
        label={t("acess.tamanhoEmoji")}
        value={s.emojiSize}
        min={EMOJI_SIZE.min}
        max={EMOJI_SIZE.max}
        step={EMOJI_SIZE.step}
        format={(v) => `${v}px`}
        onChange={(emojiSize) => s.set({ emojiSize })}
      />
      <RadioCards<SendMode>
        legend={t("acess.enviarCom")}
        value={s.sendMode}
        onChange={(sendMode) => s.set({ sendMode })}
        options={[
          { value: "enter", label: t("acess.enter") },
          { value: "ctrl-enter", label: t("acess.ctrlEnter") },
        ]}
      />
    </>
  );
}
