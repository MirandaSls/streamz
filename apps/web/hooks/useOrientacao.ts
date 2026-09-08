"use client";

import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Retrato ou paisagem — a pergunta que só a chamada faz.
 *
 * Girar o telefone durante uma call não é um detalhe: é o gesto de "quero ver
 * essa transmissão", e a tela tem de responder com o vídeo ocupando tudo e os
 * controles saindo da frente. Nas outras telas do app a rotação não muda nada
 * (a conversa continua uma lista), e por isso isto não mora no `useEhMobile`.
 *
 * `(orientation: landscape)` e não uma comparação de `innerWidth`/`innerHeight`:
 * a consulta de mídia é reavaliada pelo navegador no mesmo quadro do giro, e não
 * precisa de um ouvinte de `resize` que dispara também quando o teclado abre.
 *
 * Mesma disciplina do `useEhMobile`: a primeira renderização é **sempre**
 * `false` (o servidor não tem `matchMedia`), e quem troca é um `useLayoutEffect`
 * — antes da pintura, então não há um quadro com o leiaute errado.
 */
export const CONSULTA_PAISAGEM = "(orientation: landscape)";

const useEfeitoDeLeiaute = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** `true` quando a janela está mais larga que alta. */
export function useEhPaisagem(): boolean {
  const [paisagem, setPaisagem] = useState(false);

  useEfeitoDeLeiaute(() => {
    if (typeof window.matchMedia !== "function") return;
    const consulta = window.matchMedia(CONSULTA_PAISAGEM);
    const aplicar = () => setPaisagem(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return paisagem;
}
