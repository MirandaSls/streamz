"use client";

import { Paintbrush } from "lucide-react";
import { useIrParaAba } from "@/components/settings/navegacao";
import PreviaDeMensagens from "@/components/settings/PreviaDeMensagens";
import {
  ConfiguracoesRelacionadas,
  RadioCards,
  Section,
  Slider,
  Toggle,
} from "@/components/ui/controls";
import { useT } from "@/lib/i18n";
import { EMOJI_SIZE, useSettings, type SendMode } from "@/stores/settings";

/**
 * Acessibilidade: legibilidade, cor, movimento e o que o Enter faz no composer.
 *
 * Os controles são os mesmos de antes — o que mudou é que agora eles moram em
 * **seções nomeadas**, e é isso que dá o menu de segundo nível (ver
 * `settings/tabs.tsx`). Numa página contínua de cinco controles a divisão
 * parece cerimônia; ela existe porque a página cresce, e porque a pessoa que
 * procura "movimento" precisa achar sem ler tudo.
 *
 * A prévia no topo é a mesma da aba de Aparência, de propósito: metade destas
 * preferências (tamanho do emoji, hora sempre visível) só quer dizer alguma
 * coisa vendo.
 *
 * "Reduzir movimento" e a saturação viram classe/variável no `<html>` (ver
 * `stores/settings`), então valem para a interface inteira e não só para as
 * telas que lembrarem de olhar a preferência.
 */
export default function AcessibilidadeTab() {
  const t = useT();
  const s = useSettings();
  const irParaAba = useIrParaAba();

  return (
    <>
      <Section title={t("aparencia.previa")} semDivisoria>
        <PreviaDeMensagens />
      </Section>

      <Section id="legibilidade" title={t("acess.secLegibilidade")}>
        <Slider
          label={t("acess.tamanhoEmoji")}
          value={s.emojiSize}
          min={EMOJI_SIZE.min}
          max={EMOJI_SIZE.max}
          step={EMOJI_SIZE.step}
          format={(v) => `${v}px`}
          onChange={(emojiSize) => s.set({ emojiSize })}
        />
        <Toggle
          label={t("acess.mostrarHora")}
          checked={s.alwaysShowTime}
          onChange={(alwaysShowTime) => s.set({ alwaysShowTime })}
        />
      </Section>

      <Section id="cor" title={t("acess.secCor")}>
        <Slider
          label={t("acess.saturacao")}
          value={s.saturation}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onChange={(saturation) => s.set({ saturation })}
        />
      </Section>

      <Section id="movimento" title={t("acess.secMovimento")}>
        <Toggle
          label={t("acess.reduzirMovimento")}
          hint={t("acess.reduzirMovimentoAjuda")}
          checked={s.reduceMotion}
          onChange={(reduceMotion) => s.set({ reduceMotion })}
        />
      </Section>

      <Section id="chat" title={t("acess.secChat")} semDivisoria>
        <RadioCards<SendMode>
          legend={t("acess.enviarCom")}
          value={s.sendMode}
          onChange={(sendMode) => s.set({ sendMode })}
          options={[
            { value: "enter", label: t("acess.enter") },
            { value: "ctrl-enter", label: t("acess.ctrlEnter") },
          ]}
        />
      </Section>

      <ConfiguracoesRelacionadas
        titulo={t("config.relacionadas")}
        itens={[
          {
            id: "aparencia",
            label: t("aba.aparencia"),
            hint: t("aparencia.mensagens"),
            icon: <Paintbrush size={18} />,
            onSelect: () => irParaAba("aparencia"),
          },
        ]}
      />
    </>
  );
}
