"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, X } from "@/components/ui/icones";

/**
 * Vocabulário de formulário do app — um só, para configurações e modais.
 *
 * Mora em `ui/` e não em `settings/` nem em `modals/` porque as duas frentes
 * usam as mesmas peças: enquanto cada uma tinha o próprio arquivo, as telas
 * importavam controle uma da outra em mão dupla e o mesmo interruptor existia
 * em duas medidas. Aqui não há dono — as duas dependem de `ui/`, e `ui/` não
 * depende de nenhuma.
 *
 * Alguns pares parecem duplicados e não são: `Toggle`/`ToggleLinha` e
 * `Slider`/`SliderMarcas` resolvem problemas diferentes (linha de preferência
 * com divisória x linha solta com ícone; escala numérica contínua x paradas
 * nomeadas). O comentário de cada um diz quando usar qual.
 */

/* ─────────────────────────── estrutura ─────────────────────────── */

/**
 * Bloco com título em caixa-alta e uma linha divisória embaixo.
 *
 * O `id` é o que liga a seção ao menu de segundo nível da `TelaCheia`: ele vira
 * `data-secao`, e é por esse atributo que o menu rola até aqui e que o item
 * correspondente se marca sozinho quando a seção entra na tela. Seção sem `id`
 * continua existindo normalmente — ela só não aparece no menu.
 */
export function Section({
  id,
  title,
  children,
  /** última seção da aba, ou seção que já termina em outra divisória. */
  semDivisoria = false,
}: {
  id?: string;
  title?: string;
  children: ReactNode;
  semDivisoria?: boolean;
}) {
  return (
    <section
      data-secao={id}
      // `scroll-mt`: sem margem, rolar até a seção encosta o título no topo do
      // scroller e ele fica rente demais para ler como começo de bloco
      className={`scroll-mt-4 ${
        semDivisoria ? "mb-6" : "mb-6 border-b border-border pb-6 last:mb-0 last:border-b-0 last:pb-0"
      }`}
    >
      {title && (
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

/**
 * "Configurações relacionadas" — o cartão do fim da página que leva à página
 * vizinha.
 *
 * O Discord fecha quase toda página de configuração com um destes, e não é
 * enfeite: metade das preferências mora na fronteira entre duas páginas (o
 * tamanho do emoji é aparência ou acessibilidade?), e sem a ponte a pessoa volta
 * ao menu e procura de novo.
 */
export function ConfiguracoesRelacionadas({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { id: string; label: string; hint: string; icon: ReactNode; onSelect: () => void }[];
}) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
        {titulo}
      </h3>
      <div className="space-y-2">
        {itens.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onSelect}
            className="flex w-full items-center gap-3 rounded-lg bg-panel p-3 text-left transition hover:bg-hov"
          >
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rail text-txt-secondary">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-txt-primary">
                {item.label}
              </span>
              <span className="block truncate text-xs text-txt-muted">{item.hint}</span>
            </span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-txt-muted" />
          </button>
        ))}
      </div>
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
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
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

/** Rótulo em caixa-alta acima de um campo, com contador opcional à direita. */
export function Rotulo({
  children,
  htmlFor,
  contador,
}: {
  children: ReactNode;
  htmlFor?: string;
  /** "123/1024" — o Discord mostra usado/total, não o que resta. */
  contador?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <label
        htmlFor={htmlFor}
        className="text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
      >
        {children}
      </label>
      {contador && <span className="text-xs text-txt-muted">{contador}</span>}
    </div>
  );
}

/** Aviso de "isto ainda não existe" nas abas delegadas. */
export function EmBreve({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[4px] border border-border bg-panel px-3 py-2 text-sm text-txt-muted">
      {children}
    </p>
  );
}

/* ─────────────────────────── liga/desliga ─────────────────────────── */

/**
 * O interruptor do Discord: trilho de 40×24 com o polegar desenhando ✕ quando
 * desligado e ✓ quando ligado.
 *
 * O glifo não é enfeite: sem ele o estado depende só da cor do trilho, e quem
 * não distingue verde de cinza (ou está com a saturação em 0, que as próprias
 * configurações permitem) não tem como saber se a preferência está ligada.
 */
export function Switch({
  id,
  checked,
  onChange,
  label,
  disabled,
}: {
  id?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  /** usado quando o interruptor não está ligado a um `<label>` por `id`. */
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-green" : "bg-txt-faint"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-[3px] top-[3px] grid h-[18px] w-[18px] place-items-center rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      >
        {checked ? (
          <Check size={11} strokeWidth={3.5} className="text-green" />
        ) : (
          <X size={11} strokeWidth={3.5} className="text-txt-faint" />
        )}
      </span>
    </button>
  );
}

/**
 * Preferência em linha de lista: rótulo, descrição e interruptor, com a
 * divisória que separa uma preferência da seguinte. É a forma das abas de
 * configuração, onde as linhas vêm empilhadas.
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  extra,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  /** botão auxiliar à direita do interruptor (ex.: ouvir o som). */
  extra?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Row
      label={label}
      hint={hint}
      htmlFor={id}
      control={
        <div className="flex items-center gap-2">
          <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} />
          {extra}
        </div>
      }
    />
  );
}

/**
 * Interruptor solto num formulário: aceita ícone à esquerda e **não** desenha
 * divisória. É a forma dos modais, onde o controle aparece sozinho no meio de
 * campos de texto e a divisória viria do bloco em volta, não dele.
 */
export function ToggleLinha({
  checked,
  onChange,
  titulo,
  hint,
  icon,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  titulo: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex min-w-0 items-start gap-2">
        {icon && (
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-txt-secondary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-txt-primary">
            {titulo}
          </label>
          {hint && <p className="mt-0.5 text-xs text-txt-muted">{hint}</p>}
        </div>
      </div>
      <Switch id={id} checked={checked} onChange={onChange} />
    </div>
  );
}

/* ─────────────────────────── escolha única ─────────────────────────── */

/** A bolinha de rádio — desenhada, porque o `input` nativo não aceita a cor do
 *  tema em todos os navegadores. */
export function PontoDeRadio({ ativo }: { ativo: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition ${
        ativo ? "border-accent" : "border-txt-faint"
      }`}
    >
      {ativo && <span className="h-2 w-2 rounded-full bg-accent" />}
    </span>
  );
}

export interface Opcao<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  /** miniatura ilustrada acima do rótulo (tema, modo de exibição). */
  preview?: ReactNode;
  disabled?: boolean;
}

/**
 * Escolha única em **grade de cartões** (tema, modo de voz, idioma): as opções
 * ficam lado a lado e cada cartão pode carregar uma miniatura.
 *
 * O `role="radiogroup"` fica no contêiner dos botões, e não no `fieldset`: sem
 * ele os `role="radio"` ficavam órfãos e o leitor de tela anunciava "1 de 1"
 * em cada cartão.
 */
export function RadioCards<T extends string>({
  legend,
  legendaOculta = false,
  value,
  options,
  onChange,
  columns = 2,
}: {
  legend: string;
  /** some da tela quando o título da seção já diz a mesma coisa — o leitor de
   *  tela continua ouvindo, que é o que o `fieldset` precisa. */
  legendaOculta?: boolean;
  value: T;
  options: Opcao<T>[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <fieldset className="border-b border-border py-3 last:border-b-0">
      <legend
        className={legendaOculta ? "sr-only" : "mb-2 text-sm font-medium text-txt-primary"}
      >
        {legend}
      </legend>
      <div
        role="radiogroup"
        aria-label={legend}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
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
              className={`overflow-hidden rounded-[6px] border text-left transition ${
                ativo ? "border-accent" : "border-border hover:border-border-strong-hover"
              } ${opcao.disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {opcao.preview}
              <span className="flex items-start gap-2 px-3 py-2">
                <PontoDeRadio ativo={ativo} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-txt-primary">{opcao.label}</span>
                  {opcao.hint && (
                    <span className="mt-0.5 block text-xs text-txt-muted">{opcao.hint}</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Escolha única em **linha de largura total**: ícone, título, descrição e o
 * círculo à direita, empilhadas uma sobre a outra.
 *
 * É a forma que o Discord usa para "que tipo de canal é este?" e para a duração
 * do modo de espera — o cartão de `RadioCards` é largo demais para uma lista de
 * cinco opções com descrição, e a pílula com só o rótulo não cabe a descrição,
 * que é justamente o que diferencia as opções.
 */
export function RadioLinha({
  checked,
  onChange,
  name,
  titulo,
  hint,
  icon,
}: {
  checked: boolean;
  onChange: () => void;
  name: string;
  titulo: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-[4px] px-3 py-2.5 transition ${
        checked ? "bg-sel" : "bg-panel hover:bg-hov"
      }`}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0 text-txt-secondary">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-txt-primary">{titulo}</span>
        {hint && <span className="mt-0.5 block text-xs text-txt-muted">{hint}</span>}
      </span>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
          checked ? "border-accent" : "border-txt-faint"
        }`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
      </span>
    </label>
  );
}

/* ─────────────────────────── deslizadores ─────────────────────────── */

/**
 * Deslizador **numérico contínuo** (volume, zoom): grabber grande, marcas de
 * passo e o valor embaixo do grabber, acompanhando a posição — é assim que o
 * Discord mostra, e é o que permite ler o valor sem tirar o olho de onde o dedo
 * está.
 *
 * O `<input type="range">` continua existindo por baixo (teclado e leitor de
 * tela vêm de graça); o que muda é que trilho, marcas e polegar são pintados
 * por nós, porque o `accent-color` nativo não desenha nada disso.
 */
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
  label?: ReactNode;
  hint?: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const passos = step > 0 ? Math.round((max - min) / step) : 0;
  // acima de ~16 divisões as marcas viram uma linha cinza contínua e só sujam
  const marcas = passos > 0 && passos <= 16 ? passos : 0;
  // o centro do polegar não anda a largura toda do trilho: corrigir pela
  // metade dele em cada ponta é o que faz o rótulo parar debaixo do grabber
  const centro = `calc(${pct}% + ${(0.5 - pct / 100) * 20}px)`;

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-txt-primary">
          {label}
        </label>
      )}
      {hint && <p className="mt-0.5 text-xs text-txt-muted">{hint}</p>}

      <div className="relative mt-3 h-5">
        <div className="absolute inset-x-0 top-1.5 h-2 rounded-full bg-rail" aria-hidden="true" />
        <div
          className="absolute left-0 top-1.5 h-2 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
        {marcas > 0 && (
          <div className="pointer-events-none absolute inset-x-[10px] top-1.5 h-2" aria-hidden="true">
            {Array.from({ length: marcas - 1 }, (_, i) => (
              <span
                key={i}
                className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-chat/60"
                style={{ left: `${((i + 1) / marcas) * 100}%` }}
              />
            ))}
          </div>
        )}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent outline-none [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
        />
      </div>

      <div className="relative mt-1 h-4">
        <output
          htmlFor={id}
          style={{ left: centro }}
          className="absolute -translate-x-1/2 text-xs font-semibold text-txt-secondary"
        >
          {format(value)}
        </output>
      </div>
    </div>
  );
}

/**
 * Deslizador de **paradas nomeadas** (modo lento, janela de limpeza do
 * banimento): o rótulo de cada parada fica escrito embaixo do trilho e é
 * clicável.
 *
 * O valor viaja como **índice** da lista, e não como número: as paradas do
 * Discord não são lineares (0, 5, 10, 15, 30, 60, 300…) e um `range` sobre o
 * valor real deixaria quase todo o curso do trilho inútil. É por isso que ele
 * não é o `Slider` acima com um `format` diferente.
 */
export function SliderMarcas<T>({
  legenda,
  hint,
  opcoes,
  indice,
  onChange,
}: {
  legenda: string;
  hint?: ReactNode;
  opcoes: { valor: T; label: string }[];
  indice: number;
  onChange: (indice: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <Rotulo htmlFor={id}>{legenda}</Rotulo>
      <input
        id={id}
        type="range"
        min={0}
        max={opcoes.length - 1}
        step={1}
        value={indice}
        aria-valuetext={opcoes[indice]?.label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-rail accent-accent"
      />
      <div className="mt-1.5 flex justify-between gap-1">
        {opcoes.map((o, i) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(i)}
            aria-pressed={i === indice}
            className={`min-w-0 truncate text-[11px] font-medium transition ${
              i === indice ? "text-txt-primary" : "text-txt-muted hover:text-txt-normal"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="mt-2 text-xs text-txt-muted">{hint}</p>}
    </div>
  );
}

/* ─────────────────────────── lista suspensa ─────────────────────────── */

/**
 * Lista suspensa própria (dispositivos, canais, duração, motivo).
 *
 * O `<select>` nativo abre um popup do sistema operacional, que não aceita a
 * paleta do app: no meio de uma tela escura ele aparece branco no Windows. Aqui
 * o popover é nosso, com a mesma superfície dos menus de contexto.
 *
 * `emptyLabel` só existe quando "nenhum" é uma escolha válida (canal de regras,
 * filtro de cargo): sem ele a lista não ganha a linha vazia, que é o caso dos
 * modais, onde toda opção tem valor.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  emptyLabel,
  hint,
  disabled,
  semDivisoria = false,
}: {
  label?: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  emptyLabel?: string;
  hint?: ReactNode;
  disabled?: boolean;
  semDivisoria?: boolean;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const atual = options.find((o) => o.value === value);

  return (
    <div className={semDivisoria ? "" : "border-b border-border py-3 last:border-b-0"}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
        >
          {label}
        </label>
      )}
      <div ref={caixaRef} className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && aberto) {
              e.stopPropagation();
              setAberto(false);
            }
          }}
          className="flex h-10 w-full items-center gap-2 rounded-[3px] border border-border bg-input px-2.5 text-left text-sm text-txt-normal outline-none transition-colors hover:border-border-strong-hover focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={`min-w-0 flex-1 truncate ${atual ? "" : "text-txt-muted"}`}>
            {atual?.label ?? emptyLabel}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-txt-muted transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </button>

        {aberto && (
          <ul
            role="listbox"
            aria-label={typeof label === "string" ? label : undefined}
            className="anim-menu absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[240px] overflow-y-auto rounded-[4px] bg-overlay p-1 shadow-high"
          >
            {emptyLabel !== undefined && (
              <ItemDeLista
                rotulo={emptyLabel}
                ativo={!atual}
                onSelect={() => {
                  onChange("");
                  setAberto(false);
                }}
              />
            )}
            {options.map((o) => (
              <ItemDeLista
                key={o.value}
                rotulo={o.label}
                ativo={o.value === value}
                onSelect={() => {
                  onChange(o.value);
                  setAberto(false);
                }}
              />
            ))}
          </ul>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-txt-muted">{hint}</p>}
    </div>
  );
}

function ItemDeLista({
  rotulo,
  ativo,
  onSelect,
}: {
  rotulo: string;
  ativo: boolean;
  onSelect: () => void;
}) {
  return (
    <li role="option" aria-selected={ativo}>
      <button
        type="button"
        onClick={onSelect}
        className={`flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-left text-sm transition ${
          ativo ? "bg-sel text-txt-primary" : "text-txt-normal hover:bg-hov"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{rotulo}</span>
        {ativo && <Check size={14} aria-hidden="true" className="shrink-0 text-accent" />}
      </button>
    </li>
  );
}
