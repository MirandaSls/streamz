"use client";

import { Fragment, type ReactNode } from "react";
import { Texto } from "@/components/desenvolvedores/Texto";
import {
  ancoraDoEsquema,
  descreverTipo,
  hrefDaAncora,
  type CampoDeEsquema,
  type Esquema,
  type ValorJson,
} from "@/components/desenvolvedores/especificacao";

/**
 * As peças que se repetem na referência: a pastilha do método, o tipo de um
 * campo (com o `$ref` virando link) e a tabela de campos.
 *
 * **A tabela tem duas colunas, não quatro.** Nome, tipo e "obrigatório" moram
 * na mesma célula, empilhados; a descrição ocupa a outra. Com quatro colunas
 * ela só caberia num contêiner que rola na horizontal, e a coluna que sobra da
 * tela é sempre a da descrição — a única que o leitor veio ler. Empilhada, a
 * tabela cabe em 360px sem rolagem e continua sendo uma `<table>` de verdade,
 * com `<th scope>`, para quem navega por leitor de tela.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Método
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cor por verbo, pela semântica que o Discord já dá aos feedbacks: ler é
 * informativo, criar é positivo, alterar é aviso, apagar é crítico. O fundo é
 * o token de 8% de alfa, então a tinta contrasta com a superfície de trás, não
 * com o tingimento.
 */
const CORES_DE_METODO: Record<string, string> = {
  GET: "border-border-feedback-info bg-background-feedback-info text-text-feedback-info",
  POST: "border-border-feedback-positive bg-background-feedback-positive text-text-feedback-positive",
  PUT: "border-border-feedback-warning bg-background-feedback-warning text-text-feedback-warning",
  PATCH: "border-border-feedback-warning bg-background-feedback-warning text-text-feedback-warning",
  DELETE: "border-border-feedback-critical bg-background-feedback-critical text-text-feedback-critical",
};

const COR_NEUTRA = "border-border-subtle bg-background-surface-high text-text-subtle";

export function PastilhaDeMetodo({ metodo, className = "" }: { metodo: string; className?: string }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded border px-2 font-mono text-text-xs font-bold uppercase tracking-wide ${
        CORES_DE_METODO[metodo] ?? COR_NEUTRA
      } ${className}`}
    >
      {metodo}
    </span>
  );
}

/** Pastilha de código de resposta: 2xx positivo, 4xx/5xx crítico, resto neutro. */
export function PastilhaDeCodigo({ codigo, className = "" }: { codigo: string; className?: string }) {
  const numero = Number(codigo);
  const cor =
    numero >= 200 && numero < 300
      ? CORES_DE_METODO.POST
      : numero >= 400
        ? CORES_DE_METODO.DELETE
        : numero >= 300
          ? CORES_DE_METODO.PATCH
          : COR_NEUTRA;
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded border px-2 font-mono text-text-xs font-bold ${cor} ${className}`}
    >
      {codigo}
    </span>
  );
}

/** Rótulo pequeno e neutro (`obrigatório`, `sempre`, `query`). */
export function Etiqueta({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: "neutro" | "forte" | "aviso" | "positivo" | "critico";
}) {
  const cores =
    tom === "forte"
      ? "border-border-strong text-text-default"
      : tom === "aviso"
        ? "border-border-feedback-warning text-text-feedback-warning"
        : tom === "positivo"
          ? "border-border-feedback-positive text-text-feedback-positive"
          : tom === "critico"
            ? "border-border-feedback-critical text-text-feedback-critical"
            : "border-border-subtle text-text-muted";
  return (
    <span className={`inline-flex h-[18px] items-center rounded border px-1.5 text-text-xxs font-semibold uppercase tracking-wide ${cores}`}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipo
// ─────────────────────────────────────────────────────────────────────────────

/** O tipo de um campo, com cada `$ref` citado virando link para o esquema. */
export function TipoDoCampo({ esquema }: { esquema: Esquema | undefined }) {
  const { rotulo, refs, aceitaNulo } = descreverTipo(esquema);
  return (
    <span className="font-mono text-text-xs text-text-muted">
      {rotulo ? <span>{rotulo}</span> : null}
      {refs.map((nome, i) => (
        <Fragment key={nome}>
          {i > 0 || rotulo ? " " : null}
          <a
            href={hrefDaAncora(ancoraDoEsquema(nome))}
            className="text-text-link underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            {nome}
          </a>
        </Fragment>
      ))}
      {aceitaNulo ? <span> ou nulo</span> : null}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela
// ─────────────────────────────────────────────────────────────────────────────

export interface LinhaDeCampo {
  nome: string;
  esquema?: Esquema;
  obrigatorio?: boolean;
  /** `path`, `query`, `header` — só nos parâmetros. */
  origem?: string;
  descricao?: string;
  obsoleto?: boolean;
}

export function TabelaDeCampos({ titulo, campos }: { titulo: string; campos: LinhaDeCampo[] }) {
  if (!campos.length) return null;
  return (
    <div className="mt-6">
      <h4 className="mb-2 text-text-sm font-semibold uppercase tracking-wide text-text-subtle">{titulo}</h4>
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr className="border-b border-border-subtle">
            <th scope="col" className="w-[42%] py-2 pr-3 text-text-xs font-semibold uppercase tracking-wide text-text-muted">
              Campo
            </th>
            <th scope="col" className="py-2 text-text-xs font-semibold uppercase tracking-wide text-text-muted">
              Descrição
            </th>
          </tr>
        </thead>
        <tbody>
          {campos.map((campo) => (
            <tr key={`${campo.origem ?? ""}:${campo.nome}`} className="border-b border-border-subtle align-top last:border-b-0">
              <th scope="row" className="py-3 pr-3 font-normal">
                <code className="block break-words font-mono text-text-sm font-semibold text-text-default">
                  {campo.nome}
                </code>
                <span className="mt-1 block">
                  <TipoDoCampo esquema={campo.esquema} />
                </span>
                {/* só existe quando há etiqueta: um flex vazio com margem
                    deixaria 6px de vão em toda linha sem etiqueta nenhuma */}
                {campo.origem || campo.obrigatorio || campo.obsoleto || campo.esquema?.deprecated ? (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {campo.origem ? <Etiqueta>{campo.origem}</Etiqueta> : null}
                    {campo.obrigatorio ? <Etiqueta tom="forte">obrigatório</Etiqueta> : null}
                    {campo.obsoleto || campo.esquema?.deprecated ? <Etiqueta tom="aviso">obsoleto</Etiqueta> : null}
                  </span>
                ) : null}
              </th>
              <td className="py-3 text-text-sm leading-relaxed text-text-subtle">
                <DescricaoDoCampo campo={campo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Descrição, valores possíveis e padrão — nessa ordem, que é a da pergunta. */
function DescricaoDoCampo({ campo }: { campo: LinhaDeCampo }) {
  const texto = campo.descricao ?? campo.esquema?.description;
  const valores = campo.esquema?.enum;
  const padrao = campo.esquema?.default;
  const limites = limitesDoEsquema(campo.esquema);

  if (!texto && !valores?.length && padrao === undefined && !limites) {
    return <span className="text-text-muted">—</span>;
  }

  return (
    <>
      {texto ? <Texto conteudo={texto} nivelBase={4} className="gap-2" /> : null}
      {valores?.length ? (
        <p className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-text-xs uppercase tracking-wide text-text-muted">Valores:</span>
          {valores.map((valor, i) => (
            <code
              key={i}
              className="rounded border border-border-normal bg-background-code px-1.5 py-0.5 font-mono text-text-xs text-text-code"
            >
              {String(valor)}
            </code>
          ))}
        </p>
      ) : null}
      {padrao !== undefined ? (
        <p className="mt-2 text-text-xs text-text-muted">
          Padrão:{" "}
          <code className="rounded border border-border-normal bg-background-code px-1.5 py-0.5 font-mono text-text-code">
            {rotuloDeValor(padrao)}
          </code>
        </p>
      ) : null}
      {limites ? <p className="mt-2 text-text-xs text-text-muted">{limites}</p> : null}
    </>
  );
}

function rotuloDeValor(valor: ValorJson): string {
  if (typeof valor === "string") return valor;
  try {
    return JSON.stringify(valor) ?? String(valor);
  } catch {
    return String(valor);
  }
}

/** "entre 1 e 100", "até 2000 caracteres" — o que o esquema declarou de limite. */
function limitesDoEsquema(esquema: Esquema | undefined): string | null {
  if (!esquema) return null;
  const partes: string[] = [];
  if (esquema.minLength !== undefined || esquema.maxLength !== undefined) {
    const min = esquema.minLength ?? 0;
    partes.push(
      esquema.maxLength !== undefined ? `${min} a ${esquema.maxLength} caracteres` : `no mínimo ${min} caracteres`,
    );
  }
  if (esquema.minimum !== undefined || esquema.maximum !== undefined) {
    if (esquema.minimum !== undefined && esquema.maximum !== undefined) {
      partes.push(`entre ${esquema.minimum} e ${esquema.maximum}`);
    } else if (esquema.minimum !== undefined) partes.push(`a partir de ${esquema.minimum}`);
    else partes.push(`até ${esquema.maximum}`);
  }
  return partes.length ? partes.join(" · ") : null;
}

/** Converte os campos de um esquema nas linhas da tabela. */
export function linhasDeEsquema(campos: CampoDeEsquema[]): LinhaDeCampo[] {
  return campos.map((campo) => ({
    nome: campo.nome,
    esquema: campo.esquema,
    obrigatorio: campo.obrigatorio,
  }));
}
