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
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

export type LadoDaDica = "top" | "right" | "bottom" | "left";
export type CorDaDica = "primaria" | "cinza" | "marca" | "perigo" | "positiva";

export interface TooltipProps {
  rotulo: string;
  lado?: LadoDaDica;
  /** ms antes de abrir no hover. Padrão 300. */
  atraso?: number;
  desabilitado?: boolean;
  cor?: CorDaDica;
  /** Atalho de teclado mostrado ao lado do texto. */
  atalho?: string;
  /** Um elemento só, que recebe os eventos de hover e foco. */
  children: ReactElement;
  className?: string;
}

/**
 * Dica do Discord: `.tooltip_c36707` / `.tooltipPrimary_c36707` em
 * `css-bruto/858942.086f3345af1722be.css` (cartão 0.4-tooltip).
 *
 * Fundo `--background-surface-high`, texto `--text-default` 14px peso 500
 * (`--font-weight-medium`) linha 16, padding 8×12 (`px-3 py-2`), raio 8
 * (`--radius-sm`), `max-width` 190, borda 1px `--border-subtle`, sombra
 * `--shadow-high`, `z-index` acima de modal (modal = z-50; aqui z-[100]).
 * Atraso de abrir no hover: 300 ms (o Discord abre em JS; o número não está no
 * CSS, é o que o app já usava e bate nos prints). Foco de teclado abre na
 * hora. Toque não abre. Distância do alvo: 8 (idem, não está no CSS).
 *
 * `components/ui/Tooltip.tsx` é o invólucro compatível para os consumidores
 * antigos (`label`/`side`/`shortcut`); esta é a implementação.
 */
export function Tooltip({
  rotulo,
  lado = "top",
  atraso = 300,
  desabilitado = false,
  cor = "primaria",
  atalho,
  children,
  className = "",
}: TooltipProps) {
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

  const abrir = useCallback(
    (imediato: boolean) => {
      window.clearTimeout(timer.current);
      if (imediato) {
        setAberto(true);
        return;
      }
      timer.current = window.setTimeout(() => setAberto(true), atraso);
    },
    [atraso],
  );

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
    setPos(posicionar(alvo, caixa, lado));
  }, [aberto, lado, rotulo]);

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
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": aberto ? id : undefined,
      })
    : children;

  // desabilitado devolve o alvo puro — sem span, sem listener, sem portal
  if (desabilitado) return children;

  const variante = VARIANTES[cor];

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
            className={`pointer-events-none fixed z-[100] max-w-[190px] rounded-lg border border-border-subtle px-3 py-2 text-text-sm font-medium leading-4 shadow-shadow-high anim-menu ${variante.caixa} ${variante.texto}`}
          >
            <span className="flex items-center gap-2">
              <span>{rotulo}</span>
              {atalho && (
                <kbd className="rounded bg-background-base-lowest px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none text-text-muted">
                  {atalho}
                </kbd>
              )}
            </span>
            {pos && <span aria-hidden="true" style={estiloSeta(pos, variante.seta)} />}
          </div>,
          document.body,
        )}
    </>
  );
}

/** folga entre o alvo e a caixa, igual nos quatro lados (como no Discord). */
const GAP = 8;
/** margem mínima até a borda da janela antes de inverter o lado. */
const EDGE = 8;
/**
 * Meia-largura da seta. `.tooltipPointer_c36707` é `border:5px solid
 * transparent` + `border-top:5px solid <cor>` — um triângulo de base 10
 * (5+5) e altura 5, não o 6/12 do código anterior.
 */
const ARROW = 5;

const OPOSTO: Record<LadoDaDica, LadoDaDica> = { top: "bottom", bottom: "top", left: "right", right: "left" };

interface Posicao {
  top: number;
  left: number;
  lado: LadoDaDica;
  /** centro do alvo no eixo transversal, para a seta apontar certo. */
  arrow: number;
}

/**
 * Calcula a posição da caixa a partir do retângulo do alvo, invertendo o lado
 * quando não couber. Sem isso o tooltip vaza pela borda da janela — o `top` dos
 * ícones da primeira linha e o `right` dos ícones do rail são os casos reais.
 */
function posicionar(alvo: DOMRect, caixa: DOMRect, preferido: LadoDaDica): Posicao {
  const cabe = (s: LadoDaDica) => {
    if (s === "top") return alvo.top - caixa.height - GAP >= EDGE;
    if (s === "bottom") return alvo.bottom + caixa.height + GAP <= window.innerHeight - EDGE;
    if (s === "left") return alvo.left - caixa.width - GAP >= EDGE;
    return alvo.right + caixa.width + GAP <= window.innerWidth - EDGE;
  };
  const lado = cabe(preferido) ? preferido : cabe(OPOSTO[preferido]) ? OPOSTO[preferido] : preferido;

  const fixar = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

  if (lado === "top" || lado === "bottom") {
    const centro = alvo.left + alvo.width / 2;
    const left = fixar(
      centro - caixa.width / 2,
      EDGE,
      Math.max(EDGE, window.innerWidth - caixa.width - EDGE),
    );
    return {
      lado,
      left,
      top: lado === "top" ? alvo.top - caixa.height - GAP : alvo.bottom + GAP,
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
    lado,
    top,
    left: lado === "left" ? alvo.left - caixa.width - GAP : alvo.right + GAP,
    arrow: fixar(centro - top, ARROW + 2, caixa.height - ARROW - 2),
  };
}

/**
 * As cinco cores da dica (`.tooltipPrimary/Grey/Brand/Red/Green_c36707`). A
 * seta usa a mesma cor do fundo, exceto `perigo`: o CSS do Discord aponta a
 * seta para `--border-feedback-critical` (vermelho opaco) enquanto o fundo é
 * `--background-feedback-critical`, que é vermelho a só 8% — a caixa fica
 * quase a cor do que está atrás, e é a seta opaca que "avisa" vermelho. Não
 * há print de referência dessa variante; ver `nao_verificado`.
 *
 * `cinza` mira `--primary-700` (`#1e1f22`), que é paleta crua e por isso fica
 * de fora do gerador (ADR-0009 §5, `PREFIXOS_FORA`). Usa-se
 * `background-base-low` (`#202024`), a superfície mais próxima do conjunto
 * gerado — diferença de 2 em cada canal RGB, abaixo do perceptível.
 *
 * Texto branco (`color:var(--white)` no Discord) também não tem token — o
 * `--white` cru está no mesmo `PREFIXOS_FORA`. Usa-se `text-overlay-light`
 * (`#ffffff`, gerado porque o nome não começa com "white"), que é o mesmo
 * valor.
 *
 * `marca` foge à regra branca: texto/ícone sobre a cor de marca é sempre
 * escuro (ADR-0009, "o que sobrevive da ADR-0004"), daí
 * `control-primary-text-default` em vez de `text-overlay-light`.
 */
const VARIANTES: Record<CorDaDica, { caixa: string; texto: string; seta: string }> = {
  primaria: {
    caixa: "bg-background-surface-high",
    texto: "text-text-default",
    seta: "var(--background-surface-high)",
  },
  cinza: {
    caixa: "bg-background-base-low",
    texto: "text-text-overlay-light",
    seta: "var(--background-base-low)",
  },
  marca: {
    caixa: "bg-control-primary-background-default",
    texto: "text-control-primary-text-default",
    seta: "var(--control-primary-background-default)",
  },
  perigo: {
    caixa: "bg-background-feedback-critical",
    texto: "text-text-overlay-light",
    seta: "var(--border-feedback-critical)",
  },
  positiva: {
    caixa: "bg-status-positive",
    texto: "text-text-overlay-light",
    seta: "var(--status-positive)",
  },
};

/** Estilo da seta a partir do lado escolhido — sempre apontando para o alvo. */
function estiloSeta(p: Posicao, corSeta: string): CSSProperties {
  const base: CSSProperties = { position: "absolute", width: 0, height: 0 };
  if (p.lado === "top") {
    return {
      ...base,
      top: "100%",
      left: p.arrow,
      marginLeft: -ARROW,
      borderLeft: `${ARROW}px solid transparent`,
      borderRight: `${ARROW}px solid transparent`,
      borderTop: `${ARROW}px solid ${corSeta}`,
    };
  }
  if (p.lado === "bottom") {
    return {
      ...base,
      bottom: "100%",
      left: p.arrow,
      marginLeft: -ARROW,
      borderLeft: `${ARROW}px solid transparent`,
      borderRight: `${ARROW}px solid transparent`,
      borderBottom: `${ARROW}px solid ${corSeta}`,
    };
  }
  if (p.lado === "left") {
    return {
      ...base,
      left: "100%",
      top: p.arrow,
      marginTop: -ARROW,
      borderTop: `${ARROW}px solid transparent`,
      borderBottom: `${ARROW}px solid transparent`,
      borderLeft: `${ARROW}px solid ${corSeta}`,
    };
  }
  return {
    ...base,
    right: "100%",
    top: p.arrow,
    marginTop: -ARROW,
    borderTop: `${ARROW}px solid transparent`,
    borderBottom: `${ARROW}px solid transparent`,
    borderRight: `${ARROW}px solid ${corSeta}`,
  };
}
