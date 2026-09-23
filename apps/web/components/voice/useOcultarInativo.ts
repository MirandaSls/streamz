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
 * O que conta como "o ponteiro ainda está na moldura" para a rede de segurança.
 *
 * Não é só a marca: **tudo que a cápsula de controles abre nasce em portal**
 * (as setas de microfone e câmera, o painel de sons, o seletor de transmissão),
 * e no DOM — que é a árvore que este seletor consulta — o portal está em
 * `body`, fora da moldura. Sem citá-lo aqui, parar o mouse sobre uma lista de
 * microfones apagaria a cápsula que ancora a lista.
 *
 * Os quatro últimos são a mesma lista de camadas do `Popout` (`data-popout` é
 * o que ele marca; `dialog` cobre o `Modal`, `menu` o menu de contexto).
 * Repetida, e não importada, porque lá ela é interna ao arquivo — e uma camada
 * nova que se marque com `data-popout` já entra nas duas de uma vez.
 */
const SELETOR_DA_MOLDURA = [
  `[${MARCA_DA_MOLDURA}]`,
  "[data-popout]",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
].join(",");

/**
 * As props que a moldura recebe — **a marca no DOM inclusive**.
 *
 * O atributo está no tipo, e não só no objeto que o hook devolve, porque ele
 * não é enfeite: é por ele que a rede de segurança reconhece onde o ponteiro
 * está. Quem desestruturasse `moldura` para repassar só os dois manipuladores
 * perderia a marca **em silêncio**, e o ouvinte global passaria a desligar o
 * `preso` em cima dos próprios controles. Com o tipo, isso deixa de compilar.
 */
export type PropsDaMoldura = {
  [MARCA_DA_MOLDURA]: string;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

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

    O defeito que a trouxe: abrir o seletor de transmissão pela cápsula de
    controles prendia a moldura acesa para sempre. A causa é a **discordância
    entre a árvore React e a árvore do DOM**. O `Modal` (e todo `Popout`) é um
    `createPortal` para o `body`: no DOM ele não está dentro da cápsula, mas na
    árvore React continua sendo descendente dela — e o `onPointerLeave`
    *sintético* do React calcula o ancestral comum pela **árvore React**. Para
    o React o ponteiro nunca saiu da cápsula, então nenhum `leave` chega. E
    quando o modal fecha, o elemento sob o cursor é **desmontado**: remover um
    elemento debaixo do ponteiro não gera evento de saída em navegador nenhum.
    Sem `leave` na ida e sem `leave` na volta, `preso` ficava `true` para sempre.

    Por isso a verdade passa a ser onde o ponteiro **está**, e não o último
    evento que chegou: enquanto está preso, qualquer movimento confere se o alvo
    ainda descende de uma moldura viva. A consulta é ao **DOM** — a árvore em
    que o portal já *não* é filho da cápsula —, e é justamente isso que faz o
    conserto funcionar. Só enquanto está preso; fora disso não há ouvinte global
    nenhum.

    A mesma discordância é o que obriga `SELETOR_DA_MOLDURA` a aceitar também os
    portais: no DOM eles estão longe da marca, e conferir só a marca desligaria
    o `preso` ao primeiro movimento sobre um menu aberto pela própria cápsula —
    a regressão que o `preso` existe para evitar.

    Sobra um caso, e ele é aceitável: se o modal fechar e o mouse **não** se
    mexer mais, a moldura continua acesa até o próximo movimento. Antes disto,
    continuava acesa para sempre.
  */
  useEffect(() => {
    if (!preso) return;
    const conferir = (e: PointerEvent) => {
      const alvo = e.target as Element | null;
      if (alvo?.closest?.(SELETOR_DA_MOLDURA)) return;
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
  const daMoldura: PropsDaMoldura = {
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
