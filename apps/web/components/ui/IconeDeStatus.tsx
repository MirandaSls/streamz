"use client";

import { useId } from "react";
import type { UserStatus } from "@streamz/shared";

/**
 * As quatro formas de status do Discord, num lugar só.
 *
 * Cada estado tem **forma**, não só cor — é o que deixa o estado legível para
 * quem não distingue as cores, e é como o Discord desenha:
 *
 * | estado | forma |
 * |---|---|
 * | `ONLINE` | disco cheio |
 * | `IDLE` | lua crescente (disco menos um círculo deslocado para cima/esquerda) |
 * | `DND` | disco com um traço horizontal vazado no meio |
 * | `OFFLINE` | anel (disco com um furo central de metade do diâmetro) |
 *
 * Os recortes são **vazados** (`mask`), não pintados por cima: por dentro
 * aparece o que estiver atrás — a superfície do menu, ou o fundo do selo no
 * avatar. Medido na `docs/Reference/Captura de tela 2026-09-03 161607.png`
 * (ícone de 10px no menu de status), com as proporções em fração do diâmetro:
 *
 * | medida | fração | em 10px |
 * |---|---|---|
 * | recorte da lua: centro | 0,25 × d, 0,25 × d | (2,5; 2,5) |
 * | recorte da lua: raio | 0,375 × d | 3,75 |
 * | traço do "não perturbe" | 0,75 × d por 0,25 × d, raio 0,125 × d | 7,5 × 2,5 |
 * | furo do anel: diâmetro | 0,5 × d | 5 |
 *
 * O `viewBox` é 16 para que essas frações caiam em números inteiros.
 */
export const COR_DO_STATUS: Record<UserStatus, string> = {
  ONLINE: "text-green",
  IDLE: "text-yellow",
  DND: "text-red",
  OFFLINE: "text-txt-faint",
};

export default function IconeDeStatus({
  status,
  className = "",
}: {
  status: UserStatus;
  className?: string;
}) {
  const mascara = useId();
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`${COR_DO_STATUS[status]} ${className}`}
    >
      <mask id={mascara}>
        <circle cx="8" cy="8" r="8" fill="white" />
        {status === "IDLE" && <circle cx="4" cy="4" r="6" fill="black" />}
        {status === "DND" && <rect x="2" y="6" width="12" height="4" rx="2" fill="black" />}
        {status === "OFFLINE" && <circle cx="8" cy="8" r="4" fill="black" />}
      </mask>
      <circle cx="8" cy="8" r="8" fill="currentColor" mask={`url(#${mascara})`} />
    </svg>
  );
}
