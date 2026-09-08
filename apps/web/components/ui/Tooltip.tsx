"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Side = "top" | "right" | "bottom" | "left";

/** folga entre o alvo e a caixa, igual nos quatro lados (como no Discord). */
const GAP = 8;
/** margem mínima até a borda da janela antes de inverter o lado. */
const EDGE = 8;
/** meia-largura da seta. */
const ARROW = 6;
/** o tooltip só aparece depois de uma pausa deliberada sobre o alvo. */
const DELAY_MS = 300;

const OPOSTO: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

interface Posicao {
  top: number;
  left: number;
  side: Side;
  /** centro do alvo no eixo transversal, para a seta apontar certo. */
  arrow: number;
}

/**
 * Calcula a posição da caixa a partir do retângulo do alvo, invertendo o lado
 * quando não couber. Sem isso o tooltip vaza pela borda da janela — o `top` dos
 * ícones da primeira linha e o `right` dos ícones do rail são os casos reais.
 */
function posicionar(alvo: DOMRect, caixa: DOMRect, preferido: Side): Posicao {
  const cabe = (s: Side) => {
    if (s === "top") return alvo.top - caixa.height - GAP >= EDGE;
    if (s === "bottom") return alvo.bottom + caixa.height + GAP <= window.innerHeight - EDGE;
    if (s === "left") return alvo.left - caixa.width - GAP >= EDGE;
    return alvo.right + caixa.width + GAP <= window.innerWidth - EDGE;
  };
  const side = cabe(preferido) ? preferido : cabe(OPOSTO[preferido]) ? OPOSTO[preferido] : preferido;

  const fixar = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

  if (side === "top" || side === "bottom") {
    const centro = alvo.left + alvo.width / 2;
    const left = fixar(
      centro - caixa.width / 2,
      EDGE,
      Math.max(EDGE, window.innerWidth - caixa.width - EDGE),
    );
    return {
      side,
      left,
      top: side === "top" ? alvo.top - caixa.height - GAP : alvo.bottom + GAP,
      arrow: fixar(centro - left, ARROW + 2, caixa.width - ARROW - 2),
    };
  }
  const centro = alvo.top + alvo.height / 2;
  const top = fixar(
    centro - caixa.height / 2,
    EDGE,
    Math.max(EDGE, window.innerHeight - caixa.height - EDGE),
  );
  return {
    side,
    top,
    left: side === "left" ? alvo.left - caixa.width - GAP : alvo.right + GAP,
    arrow: fixar(centro - top, ARROW + 2, caixa.height - ARROW - 2),
  };
}

/** Estilo da seta a partir do lado escolhido — sempre apontando para o alvo. */
function estiloSeta(p: Posicao): React.CSSProperties {
  const cor = "#0B0B0F"; // `void`, o mesmo fundo da caixa
  const base: React.CSSProperties = { position: "absolute", width: 0, height: 0 };
  if (p.side === "top") {
    return {
      ...base,
      top: "100%",
      left: p.arrow,
      marginLeft: -ARROW,
      borderLeft: `${ARROW}px solid transparent`,
      borderRight: `${ARROW}px solid transparent`,
      borderTop: `${ARROW}px solid ${cor}`,
    };
  }
  if (p.side === "bottom") {
    return {
      ...base,
      bottom: "100%",
      left: p.arrow,
      marginLeft: -ARROW,
      borderLeft: `${ARROW}px solid transparent`,
      borderRight: `${ARROW}px solid transparent`,
      borderBottom: `${ARROW}px solid ${cor}`,
    };
  }
  if (p.side === "left") {
    return {
      ...base,
      left: "100%",
      top: p.arrow,
      marginTop: -ARROW,
      borderTop: `${ARROW}px solid transparent`,
      borderBottom: `${ARROW}px solid transparent`,
      borderLeft: `${ARROW}px solid ${cor}`,
    };
  }
  return {
    ...base,
    right: "100%",
    top: p.arrow,
    marginTop: -ARROW,
    borderTop: `${ARROW}px solid transparent`,
    borderBottom: `${ARROW}px solid transparent`,
    borderRight: `${ARROW}px solid ${cor}`,
  };
}

/**
 * Tooltip escuro com seta, como o do Discord.
 *
 * Medido no print `2026-09-02 152343` ("Ver pedidos de amizade"): 34 de
 * altura com borda de 1px, texto de 14/600 em linha de 16, padding 8x12, raio
 * 8, seta de 6 sem borda.
 *
 * Renderiza em portal e calcula a posição na hora: qualquer ancestral com
 * `overflow-hidden` (popovers, pickers, o cabeçalho do canal) cortaria uma
 * caixa posicionada por CSS puro. `shortcut` desenha a tecla ao lado do rótulo,
 * como nos botões de voz.
 */
export default function Tooltip({
  label,
  side = "top",
  shortcut,
  children,
  className = "",
}: {
  label: string;
  side?: Side;
  /** atalho mostrado em pílula à direita do rótulo. */
  shortcut?: string;
  children: ReactNode;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<Posicao | null>(null);
  const alvoRef = useRef<HTMLSpanElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  /**
   * O tipo do último ponteiro que encostou no alvo.
   *
   * **Dedo não é cursor.** `pointerenter` dispara também no toque, e o
   * `pointerleave` que o desfaria pode só chegar no próximo toque em outro
   * lugar — no iOS foi assim: um toque no carimbo de hora deixava a caixa
   * "terça-feira, 8 de setembro de 2026 às 17:14" parada sobre a conversa
   * (visto em 390×844). E tocar num `<button>` no Chrome do Android dá foco a
   * ele, que abriria a dica pelo outro caminho.
   *
   * Então: a dica só nasce de um ponteiro **do tipo mouse**, e o foco só a
   * abre quando não veio de um toque — o que preserva o teclado (foco sem
   * ponteiro nenhum) e o desktop inteiro.
   */
  const ultimoPonteiro = useRef<string>("");

  const abrir = useCallback((imediato: boolean) => {
    window.clearTimeout(timer.current);
    if (imediato) {
      setAberto(true);
      return;
    }
    timer.current = window.setTimeout(() => setAberto(true), DELAY_MS);
  }, []);

  const fechar = useCallback(() => {
    window.clearTimeout(timer.current);
    setAberto(false);
    setPos(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!aberto) return;
    const alvo = alvoRef.current?.getBoundingClientRect();
    const caixa = caixaRef.current?.getBoundingClientRect();
    if (!alvo || !caixa) return;
    setPos(posicionar(alvo, caixa, side));
  }, [aberto, side, label]);

  // rolar ou redimensionar deixaria a caixa parada longe do alvo
  useEffect(() => {
    if (!aberto) return;
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto, fechar]);

  const descrito = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": aberto ? id : undefined,
      })
    : children;

  return (
    <>
      <span
        ref={alvoRef}
        className={`inline-flex ${className}`}
        onPointerDownCapture={(e) => {
          ultimoPonteiro.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          ultimoPonteiro.current = e.pointerType;
          if (e.pointerType === "mouse") abrir(false);
        }}
        onPointerLeave={fechar}
        onFocusCapture={() => {
          if (ultimoPonteiro.current === "touch" || ultimoPonteiro.current === "pen") return;
          abrir(true);
        }}
        onBlurCapture={fechar}
      >
        {descrito}
      </span>
      {aberto &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={caixaRef}
            id={id}
            role="tooltip"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className="pointer-events-none fixed z-[100] max-w-[280px] rounded-lg border border-border bg-void px-3 py-2 text-sm font-semibold leading-4 text-txt-primary shadow-high anim-menu"
          >
            <span className="flex items-center gap-2">
              <span>{label}</span>
              {shortcut && (
                <kbd className="rounded bg-panel px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none text-txt-muted">
                  {shortcut}
                </kbd>
              )}
            </span>
            {pos && <span aria-hidden="true" style={estiloSeta(pos)} />}
          </div>,
          document.body,
        )}
    </>
  );
}
