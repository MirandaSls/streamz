"use client";

import { RadioCards, Section } from "@/components/settings/controls";
import { LOCALES, NOMES_DE_IDIOMA, useT } from "@/lib/i18n";
import { useSettings, type Locale } from "@/stores/settings";

/**
 * Idioma do app. O dicionário cobre as telas de configuração (ver `lib/i18n`);
 * o resto do app segue em pt-BR até alguém acrescentar as chaves.
 */
export default function IdiomaTab() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const set = useSettings((s) => s.set);

  return (
    <Section title={t("aba.idioma")}>
      <RadioCards<Locale>
        legend={t("idioma.escolha")}
        value={locale}
        onChange={(novo) => set({ locale: novo })}
        options={LOCALES.map((l) => ({ value: l, label: NOMES_DE_IDIOMA[l] }))}
      />
      <p className="pt-3 text-xs text-txt-muted">{t("idioma.ajuda")}</p>
    </Section>
  );
}
