"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Folha inferior (*bottom sheet*) — o que um popover ancorado vira no celular.
 *
 * No desktop uma caixa nasce colada ao botão que a abriu, porque o ponteiro
 * está ali e a tela é grande. No celular as duas premissas caem: o dedo cobre o
 * botão, e uma caixa de 300px ancorada num botão do topo fica fora do alcance
 * do polegar. O padrão das duas plataformas é o mesmo — a caixa sobe do fundo,
 * ocupando a largura inteira, com o conteúdo perto de onde a mão está.
 *
 * Regras que valem para todas as folhas do app:
 *
 * - **Nunca passa de 85% da altura**, e o corpo rola por dentro. Uma folha do
 *   tamanho da tela é um modal disfarçado, e perde o "ainda estou na conversa".
 * - **`env(safe-area-inset-bottom)`** no rodapé: o último item de uma lista não
 *   pode cair atrás da barra de gestos.
 * - **`overscroll-contain`**: rolar até o fim da folha não pode arrastar a
 *   página atrás dela.
 * - O véu fecha ao toque, e o Esc também (teclado externo existe em tablet).
 */
export default function FolhaInferior({
  rotulo,
  titulo,
  onFechar,
  children,
}: {
  /** rótulo acessível — a folha é um `dialog` que pode não ter título escrito. */
  rotulo: string;
  titulo?: ReactNode;
  onFechar: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onFechar();
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onFechar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="anim-overlay fixed inset-0 z-[95] flex flex-col justify-end bg-black/70"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        className="anim-folha flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-overlay pb-[env(safe-area-inset-bottom)] shadow-high"
      >
        {/* a alça: não arrasta (ainda), mas é o sinal de "isto sobe do fundo e
            fecha para baixo" que todo mundo já conhece de outros apps */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border-strong"
        />
        {titulo && (
          <h2 className="shrink-0 px-5 pb-1 pt-3 text-base font-semibold text-txt-primary">
            {titulo}
          </h2>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
