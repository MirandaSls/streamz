"use client";

import { useId, type ReactNode } from "react";

/**
 * Controles das telas de configuração.
 *
 * Existem separados porque as nove abas repetem exatamente quatro formas —
 * seção, interruptor, deslizador e escolha — e o Discord depende de elas serem
 * idênticas em todas. Cada um cuida do próprio rótulo/`id`, então a aba escreve
 * só o que a preferência significa.
 */

/** Bloco com título em caixa-alta e uma linha divisória embaixo. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Linha rótulo + descrição + controle à direita, com divisória. */
export function Row({
  label,
  hint,
  htmlFor,
  control,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#3f4147] py-3 last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-txt-primary">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-txt-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** Interruptor do Discord: trilho de 40px com a bolinha branca. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <Row
      label={label}
      hint={hint}
      htmlFor={id}
      control={
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative h-6 w-10 shrink-0 rounded-full transition ${
            checked ? "bg-green" : "bg-[#72767d]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
              checked ? "left-5" : "left-1"
            }`}
          />
        </button>
      }
    />
  );
}

/** Deslizador com o valor lido ao lado (o `output` do Discord). */
export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  onChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="border-b border-[#3f4147] py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-txt-primary">
          {label}
        </label>
        <output htmlFor={id} className="text-xs font-medium text-txt-muted">
          {format(value)}
        </output>
      </div>
      {hint && <p className="mt-0.5 text-xs text-txt-muted">{hint}</p>}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-rail accent-accent"
      />
    </div>
  );
}

export interface Opcao<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

/** Escolha única em cartões (tema, modo de voz, idioma). */
export function RadioCards<T extends string>({
  legend,
  value,
  options,
  onChange,
  columns = 2,
}: {
  legend: string;
  value: T;
  options: Opcao<T>[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <fieldset className="border-b border-[#3f4147] py-3 last:border-b-0">
      <legend className="mb-2 text-sm font-medium text-txt-primary">{legend}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((opcao) => {
          const ativo = opcao.value === value;
          return (
            <button
              key={opcao.value}
              type="button"
              role="radio"
              aria-checked={ativo}
              disabled={opcao.disabled}
              onClick={() => onChange(opcao.value)}
              className={`rounded-[4px] border px-3 py-2 text-left transition ${
                ativo
                  ? "border-accent bg-accent/15 text-txt-primary"
                  : "border-[#3f4147] text-txt-normal hover:bg-hov"
              } ${opcao.disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <span className="block text-sm font-medium">{opcao.label}</span>
              {opcao.hint && <span className="mt-0.5 block text-xs text-txt-muted">{opcao.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Lista suspensa (dispositivos de áudio/vídeo). */
export function Select({
  label,
  value,
  options,
  onChange,
  emptyLabel,
}: {
  label: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  emptyLabel: string;
}) {
  const id = useId();
  return (
    <div className="border-b border-[#3f4147] py-3 last:border-b-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-txt-primary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-sm text-txt-normal outline-none"
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Aviso de "isto é de outro agente / ainda não existe" nas abas delegadas. */
export function EmBreve({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[4px] border border-[#3f4147] bg-panel px-3 py-2 text-sm text-txt-muted">
      {children}
    </p>
  );
}
