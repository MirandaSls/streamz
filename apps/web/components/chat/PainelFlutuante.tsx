"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Anchor } from "@/stores/ui";

/** Folga entre o botão que abriu e o painel. */
const GAP = 8;
/** Margem mínima até a borda da janela. */
const EDGE = 8;

/**
 * Painel ancorado a um botão, posicionado **em relação à janela** e não ao
 * elemento pai.
 *
 * Existe porque um picker preso com `absolute` dentro da mensagem é cortado
 * pela rolagem da timeline: nas últimas mensagens ele abria para baixo e ficava
 * pela metade. Aqui a caixa é medida depois de montada e vira para cima (ou
 * para a esquerda) quando não couber — é a mesma regra do `Tooltip`.
 */
export default function PainelFlutuante({
  ancora,
  onClose,
  children,
}: {
  ancora: Anchor;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const caixa = ref.current?.getBoundingClientRect();
    if (!caixa) return;
    const abaixo = ancora.y + ancora.height + GAP;
    const acima = ancora.y - caixa.height - GAP;
    const cabeAbaixo = abaixo + caixa.height <= window.innerHeight - EDGE;
    const top = cabeAbaixo ? abaixo : Math.max(EDGE, acima);
    const left = Math.min(
      Math.max(EDGE, ancora.x + ancora.width - caixa.width),
      Math.max(EDGE, window.innerWidth - caixa.width - EDGE),
    );
    setPos({ top, left });
  }, [ancora]);

  // rolar deixaria o painel parado longe do botão que o abriu
  useLayoutEffect(() => {
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-[70]"
    >
      {children}
    </div>,
    document.body,
  );
}
