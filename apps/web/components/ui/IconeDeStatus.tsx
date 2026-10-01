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
 * aparece o que estiver atrás — a superfície do menu ou, no avatar, a da linha
 * (o `Avatar` fura a foto embaixo do selo). Medido na `docs/Reference/Captura de tela 2026-09-03 161607.png`
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
/**
 * As cores de presença do Discord, que não são as de aviso e perigo. Saem da
 * paleta nova (`--green-new-38`, `--yellow-new-30`, `--red-new-46`,
 * `--neutral-34`) e não dos `--icon-status-*` semânticos, que o Discord define
 * mas não usa no selo: nos prints sem desvio de captura (`2026-08-31 101638`,
 * lista de DMs, e `2026-09-03 180020`, seletor de status) o miolo do selo é
 * #45a366, #ffc04e, #da3e44 e #84858d — exatamente estas quatro. Os semânticos
 * (#3d9e60, #ffcb6e, #dc4247, #9d9ea5) erram até 32 pontos num canal; o pior
 * aos olhos era o offline, 25 mais claro em todos os três.
 */
export const COR_DO_STATUS: Record<UserStatus, string> = {
  ONLINE: "text-green-new-38",
  IDLE: "text-yellow-new-30",
  DND: "text-red-new-46",
  OFFLINE: "text-neutral-34",
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
