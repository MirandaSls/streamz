"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";

/**
 * Comando de terminal com botão "Copiar".
 *
 * Sem `id` fixo de propósito: o bloco pode aparecer mais de uma vez na tela, e
 * o vínculo título ↔ grupo usa `useId`.
 */
export function BlocoDeComando({
  titulo,
  comando,
  dica,
  rotuloCopiar = "Copiar o comando",
  className = "",
}: {
  titulo: string;
  comando: string;
  dica?: string;
  rotuloCopiar?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState<"sim" | "falhou" | null>(null);
  const codigoRef = useRef<HTMLElement>(null);
  const idDoTitulo = useId();

  // o retorno some sozinho, para um segundo clique voltar a dizer alguma coisa
  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(null), 2500);
    return () => window.clearTimeout(t);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiado("sim");
    } catch {
      // `navigator.clipboard` só existe em contexto seguro (https/localhost) e
      // pode ser negado; sem ele, deixa o texto selecionado para o Cmd+C
      const el = codigoRef.current;
      const selecao = window.getSelection();
      if (el && selecao) {
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        selecao.removeAllRanges();
        selecao.addRange(faixa);
      }
      setCopiado("falhou");
    }
  }

  return (
    <div role="group" aria-labelledby={idDoTitulo} className={`w-full max-w-[560px] text-left ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id={idDoTitulo} className="text-text-md font-semibold text-text-strong">
          {titulo}
        </h3>
        <Button
          variante="secundario"
          tamanho="sm"
          aria-label={rotuloCopiar}
          icone={copiado === "sim" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          onClick={copiar}
          className="shrink-0 celular:h-[44px]"
        >
          {copiado === "sim" ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <code
        ref={codigoRef}
        className="block select-all overflow-x-auto whitespace-nowrap rounded-lg border border-border-subtle bg-background-base-lower px-3 py-2.5 font-mono text-text-sm text-text-default"
      >
        {comando}
      </code>
      {copiado === "falhou" || dica ? (
        <p className="mt-2 text-text-sm text-text-muted">
          {copiado === "falhou" ? "Não deu para copiar sozinho — o comando ficou selecionado, use Cmd+C." : dica}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {copiado === "sim" ? "Comando copiado" : ""}
      </p>
    </div>
  );
}
