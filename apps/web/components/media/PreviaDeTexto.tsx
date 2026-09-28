"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, FileText } from "@/components/ui/icones";
import { attachmentDisplayName, type Attachment } from "@streamz/shared";
import {
  LIMITE_DA_PREVIA_BYTES,
  LINHAS_DA_PREVIA_RECOLHIDA,
  recortarPrevia,
} from "@/lib/texto-longo";
import { formatBytes } from "@/lib/format";
import { baixarTextoDoAnexo } from "@/lib/imagem-arquivo";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "ok"; texto: string; cortadoPeloLimite: boolean }
  | { tipo: "erro" };

/**
 * Prévia de um anexo de texto (`message.txt`, gerado quando a mensagem passa
 * do limite, e qualquer outro que `ehTextoPrevisualizavel` aceite): o mesmo
 * cabeçalho do cartão de arquivo comum (`Arquivo`, em `MediaGroup.tsx`) — ícone,
 * nome, tamanho, baixar — e abaixo as primeiras linhas em fonte monoespaçada,
 * como o Discord mostra `.txt` anexado.
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
  let corpo = "";
  let temMaisLinhas = false;
  if (estado.tipo === "ok") {
    const recolhida = recortarPrevia(estado.texto, LINHAS_DA_PREVIA_RECOLHIDA);
    temMaisLinhas = recolhida.cortado;
    corpo = aberto ? estado.texto : recolhida.trecho;
  }

  return (
    <div className="w-[432px] max-w-full rounded-lg border border-border-subtle bg-background-base-lower p-4">
      {/* cabeçalho idêntico ao de `Arquivo`: mesmo ícone, mesma âncora de
          baixar — só o corpo abaixo é novidade desta prévia */}
      <div className="flex items-center gap-3">
        <FileText
          size={40}
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
        <a
          href={anexo.url}
          download={nome}
          aria-label={`Baixar ${nome}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded text-text-subtle hover:bg-interactive-background-hover hover:text-text-strong celular:h-[44px] celular:w-[44px]"
        >
          <Download size={20} />
        </a>
      </div>

      {estado.tipo === "carregando" && (
        <div
          aria-hidden="true"
          className="mt-3 animate-pulse space-y-1.5 rounded bg-background-code p-3"
        >
          <div className="h-3 w-11/12 rounded bg-background-base-lowest" />
          <div className="h-3 w-9/12 rounded bg-background-base-lowest" />
          <div className="h-3 w-10/12 rounded bg-background-base-lowest" />
        </div>
      )}

      {estado.tipo === "ok" && (
        <div className="mt-3">
          <pre
            className={`whitespace-pre-wrap break-words rounded bg-background-code p-3 font-mono text-xs text-text-default ${
              aberto ? "max-h-64 overflow-y-auto" : "overflow-hidden"
            }`}
          >
            {corpo}
          </pre>

          {(temMaisLinhas || estado.cortadoPeloLimite) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {temMaisLinhas && (
                <button
                  type="button"
                  onClick={() => setAberto((v) => !v)}
                  className="text-xs font-medium text-text-link hover:underline"
                >
                  {aberto ? "Recolher" : "Expandir"}
                </button>
              )}
              {estado.cortadoPeloLimite && (
                <span className="text-xs text-text-muted">
                  Arquivo maior que a prévia — baixe para ver o resto
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
