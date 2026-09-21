"use client";

import { type ReactNode } from "react";
import { Etiqueta } from "@/components/desenvolvedores/Campos";
import { Secao } from "@/components/desenvolvedores/Secao";
import { Linha } from "@/components/desenvolvedores/Texto";
import {
  ANCORA_DAS_PERMISSOES,
  ANCORA_DOS_ERROS,
  ANCORA_DO_GATEWAY,
  TITULO_DOS_ERROS,
  ancoraDoEsquema,
  hrefDaAncora,
  type CodigoDeErro,
  type CodigoDeFechamento,
  type EventoDoGateway,
  type Guia,
  type Indice,
  type IntentDocumentado,
  type OpcodeDocumentado,
  type TabelaDePermissoes,
} from "@/components/desenvolvedores/especificacao";

/**
 * Os blocos `x-` que **não** são texto: permissões, intents, opcodes, eventos
 * do gateway, códigos de fechamento e códigos de erro.
 *
 * Eles chegam como dado estruturado (uma lista de objetos com os mesmos
 * campos), e é assim que vão para a tela: tabela de verdade, com `<th scope>` —
 * não um parágrafo que descreve a tabela. A diferença aparece na hora de
 * procurar um número no meio de vinte, que é a única coisa que se faz com estas
 * listas.
 *
 * **Onde cada uma entra:** a especificação escolhe a ordem dos guias e o texto
 * de cada um; estas tabelas se encaixam no fim do guia a que pertencem, casando
 * pelo `slug` (o `id` do guia na especificação). O guia do gateway termina
 * dizendo "a lista completa está em `x-intents` e `x-eventos-gateway`" — e ela
 * está, logo abaixo. Guia que não existe, ou bloco `x-` que não veio: nada
 * aparece, e o texto continua de pé sozinho.
 *
 * As células de texto passam pelo `Linha` (o inline do nosso Markdown): a
 * especificação escreve crase e asterisco dentro delas (um `suporte` é "sim —
 * é a porta de entrada da voz", um `quando` cita `session_id`), e mostrar o
 * texto cru deixaria os marcadores à vista.
 */

// ─────────────────────────────────────────────────────────────────────────────
// A moldura que todas usam
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tabela rola **dentro de si** (`overflow-x-auto` + largura mínima), que é o
 * mesmo tratamento das tabelas de Markdown em `Texto.tsx`: em 360px uma tabela
 * de quatro colunas não cabe, e a alternativa — deixar a página inteira rolar
 * na horizontal — leva junto o cabeçalho, a navegação e todo o resto.
 */
function Quadro({
  titulo,
  descricao,
  colunas,
  larguraMinima = "min-w-[420px]",
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  colunas: string[];
  larguraMinima?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6">
      <h4 className="mb-2 text-text-sm font-semibold uppercase tracking-wide text-text-subtle">{titulo}</h4>
      {descricao ? <p className="mb-3 text-text-sm leading-relaxed text-text-muted">{descricao}</p> : null}
      <div className="overflow-x-auto scroller-thin rounded-lg border border-border-subtle">
        <table className={`w-full border-collapse text-left text-text-sm ${larguraMinima}`}>
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="bg-background-base-low">
              {colunas.map((coluna) => (
                <th
                  key={coluna}
                  scope="col"
                  className="px-3 py-2 text-text-xs font-semibold uppercase tracking-wide text-text-muted"
                >
                  {coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Uma linha de tabela — a borda de cima separa, o `align-top` alinha textos de alturas diferentes. */
function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-t border-border-subtle align-top">{children}</tr>;
}

/** Célula comum. */
function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-text-subtle ${className}`}>{children}</td>;
}

/** Célula de identificador: mono, e quebra em vez de alargar a tabela. */
function TdNome({ children }: { children: ReactNode }) {
  return (
    <th scope="row" className="px-3 py-2 font-normal">
      <code className="break-words font-mono text-text-sm font-semibold text-text-default">{children}</code>
    </th>
  );
}

/** Um número que pode não ter vindo: "—" em vez de vazio, para a coluna não sumir. */
function Numero({ valor }: { valor: number | null }) {
  return <span className="font-mono text-text-sm text-text-default">{valor === null ? "—" : valor}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissões
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As três listas de `x-tabela-permissoes`, que respondem perguntas diferentes:
 * o que tem par (e qual bit é qual), o que sai **sempre ligado** e por quê, e o
 * que sai **sempre apagado**.
 *
 * O bit aparece como `1 << n` e não como o valor decimal: é a forma como ele é
 * escrito em todo código de bot, e o decimal de `MODERATE_MEMBERS` (2^40) é um
 * número que ninguém reconhece.
 */
export function TabelasDePermissoes({ tabela }: { tabela: TabelaDePermissoes }) {
  return (
    <>
      {tabela.pares.length ? (
        <Quadro
          titulo="As permissões que têm par"
          descricao="A tradução vale nos dois sentidos: é este o bit que você lê num cargo, e é este o bit que a API considera quando você escreve um."
          colunas={["Streamz", "Discord"]}
        >
          {tabela.pares.map((par) => (
            <Tr key={`${par.streamz}:${par.discord}`}>
              <TdNome>
                {par.streamz}
                <Bit valor={par.bitStreamz} />
              </TdNome>
              <Td>
                <code className="break-words font-mono text-text-sm text-text-default">{par.discord}</code>
                <Bit valor={par.bitDiscord} />
              </Td>
            </Tr>
          ))}
        </Quadro>
      ) : null}

      {tabela.sempreConcedidas.length ? (
        <Quadro
          titulo="Sempre concedidas"
          descricao="A coisa é permitida aqui, então o bit sai ligado: apagá-lo faria um bot bem-comportado desistir antes de tentar."
          colunas={["Permissão do Discord", "Por quê"]}
        >
          {tabela.sempreConcedidas.map((item) => (
            <Tr key={item.discord}>
              <TdNome>
                {item.discord}
                <Bit valor={item.bitDiscord} />
              </TdNome>
              <Td>
                <Linha texto={item.porque} />
              </Td>
            </Tr>
          ))}
        </Quadro>
      ) : null}

      {tabela.sempreApagadas.length ? (
        <div className="mt-6">
          <h4 className="mb-2 text-text-sm font-semibold uppercase tracking-wide text-text-subtle">
            Sempre apagadas
          </h4>
          <p className="mb-3 text-text-sm leading-relaxed text-text-muted">
            A funcionalidade não existe no Streamz. Pedir uma delas não é erro — o bit simplesmente não é
            concedido.
          </p>
          {/* lista de pastilhas, não tabela: são só nomes, e uma tabela de uma
              coluna com vinte e quatro linhas é uma lista com bordas demais */}
          <ul className="flex flex-wrap gap-1.5">
            {tabela.sempreApagadas.map((nome) => (
              <li key={nome}>
                <code className="inline-block rounded border border-border-subtle bg-background-code px-1.5 py-0.5 font-mono text-text-xs text-text-code">
                  {nome}
                </code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tabela.nota ? (
        <p className="mt-4 border-l-2 border-border-strong pl-4 text-text-sm leading-relaxed text-text-muted">
          <Linha texto={tabela.nota} />
        </p>
      ) : null}
    </>
  );
}

function Bit({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  return <span className="mt-0.5 block font-mono text-text-xs font-normal text-text-muted">{`1 << ${valor}`}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway
// ─────────────────────────────────────────────────────────────────────────────

export function TabelaDeIntents({ intents }: { intents: IntentDocumentado[] }) {
  return (
    <Quadro
      titulo="Intents"
      descricao="O valor é o que entra na soma do IDENTIFY. Intent sem evento listado é aceito e não entrega nada — existe para a sua biblioteca não precisar de um caso especial."
      colunas={["Intent", "Valor", "O que ele libera"]}
      larguraMinima="min-w-[520px]"
    >
      {intents.map((intent) => (
        <Tr key={intent.nome}>
          <TdNome>
            {intent.nome}
            <Bit valor={intent.bit} />
          </TdNome>
          <Td>
            <Numero valor={intent.valor} />
          </Td>
          <Td>
            {intent.eventos.length ? (
              <span className="flex flex-wrap gap-1">
                {intent.eventos.map((evento) => (
                  <code
                    key={evento}
                    className="rounded border border-border-subtle bg-background-code px-1.5 py-0.5 font-mono text-text-xs text-text-code"
                  >
                    {evento}
                  </code>
                ))}
              </span>
            ) : (
              <span className="text-text-muted">nenhum evento por aqui</span>
            )}
            {intent.nota ? (
              <span className="mt-1.5 block text-text-xs leading-relaxed text-text-muted">
                <Linha texto={intent.nota} />
              </span>
            ) : null}
          </Td>
        </Tr>
      ))}
    </Quadro>
  );
}

export function TabelaDeOpcodes({ opcodes }: { opcodes: OpcodeDocumentado[] }) {
  return (
    <Quadro titulo="Opcodes" colunas={["Op", "Nome", "Direção", "Suporte"]} larguraMinima="min-w-[520px]">
      {opcodes.map((opcode) => (
        <Tr key={`${opcode.codigo}:${opcode.nome}`}>
          <Td className="whitespace-nowrap">
            <Numero valor={opcode.codigo} />
          </Td>
          <TdNome>{opcode.nome}</TdNome>
          <Td className="whitespace-nowrap">{opcode.direcao}</Td>
          <Td>
            <Linha texto={opcode.suporte} />
          </Td>
        </Tr>
      ))}
    </Quadro>
  );
}

/**
 * Os eventos, com o intent que os libera — e com `sempre` onde o intent é
 * `null`. Célula vazia ali seria lida como "esqueceram de preencher"; o que a
 * especificação diz é o contrário: o evento chega sem você pedir.
 */
export function TabelaDeEventos({ eventos }: { eventos: EventoDoGateway[] }) {
  return (
    <Quadro
      titulo="Eventos do gateway"
      colunas={["Evento", "Intent", "Quando chega"]}
      larguraMinima="min-w-[560px]"
    >
      {eventos.map((evento, i) => (
        <Tr key={`${evento.nome}:${i}`}>
          <TdNome>
            {evento.nome}
            {evento.payload ? (
              <a
                href={hrefDaAncora(ancoraDoEsquema(evento.payload))}
                className="mt-0.5 block font-mono text-text-xs font-normal text-text-link underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                {evento.payload}
              </a>
            ) : null}
          </TdNome>
          <Td className="whitespace-nowrap">
            {evento.intent ? (
              <code className="font-mono text-text-xs text-text-code">{evento.intent}</code>
            ) : (
              <Etiqueta tom="forte">sempre</Etiqueta>
            )}
          </Td>
          <Td>
            <Linha texto={evento.quando} />
          </Td>
        </Tr>
      ))}
    </Quadro>
  );
}

/**
 * Os códigos de fechamento, com o irrecuperável em destaque.
 *
 * `reconecta: false` é a informação que muda o que o autor do bot faz: reabrir
 * a conexão num 4004 (token inválido) é um laço infinito contra a API, e é
 * exatamente o que uma biblioteca faz quando não sabe. Por isso a coluna existe
 * e a etiqueta é a de aviso, não uma palavra no meio da frase.
 */
export function TabelaDeFechamentos({ fechamentos }: { fechamentos: CodigoDeFechamento[] }) {
  return (
    <Quadro
      titulo="Códigos de fechamento"
      descricao="O que o WebSocket devolve ao fechar. Reconectar num código irrecuperável é um laço contra a API — nos marcados aqui, a sua biblioteca desiste sozinha."
      colunas={["Código", "Nome", "Quando", "Reconecta?"]}
      larguraMinima="min-w-[560px]"
    >
      {fechamentos.map((fechamento) => (
        <Tr key={fechamento.codigo}>
          <Td className="whitespace-nowrap">
            <Numero valor={fechamento.codigo} />
          </Td>
          <TdNome>{fechamento.nome}</TdNome>
          <Td>
            <Linha texto={fechamento.quando} />
          </Td>
          <Td className="whitespace-nowrap">
            {fechamento.reconecta ? (
              <span className="text-text-muted">sim</span>
            ) : (
              <Etiqueta tom="aviso">irrecuperável</Etiqueta>
            )}
          </Td>
        </Tr>
      ))}
    </Quadro>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Códigos de erro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os códigos do corpo (`{"code": 50013, …}`), que é por onde as bibliotecas
 * classificam o erro — o status HTTP sozinho não distingue "sem permissão" de
 * "cargo acima do seu".
 *
 * Seção própria, e não um pedaço de guia: eles valem para **toda** rota.
 */
export function SecaoDeCodigosDeErro({ erros }: { erros: CodigoDeErro[] }) {
  if (!erros.length) return null;
  return (
    <Secao
      ancora={ANCORA_DOS_ERROS}
      titulo={TITULO_DOS_ERROS}
      nivel={3}
      className="border-t border-border-subtle py-10 celular:py-8"
    >
      <div className="mt-4 max-w-[860px]">
        <p className="text-text-md leading-relaxed text-text-subtle">
          Todo erro vem com um <code className="font-mono text-text-code">code</code> no corpo, e é por ele que
          a sua biblioteca decide o que fazer — o status HTTP sozinho não separa &quot;falta o bit&quot; de
          &quot;o cargo alvo está acima do seu&quot;.
        </p>
        <Quadro titulo="Códigos do corpo de erro" colunas={["code", "HTTP", "Nome", "Quando"]} larguraMinima="min-w-[560px]">
          {erros.map((erro) => (
            <Tr key={`${erro.code}:${erro.nome}`}>
              <Td className="whitespace-nowrap">
                <Numero valor={erro.code} />
              </Td>
              <Td className="whitespace-nowrap">
                <Numero valor={erro.http} />
              </Td>
              <TdNome>{erro.nome}</TdNome>
              <Td>
                <Linha texto={erro.quando} />
              </Td>
            </Tr>
          ))}
        </Quadro>
      </div>
    </Secao>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O encaixe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As tabelas que pertencem a este guia, se houver alguma.
 *
 * O casamento é pelo `slug` do guia — o `id` que a **especificação** escolheu
 * (`gateway`, `permissoes`). Se ela renomear um deles, a tabela some da página
 * em vez de aparecer sob o título errado, que é o defeito menos confuso dos
 * dois.
 */
export function TabelasDoGuia({ guia, indice }: { guia: Guia; indice: Indice }) {
  if (guia.slug === ANCORA_DAS_PERMISSOES) {
    return indice.permissoes ? <TabelasDePermissoes tabela={indice.permissoes} /> : null;
  }

  if (guia.slug === ANCORA_DO_GATEWAY) {
    return (
      <>
        {indice.intents.length ? <TabelaDeIntents intents={indice.intents} /> : null}
        {indice.opcodes.length ? <TabelaDeOpcodes opcodes={indice.opcodes} /> : null}
        {indice.eventos.length ? <TabelaDeEventos eventos={indice.eventos} /> : null}
        {indice.fechamentos.length ? <TabelaDeFechamentos fechamentos={indice.fechamentos} /> : null}
      </>
    );
  }

  return null;
}
