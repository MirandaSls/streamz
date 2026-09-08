"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Caixa flutuante ancorada num botão — o popover de verdade, em portal.
 *
 * Existe porque `absolute` dentro da barra lateral não serve. O motivo original
 * era aritmético — a coluna tinha 240px e estas caixas têm ~290 —, e ele
 * caducou quando a coluna foi para 294. O motivo que fica é o de forma: a caixa
 * precisa crescer **para a direita, por cima do conteúdo**, e de dentro da
 * coluna ela não pode: ou é cortada pelo `overflow` de um ancestral, ou cresce
 * para a esquerda por cima do rail de servidores e sai da janela. Foi o que
 * aconteceu com a supressão de ruído.
 *
 * Repare que a conta de posição é presa à **janela**, não à coluna, e por isso
 * sobreviveu à mudança de largura sem ninguém tocar nela.
 *
 * Em portal, com posição medida e presa à janela, o problema deixa de existir:
 * a caixa abre onde couber e nunca é cortada por `overflow` de ancestral.
 *
 * A direção é a do print: sobe a partir do botão e cresce **para a direita**,
 * por cima do conteúdo. Sem espaço em cima, desce — é melhor descer que sumir.
 */

/** folga entre o botão e a caixa, e da caixa até a borda da janela. */
const FOLGA = 8;

export default function PopoverFlutuante({
  ancora,
  aberto,
  onFechar,
  rotulo,
  largura = 300,
  denso = false,
  semRespiro = false,
  children,
}: {
  /** o botão que abriu — a caixa se posiciona por ele. */
  ancora: RefObject<HTMLElement | null>;
  aberto: boolean;
  onFechar: () => void;
  /** rótulo acessível: a caixa é um `dialog` sem título visível fixo. */
  rotulo: string;
  largura?: number;
  /** caixa que é lista de itens: o respiro vem dos itens, não da moldura. */
  denso?: boolean;
  /**
   * O filho pinta a caixa inteira, de borda a borda — sem respiro e com o
   * fundo dele por cima do da moldura.
   *
   * É o caso do painel de efeitos sonoros: ele tem cabeçalho com respiro
   * próprio, coluna lateral colada na borda esquerda e corpo rolável. Com o
   * `p-3` da moldura, a coluna lateral flutuaria a 12px da borda e o cabeçalho
   * ganharia respiro duas vezes.
   */
  semRespiro?: boolean;
  children: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // medir antes de pintar: com a posição num efeito comum a caixa aparece um
  // quadro no canto superior esquerdo e "pula" para o lugar
  useLayoutEffect(() => {
    if (!aberto) {
      setPos(null);
      return;
    }
    const calcular = () => {
      const alvo = ancora.current?.getBoundingClientRect();
      const c = caixa.current?.getBoundingClientRect();
      if (!alvo || !c) return;
      const acima = alvo.top - c.height - FOLGA;
      const top = acima >= FOLGA ? acima : Math.min(alvo.bottom + FOLGA, window.innerHeight - c.height - FOLGA);
      const left = Math.max(
        FOLGA,
        Math.min(alvo.left, window.innerWidth - c.width - FOLGA),
      );
      setPos({ top: Math.max(FOLGA, top), left });
    };
    calcular();
    window.addEventListener("resize", calcular);
    return () => window.removeEventListener("resize", calcular);
  }, [aberto, ancora]);

  // Fechar por clique fora e por Esc mora aqui, e não em quem abre: em portal a
  // caixa não é filha do botão, então um `contains` do lado de lá leria clique
  // dentro da caixa como clique fora e ela se fecharia ao primeiro toque.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || ancora.current?.contains(alvo)) return;
      // Um submenu desta caixa (os menus de áudio do rodapé) também mora num
      // portal, então não é descendente dela no DOM. Sem esta linha o primeiro
      // `mousedown` num aparelho fechava o popover — e, com ele, o submenu —
      // antes de o clique chegar ao botão: escolher microfone não funcionava.
      if (alvo instanceof Element && alvo.closest("[data-submenu-de-popover]")) return;
      onFechar();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // o Esc global também fecha coisas; parar aqui evita fechar duas de uma vez
      e.stopPropagation();
      onFechar();
    };
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc, true);
    };
  }, [aberto, onFechar, ancora]);

  if (!aberto || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={caixa}
      role="dialog"
      aria-label={rotulo}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: largura,
        visibility: pos ? "visible" : "hidden",
      }}
      className={`anim-menu fixed z-[90] rounded-lg bg-overlay shadow-high ${
        semRespiro ? "overflow-hidden" : denso ? "p-1.5" : "p-3"
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}
