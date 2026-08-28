"use client";

import { useLayoutEffect, useRef, useState, type UIEvent } from "react";

/** Distância do fim em que ainda consideramos que o usuário está "no fim". */
const BOTTOM_THRESHOLD_PX = 120;
/** Distância do topo que dispara a carga do histórico anterior. */
const TOP_TRIGGER_PX = 80;

/**
 * Rolagem de uma lista de mensagens.
 *
 * A regra que faltava: só acompanhar o fim quando o usuário já está no fim.
 * Antes, qualquer mensagem nova arrancava quem estivesse lendo histórico. Quem
 * está longe do fim recebe um aviso ("mensagens novas") em vez de um pulo.
 *
 * Também preserva a posição ao paginar para trás: guardamos a altura antes do
 * prepend e reposicionamos pela diferença, de modo que a linha lida continue
 * embaixo do olho.
 */
export function useStickyScroll(
  items: { id: string }[],
  options?: { onReachTop?: () => void; canLoadOlder?: boolean },
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const heightBeforeLoadRef = useRef(0);
  const firstIdRef = useRef<string | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
    atBottomRef.current = atBottom;
    // o botão de "voltar ao presente" acompanha a posição, não a chegada de
    // mensagem: no Discord ele está lá sempre que você não está no fim
    if (atBottom === showJump) setShowJump(!atBottom);
    if (el.scrollTop < TOP_TRIGGER_PX && options?.canLoadOlder && options.onReachTop) {
      heightBeforeLoadRef.current = el.scrollHeight;
      options.onReachTop();
    }
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (items.length === 0) {
      firstIdRef.current = null;
      lastIdRef.current = null;
      return;
    }
    const firstId = items[0].id;
    const lastId = items[items.length - 1].id;
    const wasEmpty = firstIdRef.current === null;
    const appended = lastIdRef.current !== lastId;
    const prepended = !wasEmpty && firstIdRef.current !== firstId;
    firstIdRef.current = firstId;
    lastIdRef.current = lastId;

    if (wasEmpty) {
      el.scrollTop = el.scrollHeight; // primeira carga: começa no fim
      atBottomRef.current = true;
      setShowJump(false);
      return;
    }
    // a ordem importa: uma mensagem nova pode ter cortado o topo pela janela de
    // retenção, e nesse caso o que vale é acompanhar o fim, não o prepend
    if (appended) {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
      else setShowJump(true);
      return;
    }
    if (prepended) el.scrollTop = el.scrollHeight - heightBeforeLoadRef.current;
  }, [items]);

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowJump(false);
  }

  return { scrollRef, handleScroll, showJump, jumpToLatest };
}
