"use client";

import type { ReactNode } from "react";

/**
 * Rádio do Discord: `.radioIndicator__64e61` / `.radioGroupOption__64e61` em
 * `css-bruto/858942.086f3345af1722be.css`.
 *
 * Medido (cartão 0.4-controles):
 * - SVG 20×20 — o CSS diz `transform-origin:10px 10px` para o ponto interno,
 *   que bate exatamente com o centro de um quadro 20×20. Os diâmetros em si
 *   são "não medido" no CSS bruto (são atributos do `<svg>`, o bundle só dá
 *   `fill`/`stroke`): confirmados no print 1:1
 *   (`docs/Reference/Captura de tela 2026-09-01 114439.png`, opção
 *   "Compartilhar em todos os servidores", x≈738–759/y≈616–637 o círculo
 *   externo, x≈745–752/y≈623–630 o ponto) — **círculo externo 20px**,
 *   **ponto interno 8px**. Batia com o palpite provisório ("app hoje usa
 *   20/8").
 * - Círculo externo **preenchido**, não só contorno (`outerRadioBase` +
 *   `outerRadioFill` empilhados no CSS): fill `--radio-background-*`/
 *   `--radio-background-selected-*` (limão quando marcado), stroke
 *   `--radio-border-*` a 2px. Ponto interno `--radio-thumb-background-active`
 *   (escuro sobre o limão, regra do accent).
 * - Animação: ponto entra em **333ms `cubic-bezier(.26,.21,.67,1)`**
 *   (`dotIn__64e61`), preenchimento em 225ms `cubic-bezier(.33,0,.67,1)`
 *   (`fillIn__64e61`); ao sair, preenchimento em 160ms e ponto em **250ms
 *   `cubic-bezier(.33,0,.25,1)`** (`fillOut__64e61`/`dotOut__64e61`).
 *   Aproximado aqui como opacidade+escala num par só de entra/sai, sem as
 *   fases intermediárias do keyframe original (ver `nao_verificado`).
 * - Grupo: gap 16 entre opções, padding `--space-8` em cima e `--space-4`
 *   embaixo (`pt-2 pb-1`, já batia). Opção com gap 12 entre indicador e
 *   texto, raio 8 (`rounded-lg` = `--radius-sm`, já batia). Hover troca só o
 *   indicador (`group-hover` no SVG) — a linha não ganha fundo.
 * - Variante `cartao` (grade de cartões, a do `RadioCards` atual): fora do
 *   escopo deste cartão, mantém o desenho atual até a onda 6 medir.
 * - `<input type="radio">` real por cima do círculo, visualmente
 *   transparente. Navegação por seta entre opções e `role="radiogroup"`
 *   implícito vêm de graça do `name` compartilhado — não reimplementados.
 */
export interface OpcaoDeRadio<T extends string = string> {
  valor: T;
  rotulo: ReactNode;
  descricao?: ReactNode;
  desabilitada?: boolean;
}

export interface RadioGroupProps<T extends string = string> {
  valor: T;
  aoMudar: (valor: T) => void;
  opcoes: OpcaoDeRadio<T>[];
  /** `name` dos inputs. */
  nome: string;
  /** Nome acessível do grupo (vira `<legend>`). */
  legenda: string;
  legendaOculta?: boolean;
  variante?: "lista" | "cartao";
  className?: string;
}

export function RadioGroup<T extends string = string>({
  valor,
  aoMudar,
  opcoes,
  nome,
  legenda,
  legendaOculta = false,
  className = "",
}: RadioGroupProps<T>) {
  return (
    <fieldset className={`flex flex-col gap-4 pb-1 pt-2 ${className}`}>
      <legend className={legendaOculta ? "sr-only" : "mb-2 text-text-md font-medium text-text-strong"}>{legenda}</legend>
      {opcoes.map((o) => {
        const selecionada = valor === o.valor;
        return (
          <label
            key={o.valor}
            className={`group flex items-start gap-3 rounded-lg celular:min-h-11 celular:items-center ${o.desabilitada ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <span className="relative mt-0.5 h-[20px] w-[20px] shrink-0">
              <input
                type="radio"
                name={nome}
                value={o.valor}
                checked={selecionada}
                disabled={o.desabilitada}
                onChange={() => aoMudar(o.valor)}
                className="peer absolute inset-0 h-full w-full cursor-[inherit] appearance-none opacity-0 outline-none"
              />
              <svg
                viewBox="0 0 20 20"
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-border-focus"
              >
                <circle
                  cx="10"
                  cy="10"
                  r="9"
                  strokeWidth="2"
                  className={`transition-[fill,stroke] duration-200 ${
                    selecionada
                      ? "fill-radio-background-selected-default stroke-radio-border-selected-default group-hover:fill-radio-background-selected-hover group-hover:stroke-radio-border-selected-hover"
                      : "fill-radio-background-default stroke-radio-border-default group-hover:fill-radio-background-hover group-hover:stroke-radio-border-hover"
                  }`}
                />
                <circle
                  cx="10"
                  cy="10"
                  r="4"
                  className={`origin-center fill-radio-thumb-background-active transition-[opacity,transform] ${
                    selecionada
                      ? "scale-100 opacity-100 duration-[333ms] ease-[cubic-bezier(.26,.21,.67,1)]"
                      : "scale-0 opacity-0 duration-[250ms] ease-[cubic-bezier(.33,0,.25,1)]"
                  }`}
                />
              </svg>
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-text-md text-text-default">{o.rotulo}</span>
              {o.descricao ? <span className="text-text-sm text-text-muted">{o.descricao}</span> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
