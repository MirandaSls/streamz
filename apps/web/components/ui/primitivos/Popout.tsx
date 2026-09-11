"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * O popout ÚNICO do app (plano, onda 0.4): substitui as sete mecânicas de
 * painel flutuante que existem hoje — `PopoverFlutuante`, `PainelFlutuante`,
 * `HeaderPopover`, `PickerPanel`, o `Submenu` de `menus-de-audio`, o
 * `ProfilePopoverHost` e a parte de posição/foco do `ContextMenu`.
 *
 * Especificação medida (cartão 0.4-popout implementa — Opus):
 * - Superfície: fundo `--background-surface-high`, raio 12 (`--radius-md`, o
 *   dos popouts da refresh: `.popout_ab4223`, `.popoutContainer__93fc9`),
 *   sombra `var(--shadow-border), var(--shadow-high)` (`shadow-popout`), sem
 *   borda real (o 1px vem do `--shadow-border`). Padding é do conteúdo
 *   (`semRespiro` padrão verdadeiro); quem quer respiro usa 16.
 * - Posição: preso à janela (`fixed`, portal em `document.body`), lado
 *   preferido com espelhamento nos quatro lados e deslize no eixo cruzado para
 *   caber (8 da borda da janela); distância do alvo 8. Reposiciona em resize e
 *   scroll de ancestral.
 * - Entrada: parte de `translate3d(±10px)` na direção oposta ao lado e escala
 *   .95→1 com `transform-origin` no lado do alvo (`.animatorTop_faf9c0`…); a
 *   duração não está no CSS — usar a do `anim-menu` (120 ms).
 * - Fecha: Esc, clique fora (exceto dentro de `[data-submenu-de-popout]`),
 *   `aoFechar`. Foco: vai para `[data-autofocus]` ou o primeiro focável, Tab
 *   preso dentro, volta ao elemento que abriu ao fechar.
 * - Celular (`useEhMobile`): vira folha inferior com alça, véu e
 *   `useVoltarNoCelular` — a mesma que `PopoverFlutuante`/`PickerPanel`/
 *   `ProfilePopoverHost` fazem hoje, cada um do seu jeito.
 * - `usePosicaoFlutuante` é exportado para o `ContextMenu` usar a mesma conta de
 *   colisão, em vez de manter a sua (`colocar`).
 */
export type LadoDoPopout = "top" | "bottom" | "left" | "right";
export type AlinhamentoDoPopout = "start" | "center" | "end";
export type Retangulo = { x: number; y: number; width: number; height: number };

export interface PopoutProps {
  aberto: boolean;
  aoFechar: () => void;
  /** Elemento âncora (ref) ou retângulo fixo (clique do botão direito, seleção). */
  ancora: RefObject<HTMLElement | null> | Retangulo | DOMRect;
  /** Lado preferido. Padrão `bottom`. Espelha se não couber. */
  lado?: LadoDoPopout;
  alinhamento?: AlinhamentoDoPopout;
  /** Distância do alvo em px. Padrão 8. */
  distancia?: number;
  /** Largura fixa; sem ela, a do conteúdo. */
  largura?: number;
  /** Nome acessível do diálogo. */
  rotulo: string;
  /** Padrão `true`. */
  prenderFoco?: boolean;
  /** Padrão `true`. No celular vira folha inferior. */
  folhaNoCelular?: boolean;
  /** Padrão `true` (o conteúdo decide o padding). `false` dá 16. */
  semRespiro?: boolean;
  /** Marca o popout como submenu de outro (o pai não fecha ao clicar aqui). */
  ehSubmenu?: boolean;
  className?: string;
  children: ReactNode;
}

function retanguloDa(ancora: PopoutProps["ancora"]): Retangulo | null {
  if ("current" in ancora) {
    const r = ancora.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }
  return "left" in ancora ? { x: ancora.left, y: ancora.top, width: ancora.width, height: ancora.height } : ancora;
}

/**
 * Conta de posição com colisão. Provisória (cartão 0.4-popout completa com os
 * quatro lados, alinhamento e deslize).
 */
export function usePosicaoFlutuante(
  aberto: boolean,
  ancora: PopoutProps["ancora"],
  caixa: RefObject<HTMLElement | null>,
  lado: LadoDoPopout = "bottom",
  distancia = 8,
): { x: number; y: number; ladoFinal: LadoDoPopout } {
  const [pos, setPos] = useState({ x: -9999, y: -9999, ladoFinal: lado });
  useLayoutEffect(() => {
    if (!aberto) return;
    const r = retanguloDa(ancora);
    const el = caixa.current;
    if (!r || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let y = lado === "top" ? r.y - h - distancia : r.y + r.height + distancia;
    let ladoFinal = lado;
    if (y + h > window.innerHeight - 8) {
      y = r.y - h - distancia;
      ladoFinal = "top";
    }
    if (y < 8) y = 8;
    const x = Math.min(Math.max(8, r.x), window.innerWidth - w - 8);
    setPos({ x, y, ladoFinal });
  }, [aberto, ancora, caixa, lado, distancia]);
  return pos;
}

// Implementação provisória (cartão 0.4-popout substitui).
export function Popout({
  aberto,
  aoFechar,
  ancora,
  lado = "bottom",
  distancia = 8,
  largura,
  rotulo,
  semRespiro = true,
  ehSubmenu = false,
  className = "",
  children,
}: PopoutProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const { x, y } = usePosicaoFlutuante(aberto, ancora, caixa, lado, distancia);
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Element | null;
      if (caixa.current?.contains(alvo) || alvo?.closest("[data-submenu-de-popout]")) return;
      aoFechar();
    };
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("mousedown", fora);
    return () => {
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("mousedown", fora);
    };
  }, [aberto, aoFechar]);
  if (!aberto || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={caixa}
      role="dialog"
      aria-label={rotulo}
      data-submenu-de-popout={ehSubmenu || undefined}
      style={{ left: x, top: y, width: largura }}
      className={`anim-menu fixed z-[80] rounded-xl bg-background-surface-high shadow-popout ${semRespiro ? "" : "p-4"} ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
