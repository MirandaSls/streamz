"use client";

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "@/components/ui/icones";
import { destacarCodigo, type TipoDeTrecho } from "@/lib/markdown-core";

/**
 * Bloco de código da documentação: destaque de sintaxe, cartão com rótulo de
 * linguagem e botão de copiar.
 *
 * **Sem biblioteca de destaque.** O realce vem do `destacarCodigo` que o chat
 * já usa (`lib/markdown-core.ts`) — uma aproximação por léxico, não uma
 * gramática completa, que conhece js, python, json, bash e http. Trazer um
 * highlight.js só para esta página custaria mais peso do que a página inteira.
 *
 * **Por que o mapa de classes é daqui e não o `CLASSE_DO_TRECHO` de
 * `lib/markdown.tsx`:** aquele módulo é o renderizador de mensagem completo
 * (emoji, menções, stores do app). Importar a constante arrastaria tudo isso
 * para uma página **pública**, que ninguém logado precisa abrir. O que se
 * repete aqui são quinze nomes de token, não lógica.
 */
const CLASSE_DO_TRECHO: Record<TipoDeTrecho, string> = {
  keyword: "text-text-code-keyword",
  built_in: "text-text-code-type",
  type: "text-text-code-type",
  title: "text-text-code-title",
  literal: "text-text-code-variable",
  variable: "text-text-code-variable",
  attr: "text-text-code-attribute",
  meta: "text-text-code-decorator",
  property: "text-text-code-property",
  number: "text-text-code-number",
  string: "text-text-code-string",
  comment: "text-text-code-comment",
  name: "text-text-code-tag",
  addition: "bg-background-code-addition text-text-code-addition",
  deletion: "bg-background-code-deletion text-text-code-deletion",
};

export interface CodigoProps {
  codigo: string;
  /** linguagem do trecho (`js`, `python`, `json`, `bash`); sem gramática, sai sem cor. */
  linguagem?: string | null;
  className?: string;
}

/** Só o `<pre>` colorido, sem cartão — para compor dentro de outra caixa. */
export function Codigo({ codigo, linguagem = null, className = "" }: CodigoProps) {
  const trechos = destacarCodigo(codigo, linguagem ?? null);
  return (
    <pre
      // `[white-space:pre]` (e não `pre-wrap`): trecho de documentação é para
      // copiar e comparar linha a linha, e quebrar a linha de um `curl` no meio
      // faz o leitor achar que há uma quebra ali. Rola dentro de si.
      // A ligadura sai de propósito: com ela `===` vira `≡` e `=>` vira `⇒` na
      // tela, e quem digita à mão copia o glifo errado.
      className={`overflow-x-auto scroller-thin p-4 font-mono text-text-sm leading-[1.45] text-text-code [font-variant-ligatures:none] [tab-size:2] [text-size-adjust:none] [white-space:pre] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus ${className}`}
      tabIndex={0}
    >
      <code>
        {trechos
          ? trechos.map((t, i) =>
              t.tipo ? (
                <span key={i} className={CLASSE_DO_TRECHO[t.tipo]}>
                  {t.v}
                </span>
              ) : (
                <Fragment key={i}>{t.v}</Fragment>
              ),
            )
          : codigo}
      </code>
    </pre>
  );
}

export interface CercadoProps extends CodigoProps {
  /** o que aparece à esquerda da barra do cartão (nome do arquivo, linguagem). */
  rotulo?: ReactNode;
  /** o que vai à direita do rótulo, antes do botão de copiar (abas, método). */
  acoes?: ReactNode;
  /** altura máxima antes de rolar — o exemplo de resposta pode ser longo. */
  alturaMaxima?: string;
}

/** Cartão de código: barra com rótulo e "Copiar", corpo colorido. */
export function Cercado({
  codigo,
  linguagem = null,
  rotulo,
  acoes,
  alturaMaxima,
  className = "",
}: CercadoProps) {
  return (
    <div className={`overflow-hidden rounded-lg border border-border-subtle bg-background-code ${className}`}>
      <div className="flex min-h-[40px] items-center gap-2 border-b border-border-subtle bg-background-base-low px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-text-xs uppercase tracking-wide text-text-muted">
          {rotulo ?? linguagem ?? ""}
        </span>
        {acoes}
        <BotaoCopiar texto={codigo} />
      </div>
      <div className={alturaMaxima ? `overflow-y-auto scroller-thin ${alturaMaxima}` : undefined}>
        <Codigo codigo={codigo} linguagem={linguagem} />
      </div>
    </div>
  );
}

/**
 * Copia e diz que copiou.
 *
 * Sem `toast`: a página é pública e não tem o shell do app por baixo, então
 * não há onde um toast aparecer. O retorno mora no próprio botão — inclusive o
 * de falha, que acontece de verdade quando a página é servida em `http:` fora
 * de `localhost` e o navegador esconde a área de transferência.
 */
export function BotaoCopiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");

  useEffect(() => {
    if (estado === "parado") return;
    const t = window.setTimeout(() => setEstado("parado"), 2000);
    return () => window.clearTimeout(t);
  }, [estado]);

  const copiar = useCallback(() => {
    const escrita = navigator.clipboard?.writeText(texto);
    if (!escrita) {
      setEstado("falhou");
      return;
    }
    escrita.then(
      () => setEstado("copiado"),
      () => setEstado("falhou"),
    );
  }, [texto]);

  const copiado = estado === "copiado";
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={copiado ? "Copiado" : rotulo}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-border-subtle bg-background-surface-high px-2 text-text-xs font-medium text-text-subtle transition-colors hover:bg-interactive-background-hover hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus celular:h-[44px] celular:px-3"
    >
      {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span aria-live="polite">{copiado ? "Copiado" : estado === "falhou" ? "Não deu" : rotulo}</span>
    </button>
  );
}
