"use client";

import { useState } from "react";
import { Keyboard, RotateCcw } from "@/components/ui/icones";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
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
                  <Button
                    variante="primario"
                    tamanho="sm"
                    autoFocus
                    onKeyDown={(e) => capturar(e, spec.action)}
                    onBlur={() => setGravando(null)}
                    aria-label={`Gravando atalho de ${t(spec.label as ChaveDeTexto)}`}
                    icone={<Keyboard size={14} aria-hidden="true" />}
                    className="celular:h-[44px]"
                  >
                    Aperte a combinação (Esc cancela)
                  </Button>
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
                    <BotaoDeIcone
                      rotulo={`Regravar o atalho de ${t(spec.label as ChaveDeTexto)}`}
                      onClick={() => setGravando(spec.action)}
                      tamanho="sm"
                      icone={<Keyboard size={16} />}
                      className="celular:h-[44px] celular:w-[44px]"
                    />
                    {alterado && (
                      <BotaoDeIcone
                        rotulo={`Voltar ao atalho padrão de ${t(spec.label as ChaveDeTexto)}`}
                        onClick={() => restaurar(spec.action)}
                        tamanho="sm"
                        icone={<RotateCcw size={14} />}
                        className="celular:h-[44px] celular:w-[44px]"
                      />
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {Object.keys(regravados).length > 0 && (
        <Button
          variante="secundario"
          tamanho="sm"
          onClick={() => restaurarTudo()}
          className="mt-4 celular:h-[44px]"
        >
          {t("config.restaurar")}
        </Button>
      )}
    </>
  );
}
