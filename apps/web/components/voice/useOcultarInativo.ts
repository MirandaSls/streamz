"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Tempo de mouse parado antes de o palco ficar só com as pessoas. */
const INATIVO_MS = 3000;

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

  /** Props para o elemento que é o palco (ele é quem escuta o movimento). */
  const doPalco = {
    onPointerMove: acordar,
    onPointerDown: acordar,
  };

  /** Props para a moldura que não pode sumir sob o cursor. */
  const daMoldura = {
    onPointerEnter: () => setPreso(true),
    onPointerLeave: () => {
      setPreso(false);
      acordar();
    },
  };

  return { visivel: visivel || preso, acordar, doPalco, daMoldura };
}
