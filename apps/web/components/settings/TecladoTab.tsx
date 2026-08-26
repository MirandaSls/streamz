"use client";

import { useT, type ChaveDeTexto } from "@/lib/i18n";
import { SHORTCUTS, formatShortcut } from "@/lib/shortcuts";

/**
 * Aba "Teclado": a lista dos atalhos, gerada do mesmo registro
 * (`lib/shortcuts`) que `useKeyboardShortcuts` executa.
 *
 * Uma fonte só evita o problema clássico desta tela: documentação que continua
 * anunciando um atalho que alguém já mudou.
 */
export default function TecladoTab() {
  const t = useT();

  return (
    <>
      <p className="mb-3 text-sm text-txt-muted">{t("teclado.intro")}</p>
      <dl>
        {SHORTCUTS.map((spec) => (
          <div
            key={spec.action}
            className="flex items-center justify-between gap-4 border-b border-[#3f4147] py-2.5 last:border-b-0"
          >
            <dt className="min-w-0 text-sm text-txt-normal">{t(spec.label as ChaveDeTexto)}</dt>
            <dd className="flex shrink-0 gap-1.5">
              {spec.combos.map((combo) => (
                <kbd
                  key={combo}
                  className="rounded-[3px] bg-rail px-2 py-1 text-xs font-semibold text-txt-primary"
                >
                  {formatShortcut(combo)}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
