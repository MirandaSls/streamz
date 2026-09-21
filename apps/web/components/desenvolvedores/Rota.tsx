"use client";

import { Fragment } from "react";
import { Etiqueta, PastilhaDeCodigo, PastilhaDeMetodo, TabelaDeCampos, linhasDeEsquema } from "@/components/desenvolvedores/Campos";
import { AlertTriangle } from "@/components/ui/icones";
import { BotaoCopiar } from "@/components/desenvolvedores/Codigo";
import { PainelDeExemplo } from "@/components/desenvolvedores/PainelDeExemplo";
import { Secao } from "@/components/desenvolvedores/Secao";
import { Linha, Texto } from "@/components/desenvolvedores/Texto";
import {
  camposDoEsquema,
  type DocumentoOpenAPI,
  type EstadoDaRota,
  type RotaIndexada,
} from "@/components/desenvolvedores/especificacao";

/** O rótulo em português de cada lugar onde um parâmetro pode ir. */
const ROTULO_DE_ORIGEM: Record<string, string> = {
  path: "Parâmetros do caminho",
  query: "Parâmetros de consulta",
  header: "Cabeçalhos",
  cookie: "Cookies",
};

const ORDEM_DE_ORIGEM = ["path", "query", "header", "cookie"];

/**
 * `x-estado` na tela.
 *
 * Três valores, e os três dizem algo diferente para quem vai escrever o
 * código: `estavel` não ganha etiqueta nenhuma (é o caso de quase todas, e
 * carimbar cinquenta rotas com "estável" é ruído), `parcial` avisa que parte do
 * comportamento do Discord não está aqui, e `nao-implementado` é a rota que só
 * responde 501.
 */
const ROTULO_DO_ESTADO: Record<EstadoDaRota, { texto: string; tom: "aviso" | "critico" } | null> = {
  estavel: null,
  parcial: { texto: "parcial", tom: "aviso" },
  "nao-implementado": { texto: "não implementada", tom: "critico" },
};

/**
 * Uma rota da referência: o que ela faz à esquerda, como ela se parece à
 * direita.
 *
 * A divisão em duas colunas só vale a partir de `xl` (1280px). Abaixo disso a
 * coluna da direita ficaria com 300px, e um `curl` em 300px é uma barra de
 * rolagem horizontal com código dentro — pior que não mostrar. Abaixo de `xl`
 * as duas empilham, com o exemplo no fim.
 */
export function Rota({
  doc,
  servidor,
  rota,
}: {
  doc: DocumentoOpenAPI;
  servidor: string;
  rota: RotaIndexada;
}) {
  const porOrigem = ORDEM_DE_ORIGEM.map((origem) => ({
    origem,
    campos: rota.parametros
      .filter((p) => (p.in ?? "query") === origem)
      .map((p) => ({
        nome: p.name as string,
        esquema: p.schema,
        obrigatorio: p.required || origem === "path",
        descricao: p.description,
        obsoleto: p.deprecated,
      })),
  })).filter((grupo) => grupo.campos.length);

  const corpo = rota.operacao.requestBody;
  const esquemaDoCorpo = corpo?.content?.["application/json"]?.schema ?? Object.values(corpo?.content ?? {})[0]?.schema;
  const camposDoCorpo = linhasDeEsquema(camposDoEsquema(doc, esquemaDoCorpo));

  // as respostas já vêm com o `$ref` de `components/responses` resolvido pelo
  // `indexar`: **toda** rota autenticada referencia `NaoAutenticado`,
  // `LimiteExcedido` e `ErroInterno` em vez de repetir o texto
  const sucesso = rota.respostas.find((r) => Number(r.codigo) >= 200 && Number(r.codigo) < 300);
  const esquemaDoSucesso =
    sucesso?.resposta.content?.["application/json"]?.schema ??
    Object.values(sucesso?.resposta.content ?? {})[0]?.schema;
  const camposDaResposta = linhasDeEsquema(camposDoEsquema(doc, esquemaDoSucesso));

  const estado = rota.estado ? ROTULO_DO_ESTADO[rota.estado] : null;

  return (
    <Secao
      ancora={rota.id}
      titulo={rota.titulo}
      nivel={3}
      sobretitulo={rota.tag}
      className="border-t border-border-subtle py-10 celular:py-8"
    >
      {/* A identidade da rota, em largura cheia: é o que se copia e o que se
          procura com Ctrl+F na página. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-background-base-low px-3 py-2">
        <PastilhaDeMetodo metodo={rota.metodo} />
        <code className="min-w-0 flex-1 overflow-x-auto scroller-thin whitespace-nowrap font-mono text-text-sm text-text-default">
          {rota.caminho}
        </code>
        <BotaoCopiar texto={`${servidor}${rota.caminho}`} rotulo="Copiar URL" />
      </div>

      {/* Permissão e estado, logo abaixo do caminho: são as duas perguntas que
          se faz antes de escrever a chamada — "o meu bot pode?" e "isto
          funciona hoje?". */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-text-sm text-text-subtle">
        {/* `min-w-0` + `break-words`: há permissão de três linhas ("BAN_MEMBERS
            + MODERATE_MEMBERS + hierarquia"), e sem os dois ela empurra a
            largura do bloco e a página rola na horizontal no celular. */}
        <span className="flex min-w-0 max-w-full items-baseline gap-1.5">
          <span className="shrink-0 text-text-xs uppercase tracking-wide text-text-muted">Permissão:</span>
          {rota.permissao ? (
            <code className="min-w-0 break-words rounded border border-border-normal bg-background-code px-1.5 py-0.5 font-mono text-text-xs text-text-code">
              {rota.permissao}
            </code>
          ) : (
            <span className="text-text-muted">nenhuma de servidor</span>
          )}
        </span>
        {estado ? <Etiqueta tom={estado.tom}>{estado.texto}</Etiqueta> : null}
        {rota.publica ? <Etiqueta>sem Authorization</Etiqueta> : null}
      </div>

      {rota.obsoleta ? <AvisoDe501 estado={rota.estado} /> : null}

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:items-start">
        <div className="min-w-0">
          {rota.operacao.description ? (
            <Texto conteudo={rota.operacao.description} nivelBase={4} />
          ) : rota.operacao.summary && rota.operacao.summary !== rota.titulo ? (
            <p className="text-text-md leading-relaxed text-text-subtle">{rota.operacao.summary}</p>
          ) : null}

          {porOrigem.map((grupo) => (
            <TabelaDeCampos
              key={grupo.origem}
              titulo={ROTULO_DE_ORIGEM[grupo.origem] ?? grupo.origem}
              campos={grupo.campos}
            />
          ))}

          {corpo ? (
            <div className="mt-6">
              <h4 className="mb-2 flex flex-wrap items-center gap-2 text-text-sm font-semibold uppercase tracking-wide text-text-subtle">
                Corpo da requisição
                {corpo.required ? <Etiqueta tom="forte">obrigatório</Etiqueta> : null}
              </h4>
              {corpo.description ? <Texto conteudo={corpo.description} nivelBase={4} /> : null}
              {camposDoCorpo.length ? (
                <TabelaDeCampos titulo="Campos do corpo" campos={camposDoCorpo} />
              ) : (
                <p className="text-text-sm text-text-muted">
                  O formato do corpo está no exemplo ao lado — a especificação não descreveu campo a campo.
                </p>
              )}
            </div>
          ) : null}

          {rota.respostas.length ? (
            <div className="mt-6">
              <h4 className="mb-2 text-text-sm font-semibold uppercase tracking-wide text-text-subtle">Respostas</h4>
              <ul className="flex flex-col gap-2">
                {rota.respostas.map(({ codigo, resposta }) => (
                  <li key={codigo} className="flex items-start gap-2">
                    <PastilhaDeCodigo codigo={codigo} />
                    {/* a descrição é Markdown (`**ou o bot não é membro dele**`,
                        `` `10003` ``), e uma frase só: o inline basta */}
                    <span className="min-w-0 pt-0.5 text-text-sm leading-relaxed text-text-subtle">
                      {resposta.description ? <Linha texto={resposta.description} /> : "—"}
                    </span>
                  </li>
                ))}
              </ul>
              {camposDaResposta.length ? (
                <TabelaDeCampos titulo={`Campos da resposta ${sucesso?.codigo}`} campos={camposDaResposta} />
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Empilhado, o exemplo fica por último. O ideal seria ele vir depois
            da descrição e antes das tabelas de detalhe, mas isso exigiria
            partir o bloco de conteúdo em dois só para o celular — e a ordem de
            leitura certa começa pela descrição de qualquer forma. */}
        <div className="min-w-0 xl:sticky xl:top-20">
          <PainelDeExemplo doc={doc} servidor={servidor} rota={rota} />
        </div>
      </div>
    </Secao>
  );
}

/**
 * O aviso das rotas marcadas `deprecated`.
 *
 * **`deprecated` aqui não quer dizer "vai sumir".** A especificação usa o campo
 * para marcar as cinco operações que respondem **501**: elas existem de
 * propósito, para a biblioteca receber `20012` com a explicação em vez do 404
 * genérico que ela leria como "erro desconhecido". Escrever "rota obsoleta" na
 * tela — que é o que o OpenAPI quer dizer com esse campo em qualquer outra API
 * — mandaria o leitor parar de usar rotas que são justamente as que ele deve
 * chamar (`editReply()` cai numa delas).
 *
 * Duas delas são `nao-implementado` por inteiro; as outras três são `parcial`:
 * o caminho `@original` funciona e só os demais ids levam 501. O texto muda
 * junto, senão diria que `editReply()` não funciona — e funciona.
 */
function AvisoDe501({ estado }: { estado: EstadoDaRota | null }) {
  const inteira = estado === "nao-implementado";
  return (
    <p className="mt-3 flex gap-3 rounded-lg border-l-2 border-border-feedback-warning bg-background-feedback-warning p-3 text-text-sm leading-relaxed text-text-subtle">
      <span className="mt-0.5 shrink-0 text-text-feedback-warning" aria-hidden="true">
        <AlertTriangle size={16} />
      </span>
      <span className="min-w-0">
        <strong className="font-semibold text-text-default">
          {inteira ? "Ainda não implementada." : "Implementada em parte."}
        </strong>{" "}
        {inteira
          ? "A rota existe para responder 501 com o código 20012 e dizer o que falta — não porque vá desaparecer."
          : "O que ainda falta responde 501 com o código 20012, em vez de um 404 que a sua biblioteca leria como erro desconhecido."}{" "}
        A especificação a marca como <code className="font-mono">deprecated</code> por isso, e não por desuso.
      </span>
    </p>
  );
}

/** Todas as rotas de uma tag, com o cabeçalho do grupo. */
export function GrupoDeRotas({
  doc,
  servidor,
  grupo,
}: {
  doc: DocumentoOpenAPI;
  servidor: string;
  grupo: { id: string; nome: string; descricao?: string; rotas: RotaIndexada[] };
}) {
  return (
    <Fragment>
      <Secao ancora={grupo.id} titulo={grupo.nome} className="pt-10 celular:pt-8">
        {grupo.descricao ? <Texto conteudo={grupo.descricao} className="mt-3" /> : null}
      </Secao>
      {grupo.rotas.map((rota) => (
        <Rota key={rota.id} doc={doc} servidor={servidor} rota={rota} />
      ))}
    </Fragment>
  );
}
