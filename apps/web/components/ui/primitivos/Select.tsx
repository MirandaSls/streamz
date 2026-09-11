"use client";

import type { ReactNode } from "react";

/**
 * Select do Discord (refresh 2025): módulo `_a16aea` em
 * `css-bruto/376991.56e2ea647b4a55b8.css`.
 *
 * Especificação medida (cartão 0.4-select implementa):
 * - Caixa fechada: `min-height` 40 (`md`) / 32 (`sm`), padding 8 × 12 à
 *   esquerda e 8 à direita, grade `1fr auto` com gap 8, texto `--text-default`
 *   peso 500, placeholder `--text-subtle`, chevron à direita. Fundo/borda: os do
 *   TextInput (`--input-*`) — o CSS do select não os declara; conferir no print.
 * - Lista aberta: fundo `--background-surface-higher`, borda 1px
 *   `--border-subtle`, raio 8, 8 abaixo da caixa (ou acima, com o raio
 *   invertido, se não couber), largura da caixa. Opção: padding 12, 16/20 (≈44
 *   de altura), hover `--interactive-background-hover` +
 *   `--interactive-text-hover`, selecionada `--interactive-background-selected`
 *   + peso 500 + ícone de check à direita em `--brand-500` (limão). Sem
 *   divisória entre opções. Desabilitada: opacidade .5.
 * - Busca (`buscavel`): campo sem borda no topo da lista, 16px; "sem
 *   resultados" com padding 12 sobre `--background-base-lower`.
 * - Múltiplo: valores viram pílulas (`--background-base-low`, raio 4, padding
 *   4×8, 14/20) com "×" de 16; na lista, checkbox de 20 com raio 6 (limão com
 *   visto escuro quando marcado).
 * - Teclado: setas navegam, Enter escolhe, Esc fecha, Tab sai; `role=listbox`.
 * - Usa o `Popout` (`./Popout`) para a lista, para herdar posição e colisão.
 */
export interface OpcaoDeSelect<T extends string = string> {
  valor: T;
  rotulo: string;
  desabilitada?: boolean;
  /** Ícone/avatar à esquerda do rótulo. */
  prefixo?: ReactNode;
  /** Linha secundária sob o rótulo. */
  descricao?: string;
}

interface SelectBaseProps<T extends string> {
  opcoes: OpcaoDeSelect<T>[];
  placeholder?: string;
  desabilitado?: boolean;
  /** `md` 40 (padrão), `sm` 32. */
  tamanho?: "sm" | "md";
  /** Campo de busca no topo da lista. */
  buscavel?: boolean;
  id?: string;
  /** Nome acessível quando não há `<label htmlFor>`. */
  rotulo?: string;
  className?: string;
}

export interface SelectProps<T extends string = string> extends SelectBaseProps<T> {
  valor: T | null;
  aoMudar: (valor: T) => void;
}

export interface MultiSelectProps<T extends string = string> extends SelectBaseProps<T> {
  valor: T[];
  aoMudar: (valor: T[]) => void;
  maximo?: number;
}

// Implementação provisória com <select> nativo (cartão 0.4-select substitui).
export function Select<T extends string = string>({
  opcoes,
  valor,
  aoMudar,
  placeholder,
  desabilitado,
  tamanho = "md",
  id,
  rotulo,
  className = "",
}: SelectProps<T>) {
  return (
    <select
      id={id}
      aria-label={rotulo}
      disabled={desabilitado}
      value={valor ?? ""}
      onChange={(e) => aoMudar(e.target.value as T)}
      className={`w-full rounded-lg border border-input-border-default bg-input-background-default px-3 text-text-default ${
        tamanho === "sm" ? "h-[32px]" : "h-[40px]"
      } ${className}`}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor} disabled={o.desabilitada}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

// Implementação provisória (cartão 0.4-select substitui).
export function MultiSelect<T extends string = string>({ opcoes, valor, aoMudar, className = "" }: MultiSelectProps<T>) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {opcoes.map((o) => {
        const marcado = valor.includes(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={marcado}
            onClick={() => aoMudar(marcado ? valor.filter((v) => v !== o.valor) : [...valor, o.valor])}
            className={`rounded px-2 py-1 text-text-sm ${marcado ? "bg-background-base-low text-text-default" : "text-text-muted"}`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
