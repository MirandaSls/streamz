"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check } from "@/components/ui/icones";
import { useUI, type Toast } from "@/stores/ui";

/**
 * Avisos passageiros no topo da tela.
 *
 * O Discord quase não usa toast: o que dá errado aparece **onde** deu errado
 * (aviso no composer, faixa no topo do canal, modal). O único parente próximo
 * é a pílula central do topo — "Link copiado" — e é essa a forma daqui: uma
 * caixinha discreta, centrada, sem botão de fechar (ela some sozinha; um "×"
 * transforma um aviso de 5 s numa tarefa).
 *
 * `aria-live="polite"` para o leitor de tela anunciar sem roubar o foco de
 * quem está digitando.
 */

/** Quanto a caixinha leva para sumir depois de sair da store. */
const SAIDA_MS = 200;

export default function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const anterior = useRef<Toast[]>([]);
  /** os que já saíram da store continuam na tela até a animação terminar. */
  const [saindo, setSaindo] = useState<Toast[]>([]);

  useEffect(() => {
    const vivos = new Set(toasts.map((t) => t.id));
    const removidos = anterior.current.filter((t) => !vivos.has(t.id));
    anterior.current = toasts;
    if (removidos.length === 0) return;
    setSaindo((s) => [...s, ...removidos]);
    const timer = window.setTimeout(
      () => setSaindo((s) => s.filter((t) => !removidos.some((r) => r.id === t.id))),
      SAIDA_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const lista = [...toasts, ...saindo];
  if (lista.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-4 z-[60] flex max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2"
    >
      {lista.map((toast) => {
        const foi = saindo.some((t) => t.id === toast.id);
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-full bg-background-surface-higher px-3.5 py-2 text-sm text-text-default shadow-popout transition duration-200 anim-menu ${
              foi ? "-translate-y-1 opacity-0" : "opacity-100"
            }`}
          >
            {toast.kind === "error" ? (
              <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-status-danger" />
            ) : (
              <Check size={16} aria-hidden="true" className="shrink-0 text-brand-500" />
            )}
            <span className="min-w-0">{toast.text}</span>
          </div>
        );
      })}
    </div>
  );
}
