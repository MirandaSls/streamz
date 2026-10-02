"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Download, FileText } from "@/components/ui/icones";
import { attachmentDisplayName, type Attachment } from "@streamz/shared";
import {
  LIMITE_DA_PREVIA_BYTES,
  LINHAS_DA_PREVIA_RECOLHIDA,
  recortarPrevia,
} from "@/lib/texto-longo";
import { formatBytes } from "@/lib/format";
import { baixarAnexo, baixarTextoDoAnexo } from "@/lib/imagem-arquivo";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "ok"; texto: string; cortadoPeloLimite: boolean }
  | { tipo: "erro" };

/**
 * Prévia de um anexo de texto (`message.txt`, gerado quando a mensagem passa
 * do limite, e qualquer outro que `ehTextoPrevisualizavel` aceite): um
 * cartão como o do Discord: área de código com rolagem própria em cima e, na
 * barra de baixo, nome/tamanho e os botões de baixar e expandir.
 *
 * Busca sob demanda (a mensagem não carrega o conteúdo de anexos que ninguém
 * vai ler) e corta em `LIMITE_DA_PREVIA_BYTES`: arquivo maior que isso nunca
 * desce inteiro para o navegador, só o começo. `LINHAS_DA_PREVIA_RECOLHIDA`
 * decide quanto aparece antes do "Expandir" — que revela o que já baixou, não
 * busca mais.
 *
 * Erro de rede/CORS/permissão não quebra a mensagem: `fallback` é o cartão de
 * arquivo comum já pronto de quem chamou (`<Arquivo anexo={a} />`), a mesma
 * saída que qualquer outro anexo sem prévia usa.
 */
export default function PreviaDeTexto({
  anexo,
  fallback,
}: {
  anexo: Attachment;
  fallback: ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: "carregando" });
    setAberto(false);
    baixarTextoDoAnexo(anexo.url, anexo.id, LIMITE_DA_PREVIA_BYTES)
      .then(({ texto, cortado }) => {
        if (!cancelado) setEstado({ tipo: "ok", texto, cortadoPeloLimite: cortado });
      })
      .catch(() => {
        if (!cancelado) setEstado({ tipo: "erro" });
      });
    return () => {
      cancelado = true;
    };
  }, [anexo.url, anexo.id]);

  if (estado.tipo === "erro") return <>{fallback}</>;

  const nome = attachmentDisplayName(anexo);

  // "Expandir" só revela o que já veio no download (até o limite da prévia);
  // não dispara uma segunda busca.
  let temMaisLinhas = false;
  if (estado.tipo === "ok") {
    const recolhida = recortarPrevia(estado.texto, LINHAS_DA_PREVIA_RECOLHIDA);
    temMaisLinhas = recolhida.cortado;
  }

  const classeBotao =
    "grid h-8 w-8 shrink-0 place-items-center rounded text-text-subtle hover:bg-interactive-background-hover hover:text-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-link celular:h-[44px] celular:w-[44px]";

  return (
    <div className="w-[432px] max-w-full overflow-hidden rounded-lg border border-border-subtle bg-background-base-lower">
      {estado.tipo === "carregando" && (
        <div
          aria-hidden="true"
          className="animate-pulse space-y-1.5 bg-background-code p-3"
        >
          <div className="h-3 w-11/12 rounded bg-background-base-lowest" />
          <div className="h-3 w-9/12 rounded bg-background-base-lowest" />
          <div className="h-3 w-10/12 rounded bg-background-base-lowest" />
        </div>
      )}

      {estado.tipo === "ok" && (
        /* rolagem própria (nada de `overflow-hidden` cortando texto): recolhido
           o teto é a altura de `LINHAS_DA_PREVIA_RECOLHIDA` linhas de `text-xs`
           (leading-4 = 1rem), expandido vai até 70vh. `tabIndex` deixa o teclado
           rolar a área. */
        <pre
          tabIndex={0}
          aria-label={`Conteúdo de ${nome}`}
          style={aberto ? undefined : { maxHeight: `${LINHAS_DA_PREVIA_RECOLHIDA + 1.5}rem` }}
          className={`m-0 overflow-y-auto whitespace-pre-wrap break-words bg-background-code p-3 font-mono text-xs leading-4 text-text-default [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text-link ${
            aberto ? "max-h-[70vh]" : ""
          }`}
        >
          {estado.texto}
        </pre>
      )}

      {estado.tipo === "ok" && estado.cortadoPeloLimite && (
        <p className="px-3 pt-2 text-xs text-text-muted">
          Arquivo maior que a prévia — baixe para ver o resto
        </p>
      )}

      {/* barra do cartão: nome e tamanho à esquerda, ações à direita, como no Discord */}
      <div className="flex items-center gap-3 p-3">
        <FileText
          size={32}
          strokeWidth={1.25}
          className="shrink-0 text-text-muted"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <a
            href={anexo.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-medium text-text-link hover:underline"
          >
            {nome}
          </a>
          <span className="text-xs text-text-muted">{formatBytes(anexo.size)}</span>
        </span>
        <button
          type="button"
          onClick={() => void baixarAnexo(anexo)}
          aria-label={`Baixar ${nome}`}
          className={classeBotao}
        >
          <Download size={20} />
        </button>
        {temMaisLinhas && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? "Recolher prévia" : "Expandir prévia"}
            aria-expanded={aberto}
            className={classeBotao}
          >
            <ChevronDown size={20} className={aberto ? "rotate-180" : ""} />
          </button>
        )}
      </div>
    </div>
  );
}
