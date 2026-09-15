"use client";

import { useId } from "react";

/**
 * O fundo do topo da página de download.
 *
 * No Discord é um degradê vertical do blurple (#4f5bd5 no alto da captura
 * `desktop/15-download-viewport.png`) até um azul-noite quase preto na altura
 * da imagem do app (#141839 em y≈1100 @2x no Pixel 7), onde encosta no preto
 * da página. Pela regra mecânica o blurple vira limão — mas um topo limão com
 * título branco furaria a regra do accent (branco sobre limão dá 1,57:1). O
 * degradê desce então pela ponta **escura** da escala do limão
 * (`--brand-830` → `--brand-860` → `--background-base-lowest`), com um
 * brilho de limão no alto e o padrão de balões da tela de login
 * (`components/auth/AuthBackground.tsx`) bem apagado por cima: é a
 * identidade do Streamz no lugar da moeda e do robô do Discord.
 *
 * Tudo por token (`var(--…)` no `style`, que o SVG e o degradê não enxergam
 * como classe). Decorativo: `aria-hidden` e sem ponteiro.
 */

/** O balão do símbolo no ladrilho de 112 — o mesmo traço do `AuthBackground`. */
const BALAO_TILE =
  "M14 8 H46 A7 7 0 0 1 53 15 V37 A7 7 0 0 1 46 44 H30 L20 54 V44 H14 A7 7 0 0 1 7 37 V15 A7 7 0 0 1 14 8 Z";

export default function FundoDoTopo() {
  const padrao = `balao-${useId()}`;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(var(--brand-830-rgb)) 0%, rgb(var(--brand-860-rgb)) 45%, rgb(var(--background-base-lowest-rgb)) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 0%, rgb(var(--brand-500-rgb) / 0.22) 0%, rgb(var(--brand-500-rgb) / 0) 100%)",
        }}
      />
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern
            id={padrao}
            width="112"
            height="112"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-12)"
          >
            <path d={BALAO_TILE} fill="none" style={{ stroke: "var(--brand-500)" }} strokeWidth="3" />
          </pattern>
          {/* os balões somem de cima para baixo: textura no alto, nada atrás da imagem do app */}
          <linearGradient id={`${padrao}-some`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--white)" }} stopOpacity="1" />
            <stop offset="70%" style={{ stopColor: "var(--white)" }} stopOpacity="0" />
          </linearGradient>
          <mask id={`${padrao}-mascara`}>
            <rect width="100%" height="100%" fill={`url(#${padrao}-some)`} />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={`url(#${padrao})`}
          opacity="0.07"
          mask={`url(#${padrao}-mascara)`}
        />
      </svg>
    </div>
  );
}
