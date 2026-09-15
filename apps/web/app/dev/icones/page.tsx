"use client";

import type { ComponentType } from "react";

import * as Icones from "@/components/ui/icones";

/**
 * Folha de contato do vocabulário de ícones (onda 0.5, PLANO-PARIDADE §0.5).
 *
 * Por que existe: `components/ui/icones.tsx` é o único ponto de importação de
 * ícone do app (design.md, princípio 7) — um ativo que saiu cortado, vazado ou
 * com o `viewBox` errado só aparece olhando, nunca no typecheck (§3.3 e §6.5 do
 * PROCESSO citam exatamente esse defeito passando três vezes). Esta página é o
 * jeito de fotografar o vocabulário inteiro de uma vez, sem abrir o app.
 *
 * Cada ícone é desenhado nos três tamanhos do Discord (16/20/24 — design.md,
 * "Tipografia"/ícones) e sobre as duas superfícies onde ele mais aparece: a
 * base escura do layout (`--background-base-lower`, ex.: barra de servidores)
 * e uma superfície elevada (`--background-surface-high`, ex.: cartão/popover).
 * Cor é sempre `currentColor` puxando `--text-default` — nunca hex, por
 * vocabulário do projeto.
 */

/**
 * O que sobrevive em `import * as Icones` depois que o TypeScript compila:
 * componentes (função, ou objeto memo/forwardRef com `$$typeof`). Um
 * `export type` (como `Icone`, o tipo de anotação do arquivo) já não existe
 * como propriedade do módulo em tempo de execução — o filtro por função é
 * suficiente hoje, e o ramo `$$typeof` é só resiliência a uma implementação
 * futura que passe a envolver algum ícone em `memo`/`forwardRef`.
 */
function ehComponenteReact(valor: unknown): valor is ComponentType<IconeProps> {
  if (typeof valor === "function") return true;
  if (typeof valor === "object" && valor !== null && "$$typeof" in valor) return true;
  return false;
}

type IconeProps = { size?: number | string; className?: string };

const TAMANHOS = [16, 20, 24] as const;

// `Object.entries` do módulo tipa o valor como a união exata dos ícones; o
// filtro vira uma lista nova de pares com o tipo genérico, em vez de um
// predicado sobre a união (que o TypeScript recusa por não ser atribuível).
const listaDeIcones = (Object.entries(Icones) as [string, unknown][])
  .flatMap(([nome, valor]): [string, ComponentType<IconeProps>][] => (ehComponenteReact(valor) ? [[nome, valor]] : []))
  .sort(([a], [b]) => a.localeCompare(b, "pt-BR"));

function Ficha({ nome, Icone }: { nome: string; Icone: ComponentType<IconeProps> }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border-subtle p-3">
      <div className="flex items-end gap-3 text-text-default">
        {TAMANHOS.map((tamanho) => (
          <Icone key={tamanho} size={tamanho} className="shrink-0" />
        ))}
      </div>
      <span className="break-all text-center text-text-xs text-text-default">{nome}</span>
    </div>
  );
}

function Faixa({ titulo, classeFundo }: { titulo: string; classeFundo: string }) {
  return (
    <section className={`${classeFundo} rounded-lg p-4`}>
      <h2 className="mb-4 text-heading-sm text-text-default">{titulo}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
        {listaDeIcones.map(([nome, Icone]) => (
          <Ficha key={nome} nome={nome} Icone={Icone} />
        ))}
      </div>
    </section>
  );
}

export default function PaginaFolhaDeIcones() {
  return (
    <main className="min-h-screen bg-background-base-lower px-6 py-8 text-text-default">
      <h1 className="mb-6 text-heading-xl text-text-default">Ícones ({listaDeIcones.length})</h1>
      <div className="flex flex-col gap-8">
        <Faixa titulo="Sobre background-base-lower" classeFundo="bg-background-base-lower" />
        <Faixa titulo="Sobre background-surface-high" classeFundo="bg-background-surface-high" />
      </div>
    </main>
  );
}
