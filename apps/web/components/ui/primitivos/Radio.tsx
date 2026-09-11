"use client";

import type { ReactNode } from "react";

/**
 * Rádio do Discord: `.radioIndicator__64e61` / `.radioGroupOption__64e61` em
 * `css-bruto/858942.086f3345af1722be.css`.
 *
 * Especificação medida (cartão 0.4-controles implementa):
 * - Indicador em SVG: círculo externo com traço de 2 (`--radio-border-*`),
 *   preenchimento `--radio-background-*` (limão quando marcado), ponto interno
 *   `--radio-thumb-background-active` (escuro sobre o limão). Diâmetro do
 *   círculo e do ponto "não medido" no CSS (são atributos do `<svg>`): medir no
 *   print 1:1 (Configurações > Notificações/Aparência) — o app hoje usa 20/8.
 *   Ponto entra em 333 ms `cubic-bezier(.26,.21,.67,1)`, sai em 250 ms.
 * - Grupo: gap 16 entre opções, padding 8 em cima e 4 embaixo; opção com gap
 *   12 entre indicador e texto, raio 8, hover troca só o indicador (a linha não
 *   ganha fundo — diferente do `RadioLinha` de hoje).
 * - Variante `cartao` (grade de cartões, a do `RadioCards` atual): mantém o
 *   desenho atual com os tokens novos até a onda 6 medir.
 * - `role="radiogroup"` com setas movendo a seleção.
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

// Implementação provisória (cartão 0.4-controles substitui pelo medido).
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
      {opcoes.map((o) => (
        <label key={o.valor} className={`flex items-start gap-3 rounded-lg ${o.desabilitada ? "opacity-50" : "cursor-pointer"}`}>
          <input
            type="radio"
            name={nome}
            value={o.valor}
            checked={valor === o.valor}
            disabled={o.desabilitada}
            onChange={() => aoMudar(o.valor)}
            className="mt-0.5 h-[20px] w-[20px] shrink-0 accent-brand-500"
          />
          <span className="flex flex-col gap-1">
            <span className="text-text-md text-text-default">{o.rotulo}</span>
            {o.descricao ? <span className="text-text-sm text-text-muted">{o.descricao}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
