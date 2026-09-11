"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { X } from "@/components/ui/icones";

/**
 * Campos de formulário do Discord (refresh 2025).
 *
 * Medido (cartão 0.4-campos):
 * - TextInput `md` 40 de altura (`sm` 32 — a busca da lista de membros,
 *   `.searchBar_c322aa`), raio 8 (`--radius-sm`), borda 1px
 *   `--input-border-default` (hover igual — o Discord não muda a borda no
 *   hover), fundo `--input-background-default`, texto 16/20 (`text-text-md`)
 *   `--input-text-default`, placeholder `--input-placeholder-text-default`.
 *   O foco não é responsabilidade daqui: `globals.css` já poe outline de 1px
 *   colado (`--input-border-active`, limão) em todo `input`/`textarea` do
 *   app — este componente não repete a regra.
 *   Padding lateral **sem** sufixo: 10px (`px-2.5`), não 12 — é o mesmo
 *   `padding-inline: 10px …` de `.input_fffc15` (`css-bruto/730931.*.css`) e
 *   `.base_f89b2c` (`sob-demanda/7a89de758a772c46.css`), que só zeram o lado
 *   do botão quando há um; sem botão os dois lados ficam iguais. A caixa
 *   (raio/altura/borda) é `.container_f89b2c` no mesmo arquivo sob-demanda.
 *   Erro: borda `--input-border-error-default`, fundo
 *   `--input-background-error-default`.
 * - Prefixo (ícone à esquerda) e sufixo/limpar (à direita) aqui são irmãos
 *   flexbox com `gap-2` (8, a escala de espaçamento do resto do app — **não**
 *   é medida do Discord). O Discord absolutiza o ícone/botão por cima do
 *   texto com `padding-inline: 48px 36px` (`sob-demanda/99d7da090ff5cf77.css`),
 *   mas esse número é o tamanho exato do botão de emoji + "×" daquele campo
 *   de status específico — não generaliza para um `prefixo`/`sufixo`
 *   arbitrário deste primitivo, então não foi copiado.
 * - TextArea: sem borda própria no `<textarea>` — a borda e o fundo ficam no
 *   invólucro, como no Discord (`.textArea_fcde1f`, `css-bruto/142753.*.css`);
 *   padding 12×10 (vertical×horizontal), `resize: none` por padrão; contador
 *   em 12px `font-code` `--text-muted` no canto inferior direito (12 de
 *   baixo, 14 da direita — `.maxLength_fcde1f`), que vira
 *   `--text-feedback-critical` ao estourar (`.errorOverflow_fcde1f`).
 * - Campo (rótulo + descrição + erro), `.legend_b717a1`
 *   (`sob-demanda/355502.*.css`): rótulo 16px peso 500 `--text-strong`, **sem
 *   caixa-alta** (a refresh aboliu), 8 até o controle; obrigatório = asterisco
 *   DEPOIS do rótulo em `--text-feedback-critical` com 4 de recuo
 *   (`.required_b717a1`); erro abaixo do controle em 12px itálico peso 500
 *   `--text-feedback-critical` (`.errorMessage_b717a1`); descrição (hint)
 *   14px `--text-muted`, 4 de distância até o controle — não achei a classe
 *   da descrição no mesmo arquivo que `legend_b717a1` (só o módulo de
 *   tipografia leva o hash `_b717a1`), mas 14px `--text-muted` é o padrão que
 *   se repete no CSS bruto para texto secundário abaixo de um rótulo
 *   (`.subText_f0c2ea`, `.discriminator__24091`, `.groupLabel_c1e9c4`).
 * - Sem print 1:1 desta tela específica entre as capturas de
 *   `docs/Reference/`: a única com campo de texto medível (Adicionar amigo,
 *   `2026-08-31 124052.png`) é um componente à parte
 *   (`.addFriendInputWrapper__72ba7`, raio **16**, caixa maior), não o
 *   `TextInput` genérico — não serve de referência para as medidas acima.
 * - Celular: `celular:h-[48px]` no `md` (alvo de toque), e 16px de fonte
 *   mínima (evita o zoom do Safari — já é global).
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

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { tamanho = "md", erro = false, prefixo, sufixo, aoLimpar, classeDaCaixa = "", className = "", ...resto },
  ref,
) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
        tamanho === "sm" ? "h-[32px]" : "h-[40px] celular:h-[48px]"
      } ${
        erro
          ? "border-input-border-error-default bg-input-background-error-default"
          : "border-input-border-default bg-input-background-default"
      } ${classeDaCaixa}`}
    >
      {prefixo}
      <input
        ref={ref}
        aria-invalid={erro || undefined}
        className={`min-w-0 flex-1 bg-transparent text-text-md text-input-text-default outline-none placeholder:text-input-placeholder-text-default ${className}`}
        {...resto}
      />
      {aoLimpar && resto.value ? (
        <button
          type="button"
          onClick={aoLimpar}
          aria-label="Limpar"
          className="shrink-0 text-interactive-text-default transition-colors hover:text-interactive-text-hover"
        >
          <X size={16} aria-hidden="true" />
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

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { erro = false, contador = false, redimensionavel = false, classeDaCaixa = "", className = "", ...resto },
  ref,
) {
  const n = typeof resto.value === "string" ? resto.value.length : 0;
  const restante = typeof resto.maxLength === "number" ? resto.maxLength - n : null;
  return (
    <div
      className={`relative rounded-lg border has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
        erro
          ? "border-input-border-error-default bg-input-background-error-default"
          : "border-input-border-default bg-input-background-default"
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
        <span
          className={`pointer-events-none absolute bottom-3 right-3.5 font-mono text-text-xs ${
            restante !== null && restante < 0 ? "text-text-feedback-critical" : "text-text-muted"
          }`}
        >
          {restante}
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

export function Campo({ rotulo, htmlFor, descricao, erro, obrigatorio, children, className = "" }: CampoProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-2 block text-text-md font-medium text-text-strong">
        {rotulo}
        {obrigatorio ? <span className="pl-1 text-text-feedback-critical">*</span> : null}
      </label>
      {/* 4 até o controle (não os 8 do rótulo) — ver cabeçalho do arquivo */}
      {descricao ? <p className="mb-1 text-text-sm text-text-muted">{descricao}</p> : null}
      {children}
      {erro ? <p className="mt-1 text-text-xs font-medium italic text-text-feedback-critical">{erro}</p> : null}
    </div>
  );
}
