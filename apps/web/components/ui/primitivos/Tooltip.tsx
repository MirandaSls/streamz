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
  type ReactNode,
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
  /**
   * Linha secundária abaixo do `rotulo`, como "2 membros" na dica de uma
   * conversa em grupo do rail. Fica numa linha própria, a 4px do rótulo:
   * `.tooltipWithShortcut_fa450d` e `.navigationTooltip_edbb22` empilham as
   * linhas da dica com `flex-direction:column;gap:var(--space-4)`
   * (`css-bruto/909091.*.css` e `995941.*.css`). O texto continua alinhado à
   * esquerda (`.guildTooltipWrapper_b1f768{text-align:start}`), e o
   * `max-width` de 190 vale para as duas linhas.
   *
   * **Tamanho, peso e cor da linha não foram medidos.** Nenhum print 1:1 do
   * acervo mostra dica de duas linhas, e o CSS não traz a classe da linha
   * (o Discord pinta com um `Text` de variante no JS). Até haver medida, usa o
   * mesmo par de texto secundário do resto dos primitivos (`Campo.ajuda`:
   * 12px, peso normal, `--text-muted`). Nas cores que não são `primaria` a
   * linha herda a tinta da caixa: cinza sobre limão ou sobre vermelho ficaria
   * ilegível.
   */
  subtitulo?: ReactNode;
  /**
   * Tira o `max-width` de 190 e não deixa o texto quebrar. É a dica da hora
   * da mensagem: `.timestampTooltip_c19a55{max-width:unset}` no CSS do
   * Discord, e "terça-feira, 8 de setembro de 2026 às 17:14" não cabe em 190 —
   * quebrava em duas linhas, que o Discord não mostra.
   */
  larguraLivre?: boolean;
  /**
   * `servidor`: a dica do rail (`.guildTooltipWrapper_b1f768{max-width:196px}`),
   * com corpo de 16px e linha de 20. No print 1:1 `2026-09-01 113513.png` a
   * dica "Mensagens diretas" mede 36px de altura com a borda (y 33–68) e a
   * versal "M" tem 11px (y 45–55), o corpo de 16 — contra os 14px/16 das
   * outras dicas: 1 + 8 + 20 + 8 + 1 = 36. Padrão: `padrao`.
   */
  tamanho?: "padrao" | "servidor";
  /**
   * Folga em px entre o alvo e a caixa. Padrão 8. O rail usa 12: no print
   * `2026-09-01 113513.png` (linha y=40) o ícone termina em x=61 e a caixa da
   * dica começa em x=74.
   */
  distancia?: number;
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
  subtitulo,
  larguraLivre = false,
  tamanho = "padrao",
  distancia = GAP,
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
    setPos(posicionar(alvo, caixa, lado, distancia));
    // a segunda linha muda a altura da caixa, então também reposiciona
  }, [aberto, lado, rotulo, subtitulo, distancia]);

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
  // largura e corpo numa classe só por caso: duas classes de `max-width` (ou
  // de `font-size`) competindo dependeriam da ordem do CSS gerado
  const largura = larguraLivre
    ? "max-w-none whitespace-nowrap"
    : tamanho === "servidor"
      ? "max-w-[196px]"
      : "max-w-[190px]";
  const corpo = tamanho === "servidor" ? "text-text-md leading-5" : "text-text-sm leading-4";

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
            className={`pointer-events-none fixed z-[100] rounded-lg border border-border-subtle px-3 py-2 font-medium shadow-shadow-high anim-menu ${largura} ${corpo} ${variante.caixa} ${variante.texto}`}
          >
            <span className="flex items-center gap-2">
              <span>{rotulo}</span>
              {atalho && (
                <kbd className="rounded bg-background-base-lowest px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none text-text-muted">
                  {atalho}
                </kbd>
              )}
            </span>
            {subtitulo != null && subtitulo !== false && subtitulo !== "" ? (
              // `mt-1` = o `gap:var(--space-4)` das dicas de duas linhas; o
              // resto da linha é "não medido" (ver a prop)
              <span className={`mt-1 block text-text-xs font-normal ${cor === "primaria" ? "text-text-muted" : ""}`}>
                {subtitulo}
              </span>
            ) : null}
            {pos && <span aria-hidden="true" style={estiloSeta(pos, variante.seta)} />}
          </div>,
          document.body,
        )}
    </>
  );
}

/** folga padrão entre o alvo e a caixa, igual nos quatro lados (prop `distancia`). */
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
function posicionar(alvo: DOMRect, caixa: DOMRect, preferido: LadoDaDica, gap: number): Posicao {
  const cabe = (s: LadoDaDica) => {
    if (s === "top") return alvo.top - caixa.height - gap >= EDGE;
    if (s === "bottom") return alvo.bottom + caixa.height + gap <= window.innerHeight - EDGE;
    if (s === "left") return alvo.left - caixa.width - gap >= EDGE;
    return alvo.right + caixa.width + gap <= window.innerWidth - EDGE;
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
      top: lado === "top" ? alvo.top - caixa.height - gap : alvo.bottom + gap,
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
    left: lado === "left" ? alvo.left - caixa.width - gap : alvo.right + gap,
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
