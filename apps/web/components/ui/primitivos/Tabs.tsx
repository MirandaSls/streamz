"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "./Badge";

/**
 * Barra de abas do Discord.
 *
 * Medido (cartão 0.4-pequenos):
 * - `sublinhado` (a da refresh, `.tabs_b292bc` em `css-bruto/722514.*.css`):
 *   trilho de 2px `--border-subtle` full-width com o indicador de 2px
 *   `--tabs-indicator-default` (limão pela regra da marca) deslizando por baixo
 *   do item ativo (`translate`+`width`, confirmado pelo CSS: `transition-
 *   property:translate,width`); itens com gap 32 (`--space-32`), padding
 *   0 0 16 (`--space-16`), texto `--text-subtle` → conteúdo com gap 8
 *   (`--space-8`, ícone/rótulo/contador). Foco no conteúdo: outline 2px
 *   `--border-focus` com offset 2 e raio 4 (`--radius-xs`) — tudo isso saiu do
 *   CSS bruto, letra por letra.
 *
 *   O rótulo selecionado **diverge do CSS**: a classe achada diz
 *   `color:var(--text-strong)`, mas os dois prints medidos — Caixa de Entrada
 *   (113500, "Menções") e Editar cargo (113750, "Exibição") — mostram o texto
 *   e o traço na MESMA cor azul do indicador (`#798df9`, exatamente
 *   `--tabs-indicator-default`/`--text-brand`), não branco. Print > CSS
 *   (ADR-0009 §7): o ativo usa `text-brand` (limão aqui), não `text-strong`.
 *   Tamanho do rótulo: cap-height ~10px nos dois prints ⇒ 14px (`text-text-
 *   sm`); peso "não medido" com confiança — o CSS do item não declara
 *   `font-weight` (herda 400), então fica `font-normal` em vez de chutar 600.
 * - `pilula` (a de Amigos, `.filterTab_f2af23` em `sob-demanda/820f054b9dbb1129.css`):
 *   altura **32** (`h-8`), confirmado em pixel no print de Amigos (101638):
 *   pílula de y=47 a y=79 na aba "Disponível". Raio de pílula, padding 0×12
 *   (`--space-12`, CSS), texto 14px peso 400 (`font-weight:400` no CSS,
 *   condizente com o cap-height medido) em `--text-default` (cor única do
 *   CSS, sem diferença por seleção).
 *
 *   O preenchimento **também diverge do CSS** no mesmo print: a aba
 *   selecionada ("Disponível") tem fundo sólido que bate, pixel a pixel, com
 *   `--control-secondary-background-active` (#333338 = blend de #9696a0 a 20%
 *   sobre #1a1a1e — a matemática fecha exata), não com "`--…-default` + borda
 *   `--brand-500`" que o CSS descreve: não há nenhuma borda azul visível nas
 *   quatro bordas da pílula (conferido linha a linha). A aba não-selecionada
 *   ("Todos") não tem NENHUM preenchimento — funde com o fundo do cabeçalho.
 *   Fica: selecionada = `control-secondary-background-active` sólido, sem
 *   borda; repouso = transparente; hover = `control-secondary-background-
 *   hover` (do CSS — estado que a foto não pode mostrar).
 * - Contador na aba: `Badge` numérico.
 * - `role="tablist"`/`role="tab"` com `aria-selected`; setas ← → trocam a aba
 *   (só entre as habilitadas) e levam o foco junto.
 */
export interface AbaDeTabs<T extends string = string> {
  valor: T;
  rotulo: ReactNode;
  /** Número no `Badge` ao lado do rótulo (0 esconde). */
  contador?: number;
  desabilitada?: boolean;
}

export interface TabsProps<T extends string = string> {
  valor: T;
  aoMudar: (valor: T) => void;
  abas: AbaDeTabs<T>[];
  /** Padrão `sublinhado`. */
  variante?: "sublinhado" | "pilula";
  larguraTotal?: boolean;
  /** Nome acessível da lista de abas. */
  rotulo: string;
  className?: string;
}

const FOCO =
  "rounded outline-none group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-border-focus group-focus-visible:outline-offset-2";

export function Tabs<T extends string = string>({
  valor,
  aoMudar,
  abas,
  variante = "sublinhado",
  larguraTotal = false,
  rotulo,
  className = "",
}: TabsProps<T>) {
  const refs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [indicador, setIndicador] = useState<{ x: number; largura: number } | null>(null);

  // Reposiciona o indicador sob a aba ativa — só a variante sublinhado tem
  // trilho para deslizar; a pílula marca a seleção no próprio fundo do botão.
  // a lista de abas entra como texto: um array novo a cada render reposicionaria à toa
  const chaveDasAbas = abas.map((a) => a.valor).join("|");
  useEffect(() => {
    if (variante !== "sublinhado") return;
    const el = refs.current.get(valor);
    if (el) setIndicador({ x: el.offsetLeft, largura: el.offsetWidth });
  }, [valor, variante, chaveDasAbas]);

  function moverFoco(e: KeyboardEvent<HTMLButtonElement>, indiceAtual: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const habilitadas = abas.filter((a) => !a.desabilitada);
    if (!habilitadas.length) return;
    const posAtual = habilitadas.findIndex((a) => a.valor === abas[indiceAtual]?.valor);
    const passo = e.key === "ArrowRight" ? 1 : -1;
    const proxima = habilitadas[(posAtual + passo + habilitadas.length) % habilitadas.length];
    aoMudar(proxima.valor);
    refs.current.get(proxima.valor)?.focus();
  }

  if (variante === "pilula") {
    return (
      <div role="tablist" aria-label={rotulo} className={`flex flex-wrap items-center gap-2 ${className}`}>
        {abas.map((a, i) => {
          const ativa = a.valor === valor;
          return (
            <button
              key={a.valor}
              ref={(el) => {
                if (el) refs.current.set(a.valor, el);
                else refs.current.delete(a.valor);
              }}
              type="button"
              role="tab"
              aria-selected={ativa}
              disabled={a.desabilitada}
              tabIndex={ativa ? 0 : -1}
              onClick={() => aoMudar(a.valor)}
              onKeyDown={(e) => moverFoco(e, i)}
              className={`group flex h-8 items-center gap-2 whitespace-nowrap rounded-full px-3 text-text-sm font-normal text-text-default transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                ativa ? "bg-control-secondary-background-active" : "bg-transparent hover:bg-control-secondary-background-hover"
              }`}
            >
              {a.rotulo}
              {!!a.contador && <Badge tipo="numero" valor={a.contador} />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="tablist" aria-label={rotulo} className={`relative flex w-full items-center gap-8 overflow-x-auto ${className}`}>
      {/* trilho: 2px full-width, por baixo de tudo */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-border-subtle" />
      {/* indicador: mesma altura, desliza sob a aba ativa por transform+width */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-tabs-indicator-default transition-[transform,width] duration-300 ease-out"
        style={indicador ? { transform: `translateX(${indicador.x}px)`, width: `${indicador.largura}px` } : { width: 0 }}
      />
      {abas.map((a, i) => {
        const ativa = a.valor === valor;
        return (
          <button
            key={a.valor}
            ref={(el) => {
              if (el) refs.current.set(a.valor, el);
              else refs.current.delete(a.valor);
            }}
            type="button"
            role="tab"
            aria-selected={ativa}
            disabled={a.desabilitada}
            tabIndex={ativa ? 0 : -1}
            onClick={() => aoMudar(a.valor)}
            onKeyDown={(e) => moverFoco(e, i)}
            className={`group relative whitespace-nowrap pb-4 outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
              larguraTotal ? "min-w-0 flex-1" : "flex-none"
            }`}
          >
            <span className={`flex items-center justify-center gap-2 text-text-sm font-normal ${ativa ? "text-text-brand" : "text-text-subtle"} ${FOCO}`}>
              {a.rotulo}
              {!!a.contador && <Badge tipo="numero" valor={a.contador} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
