"use client";

/**
 * Se o Shift está pressionado agora.
 *
 * Existe porque o item de menu de contexto só recebe `onSelect: () => void` —
 * sem o evento não dá para saber se o clique veio com Shift, e é justamente o
 * Shift que faz "Apagar mensagem" pular a confirmação, como no Discord.
 */
let pressionado = false;

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") pressionado = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") pressionado = false;
  });
  // voltar para a janela com a tecla já solta deixaria o estado grudado
  window.addEventListener("blur", () => {
    pressionado = false;
  });
}

export function shiftPressionado(): boolean {
  return pressionado;
}
