"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  VELOCIDADE_DE_ARREMESSO,
  aparar,
  assentar,
  decidirEixo,
  engolirProximoClique,
  limitar,
  movimentoReduzido,
  pintarVeu,
  velocidadeDoGesto,
  type Amostra,
} from "@/hooks/useArrastoHorizontal";

/**
 * Arrastar uma folha inferior pela alça: ela desce com o dedo, o véu clareia na
 * mesma proporção, e soltar a assenta no ponto de parada mais próximo — ou a
 * fecha.
 *
 * Os limiares são os mesmos do arrasto horizontal (`useArrastoHorizontal`):
 * eixo decidido com mais de 10px, empate para a rolagem, e um arremesso manda
 * mais que a distância. Nenhum deles foi medido no Discord (ver o cabeçalho de
 * lá).
 *
 * ## Pontos de parada
 *
 * `paradas` são frações **da altura da folha** que ficam à vista: `[1]` é a
 * folha inteira (o padrão), `[0.5, 1]` para numa meia altura antes. **O acervo
 * não tem nenhuma captura de folha do Discord parada a meia altura** — a única
 * folha com escala conhecida, `discord-mobile-membros.png`, está na altura
 * cheia. Por isso o padrão é só a altura cheia, e a meia altura existe para
 * quem tiver a medida e a folha que para ali.
 *
 * ## Por que só pela alça
 *
 * O Discord também deixa puxar a folha pelo corpo quando a lista está no topo.
 * Com eventos de ponteiro isso não sai: o corpo precisa de `touch-action:
 * pan-y` para rolar, e com ele o navegador toma o arrasto para baixo (é uma
 * rolagem, mesmo no topo) e entrega `pointercancel`. O `touch-action` é lido no
 * `pointerdown` e não dá para trocar no meio do gesto. A alça, que não rola,
 * tem `touch-action: none` e fica com o gesto inteiro.
 */

/**
 * Os deslocamentos de repouso (px, 0 = folha inteira à vista) de cada parada,
 * na mesma ordem de `paradas`.
 */
export function deslocamentosDasParadas(altura: number, paradas: readonly number[]): number[] {
  return paradas.map((p) => Math.round(altura * (1 - limitar(p, 0, 1))));
}

/**
 * Onde a folha assenta ao soltar: o deslocamento de uma parada, ou `"fechar"`.
 *
 * - arremesso para baixo: a próxima parada abaixo de onde o dedo largou — ou
 *   fechar, se não houver;
 * - arremesso para cima: a próxima parada acima;
 * - sem arremesso: a mais perto, contando "fechada" como uma parada na altura
 *   toda. No empate fica aberta, que é o erro barato.
 */
export function decidirParada({
  deslocamento,
  velocidade,
  altura,
  paradas,
}: {
  deslocamento: number;
  velocidade: number;
  altura: number;
  paradas: readonly number[];
}): number | "fechar" {
  const abertas = [...new Set(deslocamentosDasParadas(altura, paradas))].sort((a, b) => a - b);
  if (abertas.length === 0 || altura <= 0) return "fechar";

  if (velocidade >= VELOCIDADE_DE_ARREMESSO) {
    const abaixo = abertas.find((d) => d > deslocamento);
    return abaixo ?? "fechar";
  }
  if (velocidade <= -VELOCIDADE_DE_ARREMESSO) {
    const acima = [...abertas].reverse().find((d) => d < deslocamento);
    return acima ?? abertas[0];
  }

  let melhor: number | "fechar" = abertas[0];
  let distancia = Math.abs(deslocamento - abertas[0]);
  for (const d of abertas.slice(1)) {
    const x = Math.abs(deslocamento - d);
    if (x < distancia) {
      melhor = d;
      distancia = x;
    }
  }
  if (Math.abs(altura - deslocamento) < distancia) melhor = "fechar";
  return melhor;
}

const useEfeitoDeLeiaute = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface OpcoesDoArrastoDeFolha {
  ligado: boolean;
  /** a caixa que desce (a folha em si). */
  folha: RefObject<HTMLElement>;
  /** o véu atrás dela, que clareia com o arrasto. */
  veu: RefObject<HTMLElement>;
  /** onde o dedo pega: a alça (e o título, se estiver dentro dela). */
  alca: RefObject<HTMLElement>;
  paradas?: readonly number[];
  /** índice em `paradas` onde a folha nasce; o padrão é a maior. */
  paradaInicial?: number;
  aoFechar: () => void;
}

export function useArrastoDeFolha({
  ligado,
  folha,
  veu,
  alca,
  paradas = [1],
  paradaInicial,
  aoFechar,
}: OpcoesDoArrastoDeFolha) {
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const paradasRef = useRef(paradas);
  paradasRef.current = paradas;
  /** deslocamento de repouso atual, em px. */
  const repouso = useRef(0);

  /*
    Nascer numa parada que não é a altura cheia. A `anim-folha` sobe até 0 e
    ali pararia; então ela é trocada, antes da primeira pintura, por uma
    transição até a parada certa.
  */
  useEfeitoDeLeiaute(() => {
    if (!ligado) return;
    const el = folha.current;
    if (!el) return;
    const ps = paradasRef.current;
    const indice = paradaInicial ?? ps.indexOf(Math.max(...ps));
    const inicial = deslocamentosDasParadas(el.offsetHeight, ps)[indice] ?? 0;
    repouso.current = inicial;
    if (inicial <= 0) return;
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = "translate3d(0, 100%, 0)";
    void el.getBoundingClientRect(); // força o quadro de partida
    assentar(el, `translate3d(0, ${inicial}px, 0)`, true);
    // o véu acompanha: `anim-overlay` já o traz do zero
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado]);

  useEffect(() => {
    if (!ligado) return;
    const pegador = alca.current;
    if (!pegador) return;

    let gesto: {
      id: number;
      x0: number;
      y0: number;
      travado: boolean;
      altura: number;
      amostras: Amostra[];
    } | null = null;

    const posicionar = (deslocamento: number, altura: number) => {
      const el = folha.current;
      if (!el) return;
      el.style.transform = `translate3d(0, ${deslocamento}px, 0)`;
      pintarVeu(veu.current, altura > 0 ? 1 - deslocamento / altura : 1);
    };

    const aoPressionar = (e: PointerEvent) => {
      if (gesto || !e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      gesto = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        travado: false,
        altura: folha.current?.offsetHeight ?? 0,
        amostras: [],
      };
    };

    const aoMover = (e: PointerEvent) => {
      const g = gesto;
      if (!g || e.pointerId !== g.id) return;
      const dy = e.clientY - g.y0;
      if (!g.travado) {
        const eixo = decidirEixo(e.clientX - g.x0, dy);
        if (eixo === null) return;
        if (eixo === "x") {
          gesto = null;
          return;
        }
        g.travado = true;
        g.y0 = e.clientY;
        g.amostras = [{ t: e.timeStamp, v: e.clientY }];
        try {
          pegador.setPointerCapture(e.pointerId);
        } catch {
          // já tomado pelo sistema; o cancel resolve
        }
        const el = folha.current;
        if (el) {
          // a `anim-folha` venceria o `transform` inline enquanto roda
          el.style.animation = "none";
          el.style.transition = "none";
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      g.amostras.push({ t: e.timeStamp, v: e.clientY });
      g.amostras = aparar(g.amostras, e.timeStamp);
      // movimento reduzido: o dedo não é acompanhado, só a soltura decide
      if (movimentoReduzido()) return;
      posicionar(limitar(repouso.current + (e.clientY - g.y0), 0, g.altura), g.altura);
    };

    const aoSoltar = (e: PointerEvent) => {
      const g = gesto;
      if (!g || e.pointerId !== g.id) return;
      gesto = null;
      if (!g.travado) return;
      g.amostras.push({ t: e.timeStamp, v: e.clientY });
      engolirProximoClique();
      const deslocamento = limitar(repouso.current + (e.clientY - g.y0), 0, g.altura);
      const destino = decidirParada({
        deslocamento,
        velocidade: velocidadeDoGesto(g.amostras),
        altura: g.altura,
        paradas: paradasRef.current,
      });
      const el = folha.current;
      if (destino === "fechar") {
        pintarVeu(veu.current, 0, true);
        assentar(el, "translate3d(0, 100%, 0)", true, () => fechar.current());
        return;
      }
      repouso.current = destino;
      pintarVeu(veu.current, g.altura > 0 ? 1 - destino / g.altura : 1, true);
      assentar(el, destino > 0 ? `translate3d(0, ${destino}px, 0)` : "", true);
    };

    const aoCancelar = (e: PointerEvent) => {
      const g = gesto;
      if (!g || e.pointerId !== g.id) return;
      gesto = null;
      if (!g.travado) return;
      const destino = repouso.current;
      pintarVeu(veu.current, g.altura > 0 ? 1 - destino / g.altura : 1, true);
      assentar(folha.current, destino > 0 ? `translate3d(0, ${destino}px, 0)` : "", true);
    };

    pegador.addEventListener("pointerdown", aoPressionar);
    window.addEventListener("pointermove", aoMover, true);
    window.addEventListener("pointerup", aoSoltar, true);
    window.addEventListener("pointercancel", aoCancelar, true);
    return () => {
      pegador.removeEventListener("pointerdown", aoPressionar);
      window.removeEventListener("pointermove", aoMover, true);
      window.removeEventListener("pointerup", aoSoltar, true);
      window.removeEventListener("pointercancel", aoCancelar, true);
    };
  }, [ligado, folha, veu, alca]);
}
