"use client";

import { PontoDeRadio } from "@/components/ui/controls";
import { LOCALES, NOMES_DE_IDIOMA, useT } from "@/lib/i18n";
import { useSettings, type Locale } from "@/stores/settings";

/**
 * Idioma do app. O dicionário cobre as telas de configuração (ver `lib/i18n`);
 * o resto do app segue em pt-BR até alguém acrescentar as chaves.
 *
 * Cada cartão traz bandeira, nome **no próprio idioma** e nome em inglês —
 * quem abre a tela sem entender a língua atual encontra a sua pela bandeira e
 * pelo endônimo, que é justamente o caso de uso desta aba.
 */

/** Bandeira e endônimo/exônimo de cada idioma que o app oferece. */
const IDIOMAS: Record<Locale, { bandeira: string; nativo: string; ingles: string }> = {
  "pt-BR": { bandeira: "🇧🇷", nativo: "Português do Brasil", ingles: "Brazilian Portuguese" },
  "en-US": { bandeira: "🇺🇸", nativo: "English, US", ingles: "English, US" },
};

export default function IdiomaTab() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const set = useSettings((s) => s.set);

  return (
    <>
      <div
        role="radiogroup"
        aria-label={t("idioma.escolha")}
        className="grid grid-cols-2 gap-2"
      >
        {LOCALES.map((l) => {
          const info = IDIOMAS[l];
          const ativo = l === locale;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => set({ locale: l })}
              className={`flex items-center gap-3 rounded-[6px] border px-3 py-2.5 text-left transition ${
                ativo ? "border-brand-500 bg-interactive-background-hover" : "border-border-subtle hover:border-border-strong"
              }`}
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                {info?.bandeira ?? "🏳️"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-strong">
                  {info?.nativo ?? NOMES_DE_IDIOMA[l]}
                </span>
                {info && info.ingles !== info.nativo && (
                  <span className="block truncate text-xs text-text-muted">{info.ingles}</span>
                )}
              </span>
              <PontoDeRadio ativo={ativo} />
            </button>
          );
        })}
      </div>
      <p className="pt-3 text-xs text-text-muted">{t("idioma.ajuda")}</p>
    </>
  );
}
