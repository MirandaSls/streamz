"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Cercado, Codigo, BotaoCopiar } from "@/components/desenvolvedores/Codigo";
import { PastilhaDeCodigo } from "@/components/desenvolvedores/Campos";
import { Linha } from "@/components/desenvolvedores/Texto";
import {
  curlDaRota,
  exemploDoConteudo,
  formatarJson,
  type DocumentoOpenAPI,
  type RotaIndexada,
} from "@/components/desenvolvedores/especificacao";

/**
 * A coluna da direita: a requisição pronta para colar no terminal e a resposta
 * que ela devolve, por código.
 *
 * É o que separa uma referência de um formulário. Quem abre a página de uma
 * rota quer ver o formato antes de ler a tabela — o `curl` e o JSON respondem
 * em dois segundos o que a tabela responde em trinta, e a tabela vira a
 * consulta de quem já entendeu.
 *
 * Os exemplos são **derivados do esquema** quando a especificação não traz um
 * `example` próprio (`exemploDoEsquema`): `{}` não ensina nada, e um JSON com
 * os campos certos e valores plausíveis ensina quase tudo.
 *
 * No desktop o painel gruda (`sticky`) enquanto a descrição rola ao lado; no
 * celular ele cai abaixo do conteúdo, que é a ordem de leitura certa — primeiro
 * o que a rota faz, depois como ela se parece.
 */
export function PainelDeExemplo({
  doc,
  servidor,
  rota,
}: {
  doc: DocumentoOpenAPI;
  servidor: string;
  rota: RotaIndexada;
}) {
  const curl = useMemo(() => curlDaRota(doc, servidor, rota), [doc, servidor, rota]);

  return (
    <div className="flex flex-col gap-4">
      <Cercado rotulo="Requisição · cURL" linguagem="bash" codigo={curl} alturaMaxima="max-h-[340px]" />
      {rota.respostas.length ? <Respostas doc={doc} rota={rota} /> : null}
      {/* `x-exemplo-discordjs` é `{titulo, codigo}`: o título é o que a barra do
          cartão mostra ("Responder com embed e arquivo"), e sem ele o leitor
          teria de ler o trecho inteiro para saber o que ele faz */}
      {rota.exemplos.map((exemplo) => (
        <Cercado
          key={exemplo.titulo}
          rotulo={
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 font-mono text-text-xs uppercase tracking-wide text-text-muted">
                discord.js
              </span>
              <span className="min-w-0 truncate normal-case tracking-normal text-text-subtle">
                {exemplo.titulo}
              </span>
            </span>
          }
          linguagem="js"
          codigo={exemplo.codigo}
          alturaMaxima="max-h-[340px]"
        />
      ))}
    </div>
  );
}

/** Abas por código de resposta, com o corpo de exemplo de cada uma. */
function Respostas({ doc, rota }: { doc: DocumentoOpenAPI; rota: RotaIndexada }) {
  const codigos = useMemo(() => rota.respostas.map((r) => r.codigo), [rota.respostas]);
  const [ativo, setAtivo] = useState(codigos[0]);
  const abas = useRef<(HTMLButtonElement | null)[]>([]);
  const atual = codigos.includes(ativo) ? ativo : codigos[0];
  // já resolvida: o 401, o 429 e o 500 de toda rota são `$ref` para
  // `components/responses`, e sem resolver não teriam nem descrição nem exemplo
  const resposta = rota.respostas.find((r) => r.codigo === atual)?.resposta;
  const exemplo = exemploDoConteudo(doc, resposta?.content);
  const corpo = exemplo ? formatarJson(exemplo.valor) : null;

  // Setas movem o foco entre as abas, como manda o padrão de `tablist`: sem
  // isso o Tab entra em cada código, e uma rota com cinco respostas custa cinco
  // paradas para quem navega por teclado.
  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const passo = evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;
    if (!passo) return;
    evento.preventDefault();
    const proximo = (indice + passo + codigos.length) % codigos.length;
    setAtivo(codigos[proximo]);
    abas.current[proximo]?.focus();
  }

  const idDaAba = (codigo: string) => `aba:${rota.id}:${codigo}`;
  const idDoPainel = `painel:${rota.id}`;

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-background-code">
      <div className="flex min-h-[40px] items-center gap-2 border-b border-border-subtle bg-background-base-low px-3 py-1.5">
        <span className="shrink-0 font-mono text-text-xs uppercase tracking-wide text-text-muted">Resposta</span>
        <div
          role="tablist"
          aria-label={`Respostas de ${rota.titulo}`}
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto scroller-none"
        >
          {codigos.map((codigo, i) => {
            const selecionado = codigo === atual;
            return (
              <button
                key={codigo}
                ref={(no) => {
                  abas.current[i] = no;
                }}
                type="button"
                role="tab"
                id={idDaAba(codigo)}
                aria-selected={selecionado}
                aria-controls={idDoPainel}
                tabIndex={selecionado ? 0 : -1}
                onClick={() => setAtivo(codigo)}
                onKeyDown={(e) => aoTeclar(e, i)}
                className={`h-7 shrink-0 rounded px-2 font-mono text-text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
                  selecionado
                    ? "bg-interactive-background-selected text-text-strong"
                    : "text-text-muted hover:bg-interactive-background-hover hover:text-text-default"
                }`}
              >
                {codigo}
              </button>
            );
          })}
        </div>
        {corpo ? <BotaoCopiar texto={corpo} /> : null}
      </div>

      <div
        role="tabpanel"
        id={idDoPainel}
        aria-labelledby={idDaAba(atual)}
        tabIndex={0}
        className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus"
      >
        {resposta?.description ? (
          <p className="flex items-start gap-2 border-b border-border-subtle px-4 py-2.5 text-text-sm text-text-subtle">
            <PastilhaDeCodigo codigo={atual} />
            <span className="min-w-0">
              <Linha texto={resposta.description} />
            </span>
          </p>
        ) : null}
        {corpo ? (
          <div className="max-h-[420px] overflow-y-auto scroller-thin">
            <Codigo codigo={corpo} linguagem="json" />
          </div>
        ) : (
          <p className="px-4 py-3 text-text-sm text-text-muted">Sem corpo na resposta.</p>
        )}
      </div>
    </div>
  );
}
