"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Campos de formulário do Discord (refresh 2025).
 *
 * Especificação medida (cartão 0.4-campos implementa e confere):
 * - TextInput `md` 40 de altura (`sm` 32 — a busca da lista de membros,
 *   `.searchBar_c322aa`), padding 10 (lateral 12 quando não há sufixo — conferir),
 *   raio 8, borda 1px `--input-border-default` (hover igual), foco
 *   `--input-border-active` (limão) com o outline de 1px colado de
 *   `globals.css`, fundo `--input-background-default`, texto 16/20
 *   `--input-text-default`, placeholder `--input-placeholder-text-default`.
 *   Erro: borda `--input-border-error-default`, fundo
 *   `--input-background-error-default`. Fontes: `css-bruto/730931.*.css`
 *   (`.input_fffc15`), `sob-demanda/7a89de758a772c46.css` (`.input_f89b2c`).
 * - Prefixo (ícone à esquerda) e sufixo/limpar (à direita): o padding cresce
 *   para o ícone não cobrir o texto (status personalizado: 48 à esquerda, 36 à
 *   direita, `sob-demanda/99d7da090ff5cf77.css`).
 * - TextArea: sem borda própria no `<textarea>` — a borda e o fundo ficam no
 *   invólucro, como no Discord (`.textArea_fcde1f`, `css-bruto/142753.*.css`);
 *   padding 12×10, `resize: none` por padrão; contador em 12px `font-code`
 *   `--text-muted` no canto inferior direito (12 de baixo, 14 da direita), que
 *   vira `--text-feedback-critical` ao estourar.
 * - Campo (rótulo + descrição + erro), `.legend_b717a1`
 *   (`sob-demanda/355502.*.css`): rótulo 16px peso 500 `--text-strong`, **sem
 *   caixa-alta** (a refresh aboliu), 8 até o controle; obrigatório = asterisco
 *   DEPOIS do rótulo em `--text-feedback-critical` com 4 de recuo; erro abaixo
 *   do controle em 12px itálico peso 500 `--text-feedback-critical`; descrição
 *   (hint) 14px `--text-muted` (cor/tamanho "não medido" — confirmar), 4 de
 *   distância.
 * - Celular: `celular:h-[48px]` nos campos, como o app já faz (alvo de toque), e
 *   16px de fonte mínima (evita o zoom do Safari — já é global).
 */
export type TamanhoDeCampo = "sm" | "md";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  /** `md` 40 (padrão), `sm` 32. */
  tamanho?: TamanhoDeCampo;
  erro?: boolean;
  /** Ícone ou elemento à esquerda, dentro da caixa. */
  prefixo?: ReactNode;
  /** Ícone ou botão à direita, dentro da caixa. */
  sufixo?: ReactNode;
  /** Com valor não vazio, mostra o "×" à direita e chama isto ao clicar. */
  aoLimpar?: () => void;
  /** Classe da caixa externa (a do `<input>` é `className`). */
  classeDaCaixa?: string;
}

// Implementação provisória (cartão 0.4-campos substitui pelo medido).
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { tamanho = "md", erro = false, prefixo, sufixo, aoLimpar, classeDaCaixa = "", className = "", ...resto },
  ref,
) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-input-background-default px-2.5 ${
        tamanho === "sm" ? "h-[32px]" : "h-[40px] celular:h-[48px]"
      } ${erro ? "border-input-border-error-default" : "border-input-border-default"} ${classeDaCaixa}`}
    >
      {prefixo}
      <input
        ref={ref}
        aria-invalid={erro || undefined}
        className={`min-w-0 flex-1 bg-transparent text-text-md text-input-text-default outline-none placeholder:text-input-placeholder-text-default ${className}`}
        {...resto}
      />
      {aoLimpar && resto.value ? (
        <button type="button" onClick={aoLimpar} aria-label="Limpar" className="text-interactive-text-default">
          ×
        </button>
      ) : null}
      {sufixo}
    </div>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  erro?: boolean;
  /** Mostra "n / máx" no canto (exige `maxLength`). */
  contador?: boolean;
  redimensionavel?: boolean;
  classeDaCaixa?: string;
}

// Implementação provisória (cartão 0.4-campos substitui pelo medido).
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { erro = false, contador = false, redimensionavel = false, classeDaCaixa = "", className = "", ...resto },
  ref,
) {
  const n = typeof resto.value === "string" ? resto.value.length : 0;
  return (
    <div
      className={`relative rounded-lg border bg-input-background-default ${
        erro ? "border-input-border-error-default" : "border-input-border-default"
      } ${classeDaCaixa}`}
    >
      <textarea
        ref={ref}
        aria-invalid={erro || undefined}
        className={`block w-full bg-transparent px-2.5 py-3 text-text-md text-input-text-default outline-none placeholder:text-input-placeholder-text-default ${
          redimensionavel ? "resize-y" : "resize-none"
        } ${className}`}
        {...resto}
      />
      {contador && resto.maxLength ? (
        <span className="pointer-events-none absolute bottom-3 right-3.5 font-mono text-text-xs text-text-muted">
          {resto.maxLength - n}
        </span>
      ) : null}
    </div>
  );
});

export interface CampoProps {
  rotulo: ReactNode;
  /** `id` do controle, para o `<label htmlFor>`. */
  htmlFor?: string;
  descricao?: ReactNode;
  /** Mensagem de erro abaixo do controle; `null`/vazio esconde. */
  erro?: string | null;
  obrigatorio?: boolean;
  children: ReactNode;
  className?: string;
}

// Implementação provisória (cartão 0.4-campos substitui pelo medido).
export function Campo({ rotulo, htmlFor, descricao, erro, obrigatorio, children, className = "" }: CampoProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-2 block text-text-md font-medium text-text-strong">
        {rotulo}
        {obrigatorio ? <span className="pl-1 text-text-feedback-critical">*</span> : null}
      </label>
      {descricao ? <p className="mb-2 text-text-sm text-text-muted">{descricao}</p> : null}
      {children}
      {erro ? <p className="mt-1 text-text-xs font-medium italic text-text-feedback-critical">{erro}</p> : null}
    </div>
  );
}
