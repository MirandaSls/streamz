"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Botão do Discord (refresh 2025): o módulo único `.button_a22cb0` de
 * `docs/referencias-discord/tokens/css-bruto/362698.047b6f205fd7bdc1.css`.
 *
 * Especificação medida (cartão 0.4-botao confere e completa):
 * - Tamanhos (a borda de 1px transparente conta na altura):
 *   `xs` quadro 22 + borda → 24, padding 3×7, raio 4 (`--radius-xs`);
 *   `sm` quadro 30 + borda → 32, padding 3×11, raio 8;
 *   `md` quadro 38 + borda → 40, padding 7×15, raio 8. Não existe `lg`.
 *   `min-width` com texto: 60 (xs, sm) e 100 (md). Gap ícone–texto 4.
 * - Variantes → tokens `--control-*` (fundo/texto/borda × default/hover/active):
 *   `primario` = `control-primary-*` (limão; texto e ícone ESCUROS — regra do
 *   accent, já no token), `secundario` = `control-secondary-*`,
 *   `critico` = `control-critical-primary-*`, `critico-secundario` =
 *   `control-critical-secondary-*`, `positivo` = `control-connected-*`,
 *   `link` = texto `text-link` sem fundo (sublinha no hover).
 * - Desabilitado: `opacity .5; pointer-events: none`.
 * - Carregando: o conteúdo sobe e some (`translateY(-100%)`, opacidade 0) e três
 *   pontos na cor do texto entram no lugar, sem mudar a medida do botão.
 * - Só ícone (sem `children`): quadrado do tamanho (24/32/40), sem padding.
 * - `larguraTotal` só vale com texto, como no Discord.
 * - Foco de teclado: o anel global de `globals.css` (`--border-focus`).
 */
export type VarianteDeBotao =
  | "primario"
  | "secundario"
  | "critico"
  | "critico-secundario"
  | "positivo"
  | "link";
export type TamanhoDeBotao = "xs" | "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Padrão `primario`. */
  variante?: VarianteDeBotao;
  /** Padrão `md` (40px). */
  tamanho?: TamanhoDeBotao;
  /** Ícone à esquerda do texto. Sem `children`, o botão vira quadrado. */
  icone?: ReactNode;
  /** Ícone à direita do texto (chevron, seta externa). */
  iconeDireita?: ReactNode;
  /** Troca o conteúdo pelos três pontos sem mudar a medida; bloqueia o clique. */
  carregando?: boolean;
  /** Ocupa a largura do pai (só com texto). */
  larguraTotal?: boolean;
  /** Raio de pílula (`--radius-round`). */
  pilula?: boolean;
}

// Implementação provisória (cartão 0.4-botao substitui pelo medido).
const VARIANTES: Record<VarianteDeBotao, string> = {
  primario:
    "bg-control-primary-background-default text-control-primary-text-default hover:bg-control-primary-background-hover active:bg-control-primary-background-active",
  secundario:
    "bg-control-secondary-background-default text-control-secondary-text-default hover:bg-control-secondary-background-hover active:bg-control-secondary-background-active",
  critico:
    "bg-control-critical-primary-background-default text-control-critical-primary-text-default hover:bg-control-critical-primary-background-hover active:bg-control-critical-primary-background-active",
  "critico-secundario":
    "bg-control-critical-secondary-background-default text-control-critical-secondary-text-default hover:bg-control-critical-secondary-background-hover active:bg-control-critical-secondary-background-active",
  positivo:
    "bg-control-connected-background-default text-control-connected-text-default hover:bg-control-connected-background-hover active:bg-control-connected-background-active",
  link: "bg-transparent text-text-link hover:underline",
};
const TAMANHOS: Record<TamanhoDeBotao, string> = {
  xs: "h-[24px] min-w-[60px] rounded px-[7px] text-text-xs",
  sm: "h-[32px] min-w-[60px] rounded-lg px-[11px] text-text-sm",
  md: "h-[40px] min-w-[100px] rounded-lg px-[15px] text-text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variante = "primario",
    tamanho = "md",
    icone,
    iconeDireita,
    carregando = false,
    larguraTotal = false,
    pilula = false,
    type = "button",
    className = "",
    disabled,
    children,
    ...resto
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`inline-flex items-center justify-center gap-1 border border-transparent font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${pilula ? "rounded-full" : ""} ${larguraTotal ? "w-full" : ""} ${className}`}
      {...resto}
    >
      {icone}
      {children}
      {iconeDireita}
    </button>
  );
});
