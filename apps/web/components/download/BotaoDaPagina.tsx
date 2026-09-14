"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * O botão das páginas públicas do Discord (`discord.com/download`), que **não**
 * é o `.button_a22cb0` do app — a página é Webflow, com botão próprio. Por isso
 * não é o primitivo `Button` (40 de altura, raio 8): as medidas abaixo são de
 * outra peça, e forçá-las no primitivo por `className` dependeria da ordem das
 * classes no CSS gerado.
 *
 * Medidas, das capturas de `referencias-discord/publico/`:
 * - **Altura 48.** Desktop (`desktop/15-download-viewport.png`, 1440 @2x):
 *   "Baixar para Mac" na coluna x=1440, azul em y=1106–1201 → 96px = 48. Os
 *   botões brancos da seção "computador" (`15-download-inteira.png`, coluna
 *   x=270): branco em y=4006–4101 → 48. Celular (`web-mobile-android/
 *   15-download-viewport.png`, Pixel 7 @2,625): y=1126–1252 → 48,4.
 * - **Raio 12.** A borda do botão principal só chega à coluna cheia (x=1240)
 *   em y≈1130, 24px abaixo do topo (1106) → 12. O branco da seção, idem
 *   (x=240 em y≈4030, topo 4006).
 * - **Largura.** "Baixar para Mac": x=1240–1639 → 200 no desktop; 308–772 →
 *   177 no Pixel 7. Sai do conteúdo, não é fixa: o padding fica em 24 dos
 *   dois lados (o glifo do ícone começa a ~33 da borda e ele tem folga interna
 *   no quadro de 24; o texto termina a 24,5 da borda direita).
 * - **Texto 16.** A haste mais alta do rótulo, no botão principal, mede 22px
 *   @2x (y=1142–1163) = 11 de versal → 16px com a versal de 0,714 da Noto Sans;
 *   no Pixel 7, 29px @2,625 = 11. Peso: não medido; fica o `font-medium` do
 *   primitivo, que é o par de botão do Discord.
 * - **Cor.** Principal: blurple → limão (`control-primary-*`, texto escuro —
 *   regra do accent). Claro: branco puro medido (#ffffff) com texto #000000;
 *   aqui `bg-text-strong` (#fbfbfb) com `text-text-overlay-dark` (#000000), os
 *   tokens mais próximos — `bg-white` é proibido no vocabulário do código.
 *   Hover e pressionado do botão claro: não medidos (a captura é estática);
 *   escurece um passo (`text-default`), como o primário.
 *
 * Toque: 48 já passa o piso de 44 — nada muda no celular.
 */
export type TomDoBotaoDaPagina = "marca" | "claro";

const TONS: Record<TomDoBotaoDaPagina, string> = {
  marca:
    "border-control-primary-border-default bg-control-primary-background-default text-control-primary-text-default hover:bg-control-primary-background-hover active:bg-control-primary-background-active",
  claro: "border-transparent bg-text-strong text-text-overlay-dark hover:bg-text-default active:bg-text-muted",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border text-text-md font-medium transition-colors duration-150 ease-out";

/**
 * `normal`: o botão de 48 descrito acima. `compacto`: o "Entrar" do cabeçalho
 * do Discord (`desktop/15-download-viewport.png`, linha y=120: branco em
 * x=2640–2800 → 80 de largura; coluna x=2660: y=84–157 → 37 de altura, raio
 * não medido). No celular ele sobe para 44, o piso de toque — a caixa do
 * Discord mede menos, e o alvo vence (registrado no cartão).
 */
const MEDIDAS = {
  normal: "h-[48px] rounded-xl px-6",
  compacto: "h-[37px] rounded-lg px-4 celular:h-[44px]",
} as const;

const DESLIGADO = "cursor-not-allowed opacity-50";

interface Comum {
  tom?: TomDoBotaoDaPagina;
  icone?: ReactNode;
  children: ReactNode;
  className?: string;
  medida?: keyof typeof MEDIDAS;
}

export function BotaoDaPagina({
  tom = "marca",
  icone,
  children,
  className = "",
  medida = "normal",
  disabled,
  type = "button",
  ...resto
}: Comum & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${BASE} ${MEDIDAS[medida]} ${TONS[tom]} ${disabled ? `${DESLIGADO} pointer-events-none` : ""} ${className}`}
      {...resto}
    >
      {/* span sem ponteiro: se o ícone trocar de componente no meio do toque,
          o <svg> sai do DOM e o navegador perde o click */}
      {icone ? <span className="pointer-events-none flex">{icone}</span> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

/** A mesma peça como navegação (entrar, voltar ao início). Só rota interna. */
export function LinkDaPagina({
  tom = "claro",
  icone,
  children,
  className = "",
  medida = "normal",
  href,
}: Comum & { href: string }) {
  return (
    <Link href={href} className={`${BASE} ${MEDIDAS[medida]} ${TONS[tom]} ${className}`}>
      {icone ? <span className="pointer-events-none flex">{icone}</span> : null}
      <span className="truncate">{children}</span>
    </Link>
  );
}
