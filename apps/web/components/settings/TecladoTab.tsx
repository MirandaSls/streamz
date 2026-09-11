"use client";

import { useState } from "react";
import { Keyboard, RotateCcw } from "@/components/ui/icones";
import { atalhosEfetivos, conflitoDe, useAtalhos } from "@/stores/atalhos";
import { useT, type ChaveDeTexto } from "@/lib/i18n";
import { formatShortcut, shortcutFromEvent, type ShortcutAction } from "@/lib/shortcuts";
import { ui } from "@/stores/ui";

/**
 * Aba "Teclado": a lista dos atalhos, gerada do mesmo registro
 * (`lib/shortcuts`) que `useKeyboardShortcuts` e `VoiceHotkeys` executam, agora
 * **regravável**.
 *
 * Uma fonte só evita o problema clássico desta tela: documentação que continua
 * anunciando um atalho que alguém já mudou. A regravação só sobrescreve a
 * combinação de uma ação — a lista, a ordem e os rótulos continuam vindo do
 * registro.
 */
export default function TecladoTab() {
  const t = useT();
  const regravados = useAtalhos((s) => s.regravados);
  const regravar = useAtalhos((s) => s.regravar);
  const restaurar = useAtalhos((s) => s.restaurar);
  const restaurarTudo = useAtalhos((s) => s.restaurarTudo);
  const [gravando, setGravando] = useState<ShortcutAction | null>(null);

  const specs = atalhosEfetivos(regravados);

  function capturar(e: React.KeyboardEvent, action: ShortcutAction) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setGravando(null);
      return;
    }
    const combo = shortcutFromEvent(e);
    // só modificador ainda não é atalho: seguir ouvindo até vir uma tecla
    if (!combo) return;
    const conflito = conflitoDe(combo, action, regravados);
    if (conflito) {
      ui.toast(
        `${formatShortcut(combo)} já é "${t(conflito.label as ChaveDeTexto)}".`,
        "error",
      );
      return;
    }
    regravar(action, combo);
    setGravando(null);
  }

  return (
    <>
      <p className="mb-3 text-sm text-text-muted">{t("teclado.intro")}</p>

      <ul>
        {specs.map((spec) => {
          const emGravacao = gravando === spec.action;
          const alterado = spec.action in regravados;
          return (
            <li
              key={spec.action}
              className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0"
            >
              <span className="min-w-0 text-sm text-text-default">
                {t(spec.label as ChaveDeTexto)}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {emGravacao ? (
                  <button
                    type="button"
                    autoFocus
                    onKeyDown={(e) => capturar(e, spec.action)}
                    onBlur={() => setGravando(null)}
                    aria-label={`Gravando atalho de ${t(spec.label as ChaveDeTexto)}`}
                    className="flex h-8 celular:h-[44px] items-center gap-1.5 rounded-[3px] bg-brand-500 px-3 text-xs font-semibold text-control-primary-text-default"
                  >
                    <Keyboard size={14} aria-hidden="true" />
                    Aperte a combinação (Esc cancela)
                  </button>
                ) : (
                  <>
                    {spec.combos.map((combo) => (
                      <kbd
                        key={combo}
                        className="rounded-[3px] bg-input-background-default px-2 py-1 text-xs font-semibold text-text-strong"
                      >
                        {formatShortcut(combo)}
                      </kbd>
                    ))}
                    <button
                      type="button"
                      onClick={() => setGravando(spec.action)}
                      aria-label={`Regravar o atalho de ${t(spec.label as ChaveDeTexto)}`}
                      className="grid h-7 celular:h-[44px] w-7 celular:w-[44px] place-items-center rounded-[3px] text-text-muted transition hover:bg-interactive-background-hover hover:text-text-strong"
                    >
                      <Keyboard size={16} />
                    </button>
                    {alterado && (
                      <button
                        type="button"
                        onClick={() => restaurar(spec.action)}
                        aria-label={`Voltar ao atalho padrão de ${t(spec.label as ChaveDeTexto)}`}
                        className="grid h-7 celular:h-[44px] w-7 celular:w-[44px] place-items-center rounded-[3px] text-text-muted transition hover:bg-interactive-background-hover hover:text-text-strong"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {Object.keys(regravados).length > 0 && (
        <button
          type="button"
          onClick={() => restaurarTudo()}
          className="mt-4 h-9 celular:h-[44px] rounded-[3px] border border-border-normal px-3 text-sm font-medium text-text-default transition hover:bg-interactive-background-hover"
        >
          {t("config.restaurar")}
        </button>
      )}
    </>
  );
}
