"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip, type LadoDaDica } from "./Tooltip";

/**
 * Botão só de ícone, com dica — o "ícone clicável" do Discord: a toolbar do
 * cabeçalho do canal, a barra de ações da mensagem, os botões do painel do
 * usuário, fechar de painel. Substitui o `<button title=…><Icone/></button>`
 * espalhado pelo app: o `rotulo` vira `aria-label` E a dica (`Tooltip`), e o
 * `title=` nativo morre.
 *
 * Especificação (cartão 0.4-botao-de-icone mede e completa):
 * - Cor do ícone: `--interactive-text-default` → hover `--interactive-text-hover`
 *   → ativo/selecionado `--interactive-text-active`. Perigo: hover
 *   `--text-feedback-critical`.
 * - `comFundo`: hover pinta `--interactive-background-hover` e pressionado
 *   `--interactive-background-active` (barra de ações da mensagem, rodapé do
 *   usuário). Sem `comFundo` só a cor muda (cabeçalho do canal).
 * - Tamanhos: caixa 24/32/40 com ícone 16/20/24 (`--icon-size-*`). Raio 4 na
 *   caixa de 24 e 8 nas outras — conferir no CSS bruto (`.iconWrapper_`,
 *   `.clickable_`, `.button_` da barra de ações) e no print 1:1.
 */
export type TamanhoDeBotaoDeIcone = "sm" | "md" | "lg";

export interface BotaoDeIconeProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> {
  /** Vira `aria-label` e o texto da dica. Obrigatório: ícone sem nome não existe. */
  rotulo: string;
  icone: ReactNode;
  /** `sm` 24 (ícone 16), `md` 32 (ícone 20, padrão), `lg` 40 (ícone 24). */
  tamanho?: TamanhoDeBotaoDeIcone;
  /** Estado ligado/selecionado (ex.: lista de membros aberta). */
  ativo?: boolean;
  /** Hover em vermelho (apagar, sair, desligar). */
  perigo?: boolean;
  /** Hover com fundo, não só cor. */
  comFundo?: boolean;
  /** Onde a dica aparece. Padrão `top`. */
  ladoDaDica?: LadoDaDica;
  /** Sem dica (quando outro elemento já nomeia o botão visualmente). */
  semDica?: boolean;
  /** Atalho mostrado na dica (ex.: "Ctrl+F"). */
  atalho?: string;
}

// Implementação provisória (cartão 0.4-botao-de-icone substitui pelo medido).
const CAIXA: Record<TamanhoDeBotaoDeIcone, string> = {
  sm: "h-[24px] w-[24px] rounded",
  md: "h-[32px] w-[32px] rounded-lg",
  lg: "h-[40px] w-[40px] rounded-lg",
};

export const BotaoDeIcone = forwardRef<HTMLButtonElement, BotaoDeIconeProps>(function BotaoDeIcone(
  {
    rotulo,
    icone,
    tamanho = "md",
    ativo = false,
    perigo = false,
    comFundo = false,
    ladoDaDica = "top",
    semDica = false,
    atalho,
    type = "button",
    className = "",
    ...resto
  },
  ref,
) {
  const botao = (
    <button
      ref={ref}
      type={type}
      aria-label={rotulo}
      aria-pressed={ativo || undefined}
      className={`grid shrink-0 place-items-center transition-colors disabled:pointer-events-none disabled:opacity-50 ${CAIXA[tamanho]} ${
        ativo ? "text-interactive-text-active" : "text-interactive-text-default hover:text-interactive-text-hover"
      } ${perigo ? "hover:text-text-feedback-critical" : ""} ${
        comFundo ? "hover:bg-interactive-background-hover active:bg-interactive-background-active" : ""
      } ${className}`}
      {...resto}
    >
      {icone}
    </button>
  );
  if (semDica) return botao;
  return (
    <Tooltip rotulo={rotulo} lado={ladoDaDica} atalho={atalho}>
      {botao}
    </Tooltip>
  );
});
