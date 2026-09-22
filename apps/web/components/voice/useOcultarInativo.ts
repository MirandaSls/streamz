"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Tempo de mouse parado antes de o palco ficar só com as pessoas. */
const INATIVO_MS = 3000;

/**
 * Atributo que marca, no DOM, o que é "moldura". Precisa existir no DOM (e
 * não só no React) porque quem o consulta é um ouvinte global — ver a rede
 * de segurança do `preso`.
 */
const MARCA_DA_MOLDURA = "data-moldura-da-call";

/**
 * Some com a moldura do palco (nome e controles) enquanto o mouse está parado.
 *
 * É o que faz uma chamada em tela cheia virar só as pessoas: qualquer coisa
 * permanentemente sobreposta ao vídeo compete com ele. O gesto de volta é o
 * mais barato possível — mover o mouse.
 *
 * `prender` mantém a moldura viva enquanto o ponteiro está **sobre** ela: os
 * controles não podem sumir debaixo do cursor no meio de um clique.
 */
export function useOcultarInativo(ms = INATIVO_MS) {
  const [visivel, setVisivel] = useState(true);
  const [preso, setPreso] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const acordar = useCallback(() => {
    setVisivel(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisivel(false), ms);
  }, [ms]);

  useEffect(() => {
    acordar();
    return () => window.clearTimeout(timer.current);
  }, [acordar]);

  useEffect(() => {
    if (!preso) return;
    window.clearTimeout(timer.current);
    setVisivel(true);
  }, [preso]);

  /*
    **A rede de segurança do `preso`.**

    `onPointerLeave` só dispara se o elemento ainda existir quando o ponteiro
    sai dele. Abrir o seletor de transmissão pela cápsula de controles quebra
    exatamente essa premissa: o modal nasce **dentro** dela (o nosso `Dialog`
    não é portal), o ponteiro passa a estar sobre o modal — sem `pointerleave`,
    porque não saiu da cápsula — e, quando o modal fecha, o elemento sob o
    cursor é **desmontado**. Remover um elemento debaixo do ponteiro não gera
    evento de saída em navegador nenhum. Resultado: `preso` ficava `true` para
    sempre e a moldura do palco nunca mais apagava.

    Por isso a verdade passa a ser onde o ponteiro **está**, e não o último
    evento que chegou: enquanto está preso, qualquer movimento confere se o
    alvo ainda descende de uma moldura viva. Só enquanto está preso — fora
    disso não há ouvinte global nenhum.

    Sobra um caso, e ele é aceitável: se o modal fechar e o mouse **não** se
    mexer mais, a moldura continua acesa até o próximo movimento. Antes disto,
    continuava acesa para sempre.
  */
  useEffect(() => {
    if (!preso) return;
    const conferir = (e: PointerEvent) => {
      const alvo = e.target as Element | null;
      if (alvo?.closest?.(`[${MARCA_DA_MOLDURA}]`)) return;
      setPreso(false);
      acordar();
    };
    document.addEventListener("pointermove", conferir, true);
    document.addEventListener("pointerdown", conferir, true);
    return () => {
      document.removeEventListener("pointermove", conferir, true);
      document.removeEventListener("pointerdown", conferir, true);
    };
  }, [preso, acordar]);

  /** Props para o elemento que é o palco (ele é quem escuta o movimento). */
  const doPalco = {
    onPointerMove: acordar,
    onPointerDown: acordar,
  };

  /** Props para a moldura que não pode sumir sob o cursor. */
  const daMoldura = {
    // marca no DOM: é por ela que o efeito acima confere onde o ponteiro está
    [MARCA_DA_MOLDURA]: "",
    onPointerEnter: () => setPreso(true),
    onPointerLeave: () => {
      setPreso(false);
      acordar();
    },
  };

  return { visivel: visivel || preso, acordar, doPalco, daMoldura };
}
