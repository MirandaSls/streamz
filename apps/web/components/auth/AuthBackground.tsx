"use client";

import { useId } from "react";

/**
 * Fundo das telas de conta: uma cena da marca cobrindo a viewport inteira, no
 * lugar dos dois gradientes chapados que havia antes.
 *
 * É desenho vetorial nosso — o balão de fala do símbolo, repetido em diagonal —
 * e não uma imagem: pesa alguns bytes, escala em qualquer tela e acompanha a
 * paleta por token, sem um asset a versionar. `slice` garante que a cena cubra a
 * janela em qualquer proporção, como faria um `background-size: cover`.
 */

/** O balão do símbolo reduzido ao tamanho do ladrilho (56×56 no tile de 112). */
const BALAO_TILE =
  "M14 8 H46 A7 7 0 0 1 53 15 V37 A7 7 0 0 1 46 44 H30 L20 54 V44 H14 A7 7 0 0 1 7 37 V15 A7 7 0 0 1 14 8 Z";

export default function AuthBackground() {
  const id = useId();
  const padrao = `padrao-${id}`;
  const brilho = `brilho-${id}`;
  const vinheta = `vinheta-${id}`;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <defs>
          <pattern
            id={padrao}
            width="112"
            height="112"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-12)"
          >
            <path d={BALAO_TILE} fill="none" stroke="#9BE31F" strokeWidth="3" />
          </pattern>
          <radialGradient id={brilho}>
            <stop offset="0%" stopColor="#9BE31F" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#9BE31F" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={vinheta}>
            <stop offset="55%" stopColor="#0B0B0F" stopOpacity="0" />
            <stop offset="100%" stopColor="#0B0B0F" stopOpacity="0.92" />
          </radialGradient>
        </defs>

        <rect width="1440" height="900" fill="#0B0B0F" />
        <ellipse cx="220" cy="120" rx="620" ry="440" fill={`url(#${brilho})`} />
        <ellipse cx="1320" cy="880" rx="560" ry="400" fill={`url(#${brilho})`} opacity="0.5" />
        {/* os balões ficam bem apagados: é textura, não ilustração em primeiro plano */}
        <rect width="1440" height="900" fill={`url(#${padrao})`} opacity="0.06" />
        {/* a vinheta escurece as bordas para o cartão ganhar contraste no centro */}
        <rect width="1440" height="900" fill={`url(#${vinheta})`} />
      </svg>
    </div>
  );
}
