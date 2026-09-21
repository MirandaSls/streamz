"use client";

import { AlertTriangle, RefreshCw } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";

/**
 * Carregando, erro e vazio da referência.
 *
 * Só a **referência** tem estes três estados. O topo e o guia de primeiros
 * passos não dependem da especificação e continuam de pé com a API fora do ar
 * — quem chegou para descobrir como apontar o bot não pode levar uma tela
 * branca porque um JSON não respondeu.
 */

/** Esqueleto com a forma do que vai chegar: nav à esquerda, rotas à direita. */
export function EsqueletoDaReferencia() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-7 w-48 rounded bg-background-surface-high" />
      <div className="mt-8 flex flex-col gap-10">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="h-5 w-64 rounded bg-background-surface-high" />
            <div className="h-10 w-full rounded-lg bg-background-base-low" />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
              <div className="flex flex-col gap-2">
                <div className="h-4 w-full rounded bg-background-surface-high" />
                <div className="h-4 w-5/6 rounded bg-background-surface-high" />
                <div className="mt-3 h-24 w-full rounded bg-background-surface-high" />
              </div>
              <div className="h-40 w-full rounded-lg bg-background-code" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Enquanto carrega, o leitor de tela ouve isto — o esqueleto ele não vê. */
export function AvisoDeCarregamento() {
  return (
    <p role="status" className="sr-only">
      Carregando a referência da API.
    </p>
  );
}

export function ErroDaReferencia({
  endereco,
  detalhe,
  aoTentarDeNovo,
}: {
  endereco: string;
  detalhe?: string;
  aoTentarDeNovo: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-border-feedback-critical bg-background-feedback-critical p-6"
    >
      <span className="flex items-center gap-2 text-text-feedback-critical">
        <AlertTriangle size={20} aria-hidden="true" />
        <strong className="text-heading-md font-semibold">Não foi possível carregar a referência</strong>
      </span>
      <p className="max-w-[640px] text-text-md leading-relaxed text-text-subtle">
        A especificação da API não respondeu. Isso costuma ser a API fora do ar, uma instância que ainda não
        subiu a rota pública, ou uma rede no caminho. O guia de primeiros passos acima continua valendo — só a
        lista de rotas depende deste arquivo.
      </p>
      <p className="max-w-full break-all text-text-sm text-text-muted">
        Endereço consultado:{" "}
        <code className="rounded border border-border-normal bg-background-code px-1.5 py-0.5 font-mono text-text-code">
          {endereco}
        </code>
      </p>
      {detalhe ? <p className="text-text-sm text-text-muted">Detalhe: {detalhe}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variante="secundario"
          icone={<RefreshCw size={16} aria-hidden="true" />}
          onClick={aoTentarDeNovo}
          className="celular:h-[44px]"
        >
          Tentar de novo
        </Button>
        <Button
          variante="neutro"
          href={endereco}
          alvo="_blank"
          rel="noreferrer"
          className="celular:h-[44px]"
        >
          Abrir o JSON
        </Button>
      </div>
    </div>
  );
}

export function ReferenciaVazia() {
  return (
    <div className="rounded-xl border border-border-subtle bg-background-base-low p-6">
      <p className="text-text-md leading-relaxed text-text-subtle">
        A especificação carregou, mas não declarou nenhuma rota. Numa instância recém-configurada isso quer
        dizer que a API compatível ainda não foi publicada — o guia de primeiros passos acima continua sendo o
        caminho.
      </p>
    </div>
  );
}
