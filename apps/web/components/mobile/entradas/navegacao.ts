/**
 * A parte pura das entradas do canal no celular: a pilha local de telas
 * (detalhes e busca), a consulta com que a busca nasce, os filtros do botão ao
 * lado do campo e a leitura do desfecho de uma busca.
 *
 * Mora fora dos componentes para ser testada sem DOM (`navegacao.test.ts`) — é
 * aqui que moram as regras que dá para errar sem perceber olhando a tela: o
 * voltar que precisa desfazer uma camada só, e o "erro" que a store de
 * mensagens não expõe e precisa ser deduzido.
 */

/**
 * Telas que entram por cima da conversa de um canal.
 *
 * Não passam pela pilha do `stores/mobile.ts` de propósito: ela é a navegação
 * **entre** seções (lista → conversa → palco), e estas são camadas **de dentro**
 * de uma conversa — somem quando a conversa sai de cena, e trocar de canal por
 * um resultado de busca não pode deixar uma "busca" órfã empilhada na aba.
 */
export type EntradaDoCanal = "detalhes" | "busca";

/**
 * As abas da tela de detalhes do canal.
 *
 * O Discord do celular tem seis — Membros, Mídia, Fixadas, Threads, Links e
 * Arquivos (`suporte/.../pin-messages-faq/14.gif`, quadros 40 e 90, e
 * `how-to-use-search-on-discord/03.gif`, quadro 20). Mídia, Links e Arquivos
 * são listas por tipo de anexo que o Streamz não tem como montar (a API não
 * lista anexos por canal) e ficam de fora: §6.6 do PROCESSO, aba inerte só
 * existe quando nós temos o que ela faz.
 */
export type AbaDoCanal = "membros" | "fixadas" | "threads";

export const ABAS_DO_CANAL: readonly { valor: AbaDoCanal; rotulo: string }[] = [
  { valor: "membros", rotulo: "Membros" },
  { valor: "fixadas", rotulo: "Fixadas" },
  { valor: "threads", rotulo: "Threads" },
];

/**
 * Empilha uma entrada. Repetir o topo não empilha (dois toques na lupa não
 * podem exigir dois "voltar"), e pedir uma entrada que já está mais embaixo
 * **volta até ela** em vez de criar um laço detalhes → busca → detalhes → …
 * que só se desfaria com o voltar apertado muitas vezes.
 */
export function empilharEntrada(pilha: readonly EntradaDoCanal[], entrada: EntradaDoCanal): EntradaDoCanal[] {
  const onde = pilha.indexOf(entrada);
  if (onde >= 0) return pilha.slice(0, onde + 1);
  return [...pilha, entrada];
}

/** Desfaz a camada de cima; numa pilha vazia não há o que desfazer. */
export function desempilharEntrada(pilha: readonly EntradaDoCanal[]): EntradaDoCanal[] {
  return pilha.slice(0, -1);
}

/**
 * A consulta com que a busca abre.
 *
 * No Discord o campo já nasce com `in: baking-recipes` quando a busca parte de
 * um canal (`how-to-use-search-on-discord/03.gif`, quadros 20 e 70): a busca é
 * do servidor inteiro, e o filtro do canal vem preenchido para quem só quer
 * aquele canal apagar com um toque. Aqui é `em:nome` **sem espaço** depois dos
 * dois-pontos, porque o `parseSearchQuery` do `@streamz/shared` separa por
 * espaço e `em:` sozinho viraria texto livre.
 *
 * Numa conversa direta não há servidor nem `em:` (a API ignora o filtro, ver
 * `semFiltroDeCanal` no `HeaderBar`), e um nome com espaço não caberia num
 * token só — nos dois casos o campo nasce vazio.
 */
export function consultaInicialDaBusca(nomeDoCanal: string | null | undefined, ehServidor: boolean): string {
  const nome = nomeDoCanal?.trim();
  if (!ehServidor || !nome || /\s/.test(nome)) return "";
  return `em:${nome} `;
}

/**
 * Acrescenta um prefixo de filtro ao fim da consulta — a mesma regra do
 * `inserirPrefixo` do `HeaderBar` no desktop: um espaço antes quando já há
 * texto, nenhum espaço depois (o valor do filtro vem colado).
 */
export function inserirFiltro(consulta: string, prefixo: string): string {
  const base = consulta.trimEnd();
  return `${base}${base ? " " : ""}${prefixo}`;
}

export interface FiltroDaBusca {
  rotulo: string;
  prefixo: string;
}

/**
 * Os filtros do botão ao lado do campo, **na ordem do celular**, que não é a do
 * desktop: `how-to-use-search-on-discord/08.png` ("Filter results…") lista
 * pessoa, menção, tipo de dado, canal, data exata, antes e depois.
 *
 * O último item de lá, "By author type" (usuário, bot ou webhook), fica de fora:
 * o `parseSearchQuery` não tem esse filtro (§6.6). Os rótulos dos quatro
 * primeiros são os mesmos do popout do desktop (`LINHAS_DE_FILTRO` do
 * `HeaderBar`), para o mesmo filtro não ter dois nomes no app; os três de data
 * são tradução nossa — o cliente pt-BR não está no acervo.
 */
export function filtrosDaBusca(ehServidor: boolean): FiltroDaBusca[] {
  const todos: FiltroDaBusca[] = [
    { rotulo: "De um usuário específico", prefixo: "de:" },
    { rotulo: "Menciona um usuário específico", prefixo: "menciona:" },
    { rotulo: "Inclui um tipo específico de dados", prefixo: "tem:" },
    { rotulo: "Enviado em um canal específico", prefixo: "em:" },
    { rotulo: "Enviado em uma data", prefixo: "durante:" },
    { rotulo: "Antes de uma data", prefixo: "antes:" },
    { rotulo: "Depois de uma data", prefixo: "depois:" },
  ];
  return ehServidor ? todos : todos.filter((f) => f.prefixo !== "em:");
}

/** O pedaço da store de mensagens que diz como uma busca terminou. */
export interface RetratoDaBusca {
  searching: boolean;
  searchResults: readonly unknown[] | null;
}

export type DesfechoDaBusca = "ok" | "erro" | "substituida";

/**
 * Como a busca terminou, comparando a store **antes** e **depois** do
 * `runSearch`.
 *
 * A store não guarda erro: no `catch` ela só desliga o `searching`, deixa os
 * resultados como estavam e mostra um aviso (`stores/messages.ts`, `runSearch`).
 * Um sucesso sempre grava um **array novo** — então, terminado o pedido,
 * resultados com a mesma identidade de antes querem dizer que ele falhou. Sem
 * esta dedução a tela ficava parada no estado anterior (vazia, na primeira
 * busca) como se nada tivesse acontecido.
 *
 * `substituida`: outra busca começou no meio desta (o `runSearch` descarta a
 * resposta velha pelo `isCurrent`) e ainda está em voo — quem decide é ela.
 */
export function desfechoDaBusca(antes: RetratoDaBusca, depois: RetratoDaBusca): DesfechoDaBusca {
  if (depois.searching) return "substituida";
  if (depois.searchResults === antes.searchResults) return "erro";
  return "ok";
}

/** A segunda linha do cartão do canal, embaixo do nome ("Text Channel" no GIF). */
export function rotuloDoTipoDeCanal(canal: { type: string; readOnly?: boolean }): string {
  if (canal.type === "VOICE") return "Canal de voz";
  if (canal.type === "ANNOUNCEMENT" || canal.readOnly) return "Canal de anúncios";
  return "Canal de texto";
}
