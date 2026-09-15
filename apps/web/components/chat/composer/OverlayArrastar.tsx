"use client";

import { createPortal } from "react-dom";
import { Upload } from "@/components/ui/icones";

/**
 * Overlay de arrastar: cobre **a área do chat inteira**, e não um retângulo
 * arbitrário acima do composer. A caixa é medida a partir do `<main>` que
 * contém o composer e desenhada em portal, porque um `absolute` dentro do form
 * nunca alcançaria a timeline.
 *
 * O desenho não foi medido nesta rodada (não há print 1:1 do Discord com
 * arquivo sendo arrastado): é o que o app já tinha, só com as classes do
 * vocabulário novo.
 */
export default function OverlayArrastar({ alvo, destino }: { alvo: HTMLElement | null; destino?: string }) {
  const area = (alvo?.closest("main") ?? alvo)?.getBoundingClientRect();
  if (!area || typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{ top: area.top + 8, left: area.left + 8, width: area.width - 16, height: area.height - 16 }}
      className="pointer-events-none fixed z-[65] grid place-items-center rounded-lg border-2 border-dashed border-brand-500 bg-brand-500/20"
    >
      <span className="flex flex-col items-center gap-3 text-center">
        <Upload size={56} strokeWidth={1.5} aria-hidden="true" className="text-icon-overlay-light" />
        <span className="text-heading-xl font-extrabold text-text-overlay-light">Arraste e solte para enviar</span>
        {destino && <span className="text-text-sm text-text-overlay-light">em {destino}</span>}
      </span>
    </div>,
    document.body,
  );
}
