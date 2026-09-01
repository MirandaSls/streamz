"use client";

import { IconContext } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * Define o peso dos ícones para o app inteiro.
 *
 * `fill` num lugar só, e não em cada `<Icone weight="fill" />`: um esquecido
 * apareceria como um contorno solitário no meio de uma barra sólida, que é
 * justamente o defeito que esta troca veio corrigir.
 *
 * `duotone`, `bold` e companhia continuam disponíveis por ícone quando algum
 * caso pedir — o contexto é o padrão, não uma trava.
 */
export default function PesoDosIcones({ children }: { children: ReactNode }) {
  return <IconContext.Provider value={{ weight: "fill" }}>{children}</IconContext.Provider>;
}
