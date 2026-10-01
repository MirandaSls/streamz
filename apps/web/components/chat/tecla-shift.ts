"use client";

import { useSyncExternalStore } from "react";

/**
 * Se o Shift está pressionado agora.
 *
 * Existe porque o item de menu de contexto só recebe `onSelect: () => void` —
 * sem o evento não dá para saber se o clique veio com Shift, e é justamente o
 * Shift que faz "Apagar mensagem" pular a confirmação, como no Discord.
 */
let pressionado = false;
const assinantes = new Set<() => void>();

// só notifica quando o valor muda: keydown repete enquanto a tecla está presa
function definir(valor: boolean) {
  if (pressionado === valor) return;
  pressionado = valor;
  assinantes.forEach((f) => f());
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") definir(true);
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") definir(false);
  });
  // voltar para a janela com a tecla já solta deixaria o estado grudado
  window.addEventListener("blur", () => definir(false));
}

function assinar(f: () => void) {
  assinantes.add(f);
  return () => {
    assinantes.delete(f);
  };
}

export function shiftPressionado(): boolean {
  return pressionado;
}

/**
 * Versão reativa de `shiftPressionado`: a barra de ações da mensagem troca de
 * conteúdo enquanto o Shift está segurado. No servidor é sempre `false`.
 */
export function useShiftSegurado(): boolean {
  return useSyncExternalStore(assinar, shiftPressionado, () => false);
}
