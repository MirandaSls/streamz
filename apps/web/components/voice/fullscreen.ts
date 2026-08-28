"use client";

import { useCallback, useEffect, type RefObject } from "react";
import { useVoice } from "@/stores/voice";

/**
 * Tela cheia de verdade (API do navegador), não um `position: fixed`.
 *
 * A diferença não é cosmética: só a Fullscreen API esconde a barra do navegador
 * e a do sistema, entra no modo de baixa latência do compositor e devolve o Esc
 * como saída — um `fixed inset-0` continua dentro da janela, com a aba à vista.
 *
 * O estado observável continua sendo o `telaCheia` da store; este módulo é
 * quem o mantém honesto quando o usuário sai pelo Esc ou pelo botão do sistema.
 */

/** O navegador suporta tela cheia neste elemento? */
export function suportaTelaCheia(): boolean {
  return typeof document !== "undefined" && !!document.fullscreenEnabled;
}

/** Entra/sai da tela cheia num elemento qualquer (usado também por tile). */
export async function alternarTelaCheiaDe(el: HTMLElement | null) {
  if (!el || typeof document === "undefined") return;
  try {
    if (document.fullscreenElement === el) await document.exitFullscreen();
    else await el.requestFullscreen();
  } catch {
    // negado por política de permissão ou já em transição: nada a fazer
  }
}

/**
 * Liga um palco à tela cheia e sincroniza o `telaCheia` da store com o que o
 * navegador de fato está fazendo.
 */
export function useTelaCheia(alvo: RefObject<HTMLElement | null>) {
  const telaCheia = useVoice((s) => s.telaCheia);
  const setTelaCheia = useVoice((s) => s.setTelaCheia);

  useEffect(() => {
    const aoTrocar = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", aoTrocar);
    return () => {
      document.removeEventListener("fullscreenchange", aoTrocar);
      // desmontar o palco em tela cheia deixaria a store mentindo
      setTelaCheia(false);
    };
  }, [setTelaCheia]);

  const alternar = useCallback(() => void alternarTelaCheiaDe(alvo.current), [alvo]);

  return { telaCheia, alternar };
}
