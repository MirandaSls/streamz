"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "@/components/ui/icones";
import { Cercado } from "@/components/desenvolvedores/Codigo";

/**
 * O pedacinho de Markdown que a documentação precisa: título, parágrafo,
 * lista, citação, tabela, régua, bloco de código cercado e, na linha, código,
 * negrito, itálico e link.
 *
 * **Por que não o `Markdown` de `lib/markdown.tsx`:** aquele é o Markdown *do
 * chat* — mede 1rem com `white-space: break-spaces`, entende `<@id>`, `:emoji:`
 * e carimbo de tempo, e não entende tabela. Uma `description` de OpenAPI é
 * CommonMark: tem tabela, tem link `[x](y)` e não tem menção. Renderizar uma
 * com o outro dá resultado errado nos dois sentidos — tabela virando texto
 * solto e `<@...>` sumindo como se fosse tag.
 *
 * **Por que não uma biblioteca:** o pedido é explícito, e a gramática abaixo
 * cabe em duzentas linhas. O que ela não reconhece cai em parágrafo — nunca em
 * erro, nunca em HTML cru (nada aqui usa `dangerouslySetInnerHTML`: o texto
 * vem de um documento servido pela API, e escapar por conta própria seria
 * inventar uma superfície de XSS onde não há nenhuma).
 */

export interface TextoProps {
  conteudo: string;
  /**
   * Nível do primeiro título do texto. O documento já tem `h1` (o nome da
   * página) e `h2` (a seção), então um guia dentro de uma seção começa em 3 —
   * pular nível é justamente o que um leitor de tela usa para se perder.
   */
  nivelBase?: 3 | 4;
  className?: string;
}

export function Texto({ conteudo, nivelBase = 3, className = "" }: TextoProps) {
  const blocos = analisar(conteudo);
  if (!blocos.length) return null;

  // O nível dos títulos é **relativo ao próprio texto**, não absoluto: os guias
  // da especificação começam em `##` (o `#` seria o título da página, que já
  // existe), e uma `description` de rota que use `###` começa mais fundo. Sem
  // esta conta, o primeiro título de um guia cairia em `h5` e sairia com a
  // aparência de rótulo miúdo, três degraus abaixo do que ele é.
  const topo = blocos.reduce((menor, b) => (b.t === "titulo" ? Math.min(menor, b.nivel) : menor), 6);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {blocos.map((bloco, i) => (
        <Bloco key={i} bloco={bloco} nivelBase={nivelBase} topo={topo} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocos
// ─────────────────────────────────────────────────────────────────────────────

type BlocoDeTexto =
  | { t: "titulo"; nivel: number; texto: string }
  | { t: "paragrafo"; texto: string }
  | { t: "lista"; ordenada: boolean; itens: string[] }
  | { t: "citacao"; texto: string }
  | { t: "codigo"; linguagem: string | null; codigo: string }
  | { t: "tabela"; cabecalho: string[]; linhas: string[][] }
  | { t: "regua" };

const CERCA = /^\s*```+\s*([\w+#-]*)\s*$/;
const TITULO = /^(#{1,6})\s+(.*)$/;
const ITEM = /^\s*[-*+]\s+(.*)$/;
const ITEM_ORDENADO = /^\s*\d+[.)]\s+(.*)$/;
const CITACAO = /^\s*>\s?(.*)$/;
const REGUA = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const LINHA_DE_TABELA = /^\s*\|.*\|\s*$/;
const SEPARADOR_DE_TABELA = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/;

function analisar(fonte: string): BlocoDeTexto[] {
  const linhas = fonte.replace(/\r\n?/g, "\n").split("\n");
  const blocos: BlocoDeTexto[] = [];
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i];

    if (!linha.trim()) {
      i += 1;
      continue;
    }

    const cerca = CERCA.exec(linha);
    if (cerca) {
      const corpo: string[] = [];
      i += 1;
      while (i < linhas.length && !CERCA.test(linhas[i])) {
        corpo.push(linhas[i]);
        i += 1;
      }
      i += 1; // a cerca de fechamento (ou o fim do texto)
      blocos.push({ t: "codigo", linguagem: cerca[1] || null, codigo: corpo.join("\n") });
      continue;
    }

    if (REGUA.test(linha)) {
      blocos.push({ t: "regua" });
      i += 1;
      continue;
    }

    const titulo = TITULO.exec(linha);
    if (titulo) {
      blocos.push({ t: "titulo", nivel: titulo[1].length, texto: titulo[2].trim() });
      i += 1;
      continue;
    }

    // tabela: só é tabela com a linha de separador logo abaixo do cabeçalho —
    // senão um parágrafo que começa com "|" viraria uma tabela de uma coluna
    if (LINHA_DE_TABELA.test(linha) && SEPARADOR_DE_TABELA.test(linhas[i + 1] ?? "")) {
      const cabecalho = celulas(linha);
      const corpo: string[][] = [];
      i += 2;
      while (i < linhas.length && LINHA_DE_TABELA.test(linhas[i])) {
        corpo.push(celulas(linhas[i]));
        i += 1;
      }
      blocos.push({ t: "tabela", cabecalho, linhas: corpo });
      continue;
    }

    if (CITACAO.test(linha)) {
      const partes: string[] = [];
      while (i < linhas.length && CITACAO.test(linhas[i])) {
        partes.push((CITACAO.exec(linhas[i]) as RegExpExecArray)[1]);
        i += 1;
      }
      blocos.push({ t: "citacao", texto: partes.join(" ").trim() });
      continue;
    }

    const ordenada = ITEM_ORDENADO.test(linha);
    if (ordenada || ITEM.test(linha)) {
      const regra = ordenada ? ITEM_ORDENADO : ITEM;
      const itens: string[] = [];
      while (i < linhas.length && regra.test(linhas[i])) {
        let texto = (regra.exec(linhas[i]) as RegExpExecArray)[1];
        i += 1;
        // continuação recuada do mesmo item (duas ou mais colunas de recuo)
        while (i < linhas.length && /^\s{2,}\S/.test(linhas[i]) && !regra.test(linhas[i])) {
          texto += ` ${linhas[i].trim()}`;
          i += 1;
        }
        itens.push(texto);
      }
      blocos.push({ t: "lista", ordenada, itens });
      continue;
    }

    const partes: string[] = [];
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      !CERCA.test(linhas[i]) &&
      !TITULO.test(linhas[i]) &&
      !CITACAO.test(linhas[i]) &&
      !REGUA.test(linhas[i]) &&
      !ITEM.test(linhas[i]) &&
      !ITEM_ORDENADO.test(linhas[i])
    ) {
      partes.push(linhas[i].trim());
      i += 1;
    }
    if (partes.length) blocos.push({ t: "paragrafo", texto: partes.join(" ") });
    else i += 1;
  }

  return blocos;
}

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function Bloco({ bloco, nivelBase, topo }: { bloco: BlocoDeTexto; nivelBase: 3 | 4; topo: number }) {
  switch (bloco.t) {
    case "titulo": {
      // o título mais raso do texto vira o `nivelBase` da seção que o embrulha,
      // e o resto desce a partir dele, sem passar de h6
      const degrau = Math.max(0, bloco.nivel - topo);
      const nivel = Math.min(6, nivelBase + degrau);
      const Tag = `h${nivel}` as "h3" | "h4" | "h5" | "h6";
      const grande = degrau === 0;
      return (
        <Tag
          className={`mt-2 font-semibold text-text-strong ${grande ? "text-heading-md" : "text-text-sm uppercase tracking-wide text-text-subtle"}`}
        >
          <Linha texto={bloco.texto} />
        </Tag>
      );
    }
    case "paragrafo":
      return (
        <p className="text-text-md leading-relaxed text-text-subtle">
          <Linha texto={bloco.texto} />
        </p>
      );
    case "lista": {
      const Tag = bloco.ordenada ? "ol" : "ul";
      return (
        <Tag
          className={`flex list-outside flex-col gap-2 pl-5 text-text-md leading-relaxed text-text-subtle ${bloco.ordenada ? "list-decimal" : "list-disc"}`}
        >
          {bloco.itens.map((item, i) => (
            <li key={i} className="marker:text-text-muted">
              <Linha texto={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "citacao":
      return (
        <blockquote className="border-l-2 border-border-strong pl-4 text-text-md leading-relaxed text-text-muted">
          <Linha texto={bloco.texto} />
        </blockquote>
      );
    case "codigo":
      return <Cercado codigo={bloco.codigo} linguagem={bloco.linguagem} />;
    case "regua":
      return <hr className="border-t border-border-subtle" />;
    case "tabela":
      return (
        <div className="overflow-x-auto scroller-thin rounded-lg border border-border-subtle">
          <table className="w-full min-w-[420px] border-collapse text-left text-text-sm">
            <thead>
              <tr className="bg-background-base-low">
                {bloco.cabecalho.map((celula, i) => (
                  <th key={i} scope="col" className="px-3 py-2 font-semibold text-text-default">
                    <Linha texto={celula} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloco.linhas.map((linha, i) => (
                <tr key={i} className="border-t border-border-subtle align-top">
                  {linha.map((celula, j) => (
                    <td key={j} className="px-3 py-2 text-text-subtle">
                      <Linha texto={celula} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Linha
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ordem das alternativas é a precedência: código primeiro (dentro de
 * `` `**x**` `` o asterisco é literal), depois link, negrito e itálico.
 *
 * A expressão é criada **a cada chamada**: uma `/g` de módulo carrega
 * `lastIndex` entre invocações, e duas linhas renderizadas na mesma passagem
 * começariam a segunda no meio da primeira.
 */
const INLINE = () =>
  /(`[^`\n]+`)|(\[[^\]\n]*\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

/** Texto de uma linha, com os marcadores de ênfase já convertidos. */
export function Linha({ texto }: { texto: string }) {
  const pedacos: ReactNode[] = [];
  let ultimo = 0;
  let chave = 0;

  const regra = INLINE();
  for (let achado = regra.exec(texto); achado; achado = regra.exec(texto)) {
    if (achado.index > ultimo) pedacos.push(<Fragment key={chave++}>{texto.slice(ultimo, achado.index)}</Fragment>);
    const bruto = achado[0];
    ultimo = achado.index + bruto.length;

    if (bruto.startsWith("`")) {
      pedacos.push(
        <code
          key={chave++}
          className="rounded border border-border-normal bg-background-code px-[0.3em] py-[0.1em] font-mono text-[0.9em] text-text-code"
        >
          {bruto.slice(1, -1)}
        </code>,
      );
      continue;
    }

    if (bruto.startsWith("[")) {
      const corte = bruto.indexOf("](");
      pedacos.push(
        <LinkDoTexto key={chave++} rotulo={bruto.slice(1, corte)} href={bruto.slice(corte + 2, -1)} />,
      );
      continue;
    }

    if (bruto.startsWith("**") || bruto.startsWith("__")) {
      pedacos.push(
        <strong key={chave++} className="font-semibold text-text-default">
          {bruto.slice(2, -2)}
        </strong>,
      );
      continue;
    }

    pedacos.push(
      <em key={chave++} className="italic">
        {bruto.slice(1, -1)}
      </em>,
    );
  }

  if (ultimo < texto.length) pedacos.push(<Fragment key={chave++}>{texto.slice(ultimo)}</Fragment>);
  return <>{pedacos}</>;
}

/**
 * Link do texto. Âncora e rota interna vão por `next/link` (sem recarregar a
 * página); o resto abre em aba nova com o ícone que avisa disso — e com
 * `rel="noreferrer"`, porque um `target="_blank"` sem ele entrega `window.opener`
 * ao destino.
 */
function LinkDoTexto({ rotulo, href }: { rotulo: string; href: string }) {
  const classe =
    "text-text-link underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";
  const interno = href.startsWith("#") || href.startsWith("/");
  if (interno) {
    return (
      <Link href={href} className={classe}>
        {rotulo || href}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${classe} inline-flex items-center gap-1`}>
      {rotulo || href}
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}
