/**
 * Comandos de barra do composer (`/shrug`, `/me`, `/spoiler`, `/giphy`…).
 *
 * A lista mora no contrato (`COMANDOS_BARRA`) porque descreve o que a mensagem
 * vira — o que interessa aos dois lados. Aqui fica só a interpretação do texto
 * digitado, pura e testável: o composer chama `interpretarComando` no envio e
 * age conforme o resultado.
 */

import {
  COMANDOS_BARRA,
  SUFIXOS_COMANDO,
  type ComandoBarra,
  type ComandoDeApp,
  type OpcaoDeComando,
  type OpcaoDeInteracao,
  type PedidoDeAutocompleteInput,
  type PublicUser,
} from "@streamz/shared";

/** O que fazer com a mensagem depois de reconhecer o comando. */
export type ResultadoComando =
  /** não era comando: envia o texto como veio. */
  | { tipo: "nenhum" }
  /** envia este texto no lugar do digitado. */
  | { tipo: "enviar"; content: string }
  /** abre o seletor de GIF já com o termo. */
  | { tipo: "gif"; termo: string }
  /** muda o apelido no servidor (depende do agente de cargos). */
  | { tipo: "apelido"; apelido: string }
  // ── j-bots ──
  /** é comando de um bot: vira `POST /channels/:id/interactions`. */
  | { tipo: "interacao"; commandId: string; opcoes: OpcaoDeInteracao[] }
  /** comando de bot com opção obrigatória em branco: avisa em vez de mandar. */
  | { tipo: "faltaOpcao"; comando: string; opcao: string }
  /** o texto começa com `/` mas não é um comando conhecido. */
  | { tipo: "desconhecido"; nome: string };

/** Comandos cujo nome começa com o termo digitado (autocomplete de `/`). */
export function buscarComandos(termo: string): ComandoBarra[] {
  const q = termo.trim().toLowerCase();
  return COMANDOS_BARRA.filter((c) => c.nome.startsWith(q));
}

/**
 * Separa `/nome resto` em comando e argumento; null se não começa com `/`.
 *
 * O nome aceita dígito, `-` e `_` porque é o que o Discord aceita no nome de um
 * comando de aplicativo (`/play-next`), e esses comandos passam por aqui. Os
 * nativos continuam sendo só letras, então nada muda para eles.
 */
export function separarComando(
  texto: string,
): { nome: string; argumento: string } | null {
  const m = texto.match(/^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/);
  return m ? { nome: m[1], argumento: (m[2] ?? "").trim() } : null;
}

/**
 * Interpreta o texto do composer.
 *
 * `/shrug` e companhia **acrescentam** o sufixo ao que foi escrito (é o que o
 * Discord faz: `/shrug deu ruim` vira "deu ruim ¯\\_(ツ)_/¯"), enquanto `/me` e
 * `/spoiler` embrulham a mensagem inteira. Um `/` sozinho, ou seguido de algo
 * que não é comando, volta como `desconhecido` — o composer avisa em vez de
 * enviar "/xyz" achando que fez alguma coisa.
 *
 * `comandosDeApp` é opcional e vem depois: **o comando nativo ganha sempre**.
 * Um bot que registre `/me` não sequestra o `/me` de todo mundo — e, como o
 * parâmetro tem padrão, quem só quer os nativos (e os testes que já existiam)
 * chama com um argumento só.
 */
export function interpretarComando(
  texto: string,
  comandosDeApp: readonly ComandoDeApp[] = [],
  escolhasFeitas?: EscolhasFeitas,
): ResultadoComando {
  const partes = separarComando(texto.trim());
  if (!partes) return { tipo: "nenhum" };

  const comando = COMANDOS_BARRA.find((c) => c.nome === partes.nome);
  const arg = partes.argumento;

  if (comando) {
    switch (comando.tipo) {
      case "texto": {
        const sufixo = SUFIXOS_COMANDO[comando.nome] ?? "";
        return { tipo: "enviar", content: arg ? `${arg} ${sufixo}` : sufixo };
      }
      case "acao":
        // ação em itálico, como o /me do IRC de onde o Discord herdou
        return arg ? { tipo: "enviar", content: `*${arg}*` } : { tipo: "nenhum" };
      case "spoiler":
        return arg ? { tipo: "enviar", content: `||${arg}||` } : { tipo: "nenhum" };
      case "gif":
        return { tipo: "gif", termo: arg };
      case "apelido":
        return { tipo: "apelido", apelido: arg };
    }
  }

  // ── j-bots ── nenhum nativo com esse nome: pode ser comando de bot
  const doApp = comandosDeApp.find((c) => c.name === partes.nome);
  if (doApp) return interpretarComandoDeApp(doApp, arg, escolhasFeitas);

  return { tipo: "desconhecido", nome: partes.nome };
}

// ── j-bots · comandos de aplicativo ──────────────────────────

/** O que conta como "sim" numa opção booleana (tipo 5). */
const VERDADEIROS = new Set(["true", "sim", "1"]);

/**
 * A forma de menção que o seletor de alvo do composer escreve em cada tipo:
 * `<@id>` usuário, `<#id>` canal, `<@&id>` cargo — as mesmas do markdown, para
 * o campo continuar legível e editável. O `[^&]` no primeiro caractere do
 * usuário impede que um `<@&cargo>` colado no campo de usuário vire o id
 * "&cargo".
 */
const MENCAO_POR_TIPO: Partial<Record<OpcaoDeComando["type"], RegExp>> = {
  6: /^<@!?([^&>\s][^>\s]*)>$/,
  7: /^<#([^>\s]+)>$/,
  8: /^<@&([^>\s]+)>$/,
};

/**
 * Converte o texto digitado para o tipo que a opção declara.
 *
 * `null` quer dizer "não preenchida": vale para o valor vazio e para um número
 * que não é número (`volume:muito`). Mandar `"muito"` num campo de tipo 4 daria
 * 400 na API — e o toast de opção faltando é uma resposta melhor do que um erro
 * de servidor para quem digitou.
 *
 * Usuário (6), canal (7) e cargo (8): a menção que o seletor escreve vira o id
 * (é o que a API traduz para snowflake); texto solto continua indo como está,
 * para quem digitou um id à mão.
 *
 * Opção com `choices` só aceita uma das escolhas — pelo nome que a lista mostra
 * ou pelo valor cru. Qualquer outra coisa é "não preenchida": o bot declarou as
 * escolhas justamente para não receber texto livre ali.
 */
function converterOpcao(opcao: OpcaoDeComando, bruto: string): OpcaoDeInteracao | null {
  const texto = bruto.trim();
  if (opcao.type === 5) {
    // booleano só tem dois lados: o que não é "sim" é "não"
    return { name: opcao.name, type: 5, value: VERDADEIROS.has(texto.toLowerCase()) };
  }
  if (!texto) return null;
  if (opcao.choices && opcao.choices.length > 0) {
    const escolha = opcao.choices.find(
      (c) => String(c.value) === texto || c.name.toLowerCase() === texto.toLowerCase(),
    );
    if (!escolha) return null;
    if (opcao.type === 4 || opcao.type === 10) {
      const numero = Number(escolha.value);
      return Number.isFinite(numero)
        ? { name: opcao.name, type: opcao.type, value: opcao.type === 4 ? Math.trunc(numero) : numero }
        : null;
    }
    return { name: opcao.name, type: opcao.type, value: String(escolha.value) };
  }
  const mencao = MENCAO_POR_TIPO[opcao.type];
  if (mencao) {
    const m = texto.match(mencao);
    return { name: opcao.name, type: opcao.type, value: m ? m[1] : texto };
  }
  if (opcao.type === 4 || opcao.type === 10) {
    const numero = Number(texto.replace(",", "."));
    if (!Number.isFinite(numero)) return null;
    // 4 é INTEGER no Discord: um "3.7" ali seria recusado pela lib do bot
    return { name: opcao.name, type: opcao.type, value: opcao.type === 4 ? Math.trunc(numero) : numero };
  }
  return { name: opcao.name, type: opcao.type, value: texto };
}

/**
 * ── aspas ──
 *
 * O campo é texto, então um valor com espaço vai entre aspas
 * (`musica:"never gonna"`). Até a rodada de correção nada era escapado, e o
 * `name` de uma escolha do bot é livre: `Diga "oi"` ou `Remix volume:11` no
 * campo confundiam o parser — o `volume:` de dentro virava marca de opção e o
 * valor era cortado ao meio. A regra agora:
 *
 * - `aplicarValorDeOpcao` põe aspas quando o valor tem espaço **ou** começa com
 *   aspas, e dentro delas escapa `\` e `"` com barra invertida;
 * - um valor entre aspas termina na primeira `"` **não escapada seguida de
 *   espaço ou do fim** — o que também tolera aspas digitadas à mão no meio;
 * - `marcasDeOpcoes` não procura `nome:` dentro de um valor entre aspas
 *   fechado. Aspas abertas e ainda não fechadas (no meio da digitação) não
 *   protegem nada: a marca seguinte continua valendo, como antes.
 */

/** A `"` em `i` está escapada (número ímpar de `\` logo antes)? */
function escapada(texto: string, i: number): boolean {
  let barras = 0;
  for (let j = i - 1; j >= 0 && texto[j] === "\\"; j--) barras++;
  return barras % 2 === 1;
}

/**
 * Onde fecha o valor entre aspas que abre em `abre`, ou -1 se não fecha: a
 * primeira `"` não escapada seguida de espaço ou do fim do texto.
 */
function fechamentoDasAspas(texto: string, abre: number): number {
  for (let i = abre + 1; i < texto.length; i++) {
    if (texto[i] !== '"' || escapada(texto, i)) continue;
    if (i + 1 === texto.length || /\s/.test(texto[i + 1])) return i;
  }
  return -1;
}

/** Tira as aspas de `"valor com espaço"`, quando elas embrulham o valor inteiro, e desfaz o escape. */
function semAspas(valor: string): string {
  const v = valor.trim();
  if (v.length < 2 || !v.startsWith('"') || fechamentoDasAspas(v, 0) !== v.length - 1) return v;
  return v.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

/** O valor como ele entra no campo: entre aspas (e escapado) quando precisa. */
function comAspas(valor: string): string {
  if (!/\s/.test(valor) && !valor.startsWith('"')) return valor;
  return `"${valor.replace(/["\\]/g, "\\$&")}"`;
}

/**
 * Reparte `nome:valor nome2:"valor com espaço"` em pares.
 *
 * Só conta como separador o `nome:` que (a) está no começo ou depois de um
 * espaço e (b) **é uma opção declarada pelo comando**. Sem a segunda regra, o
 * `https:` de `/play https://…` viraria nome de opção e o link sumiria — que é
 * exatamente o caso mais comum da fase.
 */
/** Onde cada `nome:` declarado começa e onde o valor dele começa. */
interface MarcaDeOpcao {
  nome: string;
  /** posição do `n` de `nome:`. */
  inicio: number;
  /** posição logo depois do `:` — onde o valor começa. */
  fim: number;
}

function marcasDeOpcoes(argumento: string, opcoes: readonly OpcaoDeComando[]): MarcaDeOpcao[] {
  const declaradas = new Set(opcoes.map((o) => o.name.toLowerCase()));
  const marcas: MarcaDeOpcao[] = [];
  /** fim do último valor entre aspas fechado: `nome:` antes disso é texto do valor. */
  let protegidoAte = 0;
  const re = /(^|\s)([a-z0-9_-]{1,32}):/g;
  for (let m = re.exec(argumento); m; m = re.exec(argumento)) {
    const nome = m[2].toLowerCase();
    const inicio = m.index + m[1].length;
    if (!declaradas.has(nome) || inicio < protegidoAte) continue;
    const fim = m.index + m[0].length;
    marcas.push({ nome, inicio, fim });
    if (argumento[fim] === '"') {
      const fecha = fechamentoDasAspas(argumento, fim);
      if (fecha >= 0) protegidoAte = fecha + 1;
    }
  }
  return marcas;
}

function repartirNomeadas(
  argumento: string,
  opcoes: readonly OpcaoDeComando[],
): Map<string, string> | null {
  const marcas = marcasDeOpcoes(argumento, opcoes);
  if (marcas.length === 0) return null;

  const pares = new Map<string, string>();
  for (let i = 0; i < marcas.length; i++) {
    const ate = i + 1 < marcas.length ? marcas[i + 1].inicio : argumento.length;
    pares.set(marcas[i].nome, semAspas(argumento.slice(marcas[i].fim, ate)));
  }
  return pares;
}

/**
 * O texto cru de cada opção (chave em minúsculas), nas duas formas que
 * `interpretarComandoDeApp` aceita: nomeadas, ou o resto livre quando o comando
 * tem uma opção só. Opção sem marca no campo não entra no mapa.
 */
function valoresBrutos(argumento: string, opcoes: readonly OpcaoDeComando[]): Map<string, string> {
  const nomeadas = repartirNomeadas(argumento, opcoes);
  if (nomeadas) return nomeadas;
  const brutos = new Map<string, string>();
  if (opcoes.length === 1 && argumento.trim()) brutos.set(opcoes[0].name.toLowerCase(), semAspas(argumento));
  return brutos;
}

// ── onda 3 · autocomplete de opção (callback 8) ─────────────────────────────

/**
 * Uma escolha que a pessoa pegou na lista que o **bot** devolveu. No Discord o
 * chip mostra o `name` e o bot recebe o `value` — e os dois costumam diferir
 * (`name: "Never Gonna Give You Up"`, `value: "dQw4w9WgXcQ"`). O nosso campo é
 * um `<textarea>` e só guarda texto, então o `name` vai para o campo (é o que a
 * pessoa lê) e o par fica guardado no composer até o envio.
 */
export interface EscolhaFeita {
  name: string;
  value: string | number;
}

/** Escolhas feitas, por `chaveDeEscolha(commandId, nomeDaOpção)`. */
export type EscolhasFeitas = ReadonlyMap<string, EscolhaFeita>;

export function chaveDeEscolha(commandId: string, opcao: string): string {
  return `${commandId}:${opcao.toLowerCase()}`;
}

/**
 * Troca o texto do campo pelo `value` da escolha feita — **só** se o texto
 * ainda é exatamente o `name` escolhido. Se a pessoa editou depois de escolher,
 * vale o que ela escreveu, como no Discord, onde o valor de uma opção com
 * autocomplete é texto livre e a lista é só sugestão.
 */
function comEscolhaFeita(
  commandId: string,
  opcao: OpcaoDeComando,
  bruto: string,
  escolhasFeitas: EscolhasFeitas | undefined,
): string {
  const escolha = escolhasFeitas?.get(chaveDeEscolha(commandId, opcao.name));
  return escolha && bruto.trim() === escolha.name.trim() ? String(escolha.value) : bruto;
}

/** A opção pede sugestões ao bot? Escolhas fixas (`choices`) continuam locais. */
export function opcaoPedeAutocomplete(opcao: OpcaoDeComando | null | undefined): opcao is OpcaoDeComando {
  return Boolean(opcao?.autocomplete) && !(opcao?.choices && opcao.choices.length > 0);
}

/** O que o composer precisa para chamar `pedirAutocomplete` da store. */
export interface PedidoDeAutocompleteDaOpcao {
  commandId: string;
  /** a mesma chave que a store guarda em `autocomplete.chave` (`commandId:opção`). */
  chave: string;
  options: PedidoDeAutocompleteInput["options"];
}

/**
 * Monta o pedido de autocomplete da opção sob o cursor, ou null quando não há o
 * que pedir (nativo, nenhuma opção ativa, opção sem `autocomplete: true`, ou
 * com `choices`, que são locais).
 *
 * É o `data.options` do `APPLICATION_COMMAND_AUTOCOMPLETE` do Discord:
 * - a opção em foco vai com `focused: true` e o `value` **em texto**, qualquer
 *   que seja o tipo dela (um `4` meio digitado é `"1"`, não `1`) — é a regra do
 *   Discord, e o `pedidoDeAutocompleteSchema` a repete;
 * - as outras vão só se já têm valor, convertidas como no envio
 *   (`converterOpcao`), com a escolha feita trocada pelo `value`. Número que
 *   ainda não é número e escolha fixa que não bate ficam de fora, pelo mesmo
 *   motivo do envio: mandar lixo ao bot é pior que não mandar.
 */
export function pedidoDeAutocomplete(
  texto: string,
  estado: EstadoDoComando,
  escolhasFeitas?: EscolhasFeitas,
): PedidoDeAutocompleteDaOpcao | null {
  const { comando, ativa } = estado;
  if (comando.nativo || !comando.commandId || !opcaoPedeAutocomplete(ativa)) return null;
  const commandId = comando.commandId;
  const brutos = valoresBrutos(texto.slice(1 + comando.nome.length), comando.opcoes);
  const emFoco = ativa.name.toLowerCase();

  const options: PedidoDeAutocompleteInput["options"] = [];
  for (const opcao of comando.opcoes) {
    const nome = opcao.name.toLowerCase();
    const bruto = brutos.get(nome);
    if (nome === emFoco) {
      // aspas abertas e ainda não fechadas (`termo:"never gon`) não são parte
      // do que se procura
      options.push({ name: opcao.name, type: opcao.type, value: (bruto ?? "").replace(/^"/, ""), focused: true });
      continue;
    }
    if (bruto === undefined || !bruto.trim()) continue;
    const convertida = converterOpcao(opcao, comEscolhaFeita(commandId, opcao, bruto, escolhasFeitas));
    if (convertida) options.push(convertida);
  }
  return { commandId, chave: `${commandId}:${ativa.name}`, options };
}

/**
 * Monta as opções de uma interação a partir do que foi digitado.
 *
 * Duas formas, nesta ordem:
 *
 * 1. **nomeadas** — `/play url:… volume:3`, quando algum `nome:` bate com uma
 *    opção declarada;
 * 2. **resto livre** — `/play https://…`, quando o comando declara **uma** opção
 *    só. É o que faz o `/play <link>` ser usável sem chip de UI, e é por isso
 *    que a forma 1 é testada primeiro: `/play url:…` continua valendo.
 *
 * Opção obrigatória em branco volta como `faltaOpcao`, e o composer mostra o
 * aviso em vez de gastar um 400 na API.
 */
export function interpretarComandoDeApp(
  comando: ComandoDeApp,
  argumento: string,
  escolhasFeitas?: EscolhasFeitas,
): ResultadoComando {
  const brutos = valoresBrutos(argumento, comando.options);
  const opcoes: OpcaoDeInteracao[] = [];

  for (const opcao of comando.options) {
    const bruto = comEscolhaFeita(comando.id, opcao, brutos.get(opcao.name.toLowerCase()) ?? "", escolhasFeitas);
    const preenchida = converterOpcao(opcao, bruto);
    if (preenchida) opcoes.push(preenchida);
    else if (opcao.required) return { tipo: "faltaOpcao", comando: comando.name, opcao: opcao.name };
  }

  return { tipo: "interacao", commandId: comando.id, opcoes };
}

/** Uma linha do autocomplete de `/` vinda de um bot, sem JSX — o ícone é do componente. */
export interface SugestaoDeComandoDeApp {
  chave: string;
  valor: string;
  rotulo: string;
  detalhe: string;
  /** o usuário-bot dono do comando: vira o avatar da linha. */
  botUser: PublicUser;
}

/**
 * Comandos de bot que casam com o termo digitado, para o popup do `/`.
 *
 * Fica fora do `buscarComandos` de propósito: aquele é a busca nos comandos do
 * contrato (`COMANDOS_BARRA`) e é o que o teste do autocomplete verifica. Aqui
 * some quem colide com um nativo, porque o nativo é quem vai rodar — mostrar
 * `/me` do bot na lista prometeria o que o `interpretarComando` não cumpre.
 */
export function sugestoesDeComandosDeApp(
  termo: string,
  comandos: readonly ComandoDeApp[],
): SugestaoDeComandoDeApp[] {
  const q = termo.trim().toLowerCase();
  const nativos = new Set(COMANDOS_BARRA.map((c) => c.nome));
  return comandos
    .filter((c) => !nativos.has(c.name) && c.name.toLowerCase().startsWith(q))
    .map((c) => ({
      chave: `app:${c.id}`,
      valor: `/${c.name}`,
      rotulo: `/${c.name}`,
      detalhe: c.description,
      botUser: c.botUser,
    }));
}

// ── 2c-composer · a UI de comandos de barra ─────────────────────────────────
//
// O seletor do Discord (`.outerWrapper_d1405b`, `css-bruto/116815…css`) não é
// uma lista corrida: é um trilho de apps à esquerda e uma seção por app, e cada
// linha mostra os chips das opções (obrigatórias, um separador "OPCIONAL", as
// opcionais). Depois de escolhido o comando, a barra acima do campo diz qual
// opção se está preenchendo. Tudo o que decide *o que* aparecer mora aqui, sem
// JSX, para ser testável; o composer só desenha.

/** Um comando como o seletor o lista — nativo ou de bot, com a mesma forma. */
export interface ComandoListavel {
  /** chave estável da linha (`nativo:shrug`, `app:<id>`). */
  chave: string;
  nome: string;
  descricao: string;
  /**
   * As opções que viram chip. Nos nativos é o `argumento` do contrato, que não
   * é nomeado (`/me dança`, não `/me mensagem:dança`) — por isso `nativo`.
   */
  opcoes: readonly OpcaoDeComando[];
  nativo: boolean;
  /**
   * ── onda 3 ── cuid do `ApplicationCommand` (o `commandId` das rotas de
   * interação); ausente nos nativos. Opcional para não obrigar quem monta um
   * `ComandoListavel` à mão (teste, história) a inventar um.
   */
  commandId?: string;
  /** o app dono; null nos nativos. */
  app: { id: string; nome: string; botUser: PublicUser } | null;
}

/** Uma seção do seletor: os nativos, ou os comandos de um app. */
export interface GrupoDeComandos {
  id: string;
  nome: string;
  /** o usuário-bot do app, para o ícone do trilho e do cabeçalho; null nos nativos. */
  botUser: PublicUser | null;
  comandos: ComandoListavel[];
}

/** Id da seção dos comandos nativos no seletor. */
export const GRUPO_NATIVOS = "nativos";

/**
 * O argumento do nativo como opção de chip. `/me` e `/spoiler` sem texto não
 * enviam nada (`interpretarComando` devolve `nenhum`), e `/nick` sem apelido
 * não tem o que mudar: esses três têm o argumento obrigatório. `/shrug` e os
 * outros sufixos funcionam sozinhos, e `/giphy` abre o seletor vazio.
 */
function opcoesDoNativo(c: ComandoBarra): OpcaoDeComando[] {
  if (!c.argumento) return [];
  const obrigatorio = c.tipo === "acao" || c.tipo === "spoiler" || c.tipo === "apelido";
  return [{ name: c.argumento, description: c.descricao, type: 3, required: obrigatorio }];
}

function nativoListavel(c: ComandoBarra): ComandoListavel {
  return {
    chave: `nativo:${c.nome}`,
    nome: c.nome,
    descricao: c.descricao,
    opcoes: opcoesDoNativo(c),
    nativo: true,
    app: null,
  };
}

function deAppListavel(c: ComandoDeApp): ComandoListavel {
  return {
    chave: `app:${c.id}`,
    nome: c.name,
    descricao: c.description,
    opcoes: c.options,
    nativo: false,
    commandId: c.id,
    app: { id: c.applicationId, nome: c.applicationName, botUser: c.botUser },
  };
}

/**
 * As seções do seletor para o termo digitado depois do `/`.
 *
 * Um grupo por app, na ordem em que o servidor os devolveu, e os integrados
 * **por último**: no Discord (`desenvolvedores/imagens/comandos/
 * lancador-de-comandos-desktop.png`) o trilho tem os apps em cima (y≈145–330),
 * o separador (y≈372) e só então o ícone dos integrados (y 397–423); o CSS
 * (`css-bruto/116815…css`) só tem `.builtInSeparator_b1e4f3{border-bottom:1px
 * solid var(--border-subtle);margin:8px 0}`, o separador **antes** deles. É só
 * ordem de exibição: a precedência de nome do `interpretarComando` (o nativo
 * ganha) não muda, e o comando de bot que colide com um nativo continua sumindo
 * pelo mesmo motivo de `sugestoesDeComandosDeApp`. Seção vazia não entra — o
 * trilho não pode ter ícone que leva a nada.
 *
 * Não existe "Usados com frequência": o Discord abre com ela, mas o Streamz não
 * guarda uso de comando, e uma seção inventada a partir de nada seria mentira.
 */
export function agruparComandos(termo: string, comandosDeApp: readonly ComandoDeApp[]): GrupoDeComandos[] {
  const grupos: GrupoDeComandos[] = [];
  const q = termo.trim().toLowerCase();
  const nomesNativos = new Set(COMANDOS_BARRA.map((c) => c.nome));
  const porApp = new Map<string, GrupoDeComandos>();
  for (const c of comandosDeApp) {
    if (nomesNativos.has(c.name) || !c.name.toLowerCase().startsWith(q)) continue;
    let grupo = porApp.get(c.applicationId);
    if (!grupo) {
      grupo = { id: `app:${c.applicationId}`, nome: c.applicationName, botUser: c.botUser, comandos: [] };
      porApp.set(c.applicationId, grupo);
      grupos.push(grupo);
    }
    grupo.comandos.push(deAppListavel(c));
  }
  const nativos = buscarComandos(termo).map(nativoListavel);
  if (nativos.length > 0) {
    grupos.push({ id: GRUPO_NATIVOS, nome: "Integrados", botUser: null, comandos: nativos });
  }
  return grupos;
}

/**
 * O texto que entra no campo ao escolher um comando no seletor.
 *
 * Comando de bot com opção obrigatória já nasce com o `nome:` da primeira
 * delas, que é o que o Discord faz ao escolher: o cursor cai direto no valor e
 * a barra acima diz o que ele espera. Nativo não ganha marca porque o argumento
 * dele é o resto livre da linha.
 */
export function textoAoEscolherComando(c: ComandoListavel): string {
  const base = `/${c.nome} `;
  if (c.nativo) return base;
  const primeira = c.opcoes.find((o) => o.required);
  return primeira ? `${base}${primeira.name}:` : base;
}

/** O comando reconhecido no campo e o ponto em que o preenchimento está. */
export interface EstadoDoComando {
  comando: ComandoListavel;
  /** a opção cujo valor está sob o cursor, ou null. */
  ativa: OpcaoDeComando | null;
  /** o que já foi escrito no valor da opção ativa, até o cursor. */
  termoAtivo: string;
  /** posição no texto onde o valor da opção ativa começa. */
  inicioDoValor: number;
  /** nomes (em minúsculas) das opções que já têm valor. */
  preenchidas: ReadonlySet<string>;
  /** nomes (em minúsculas) das opções que já têm `nome:` no campo, com ou sem valor. */
  marcadas: ReadonlySet<string>;
}

/**
 * Lê o campo e diz qual comando está sendo usado e qual opção se preenche.
 *
 * Só existe estado depois do espaço que fecha o nome (`/play ` e não `/pla`):
 * antes disso quem está na tela é o seletor de comandos. A precedência é a do
 * `interpretarComando` — o nativo ganha — para a barra nunca descrever um
 * comando diferente do que o Enter vai rodar.
 */
export function estadoDoComando(
  texto: string,
  caret: number,
  comandosDeApp: readonly ComandoDeApp[],
): EstadoDoComando | null {
  const m = texto.match(/^\/([a-z0-9_-]+)\s/);
  if (!m) return null;
  const nome = m[1];
  const fimDoNome = 1 + nome.length;
  const nativo = COMANDOS_BARRA.find((c) => c.nome === nome);
  const doApp = nativo ? undefined : comandosDeApp.find((c) => c.name === nome);
  if (!nativo && !doApp) return null;
  const comando = nativo ? nativoListavel(nativo) : deAppListavel(doApp!);
  const cursor = caret < 0 ? texto.length : caret;

  if (comando.nativo) {
    const opcao = comando.opcoes[0] ?? null;
    const resto = texto.slice(fimDoNome + 1);
    return {
      comando,
      ativa: opcao && cursor > fimDoNome ? opcao : null,
      termoAtivo: texto.slice(fimDoNome + 1, Math.max(fimDoNome + 1, cursor)),
      inicioDoValor: fimDoNome + 1,
      preenchidas: new Set(opcao && resto.trim() ? [opcao.name.toLowerCase()] : []),
      marcadas: new Set(opcao ? [opcao.name.toLowerCase()] : []),
    };
  }

  // as marcas são procuradas a partir do fim do nome, com o espaço incluído,
  // para o `(^|\s)` da regra de `marcasDeOpcoes` valer também na primeira
  const argumento = texto.slice(fimDoNome);
  const marcas = marcasDeOpcoes(argumento, comando.opcoes).map((k) => ({
    ...k,
    inicio: k.inicio + fimDoNome,
    fim: k.fim + fimDoNome,
  }));
  const preenchidas = new Set<string>();
  marcas.forEach((k, i) => {
    const ate = i + 1 < marcas.length ? marcas[i + 1].inicio : texto.length;
    if (semAspas(texto.slice(k.fim, ate))) preenchidas.add(k.nome);
  });

  // resto livre (`/play https://…`): só vale para comando de opção única
  if (marcas.length === 0) {
    const unica = comando.opcoes.length === 1 ? comando.opcoes[0] : null;
    const resto = texto.slice(fimDoNome + 1);
    if (unica && resto.trim()) preenchidas.add(unica.name.toLowerCase());
    return {
      comando,
      ativa: unica && cursor > fimDoNome ? unica : null,
      termoAtivo: texto.slice(fimDoNome + 1, Math.max(fimDoNome + 1, cursor)),
      inicioDoValor: fimDoNome + 1,
      preenchidas,
      marcadas: new Set(),
    };
  }

  // a opção ativa é a da última marca antes do cursor, enquanto o cursor não
  // passou da marca seguinte
  let ativa: OpcaoDeComando | null = null;
  let termoAtivo = "";
  let inicioDoValor = cursor;
  for (let i = marcas.length - 1; i >= 0; i--) {
    const k = marcas[i];
    if (k.fim > cursor) continue;
    const proxima = marcas[i + 1];
    if (proxima && proxima.inicio < cursor) break;
    const termo = texto.slice(k.fim, cursor);
    const opcao = comando.opcoes.find((o) => o.name.toLowerCase() === k.nome) ?? null;
    // valor de alvo, escolha, número ou booleano não tem espaço: depois dele a
    // opção terminou. Texto livre (3 sem `choices`) continua ativo com espaço.
    const textoLivre = opcao?.type === 3 && !opcao.choices?.length;
    if (opcao && (textoLivre || !/\s/.test(termo))) {
      ativa = opcao;
      termoAtivo = termo;
      inicioDoValor = k.fim;
    }
    break;
  }

  return {
    comando,
    ativa,
    termoAtivo,
    inicioDoValor,
    preenchidas,
    marcadas: new Set(marcas.map((k) => k.nome)),
  };
}

/**
 * Troca o valor da opção ativa pelo escolhido na lista e, se ainda faltar uma
 * obrigatória, já escreve o `nome:` dela — o Tab do Discord, que pula para a
 * próxima opção. Valor com espaço (ou que começa com aspas) vai entre aspas e
 * escapado (`comAspas`), que `semAspas` desfaz na hora de interpretar.
 */
export function aplicarValorDeOpcao(
  texto: string,
  caret: number,
  estado: EstadoDoComando,
  valor: string,
): { texto: string; caret: number } {
  const cursor = caret < 0 ? texto.length : caret;
  const escrito = comAspas(valor);
  const preenchidas = new Set(estado.preenchidas);
  if (estado.ativa) preenchidas.add(estado.ativa.name.toLowerCase());
  const proxima = estado.comando.nativo
    ? undefined
    : estado.comando.opcoes.find(
        (o) => o.required && !preenchidas.has(o.name.toLowerCase()) && !estado.marcadas.has(o.name.toLowerCase()),
      );
  const inserido = `${escrito} ${proxima ? `${proxima.name}:` : ""}`;
  const depois = texto.slice(cursor).replace(/^\S*/, "");
  const novo = texto.slice(0, estado.inicioDoValor) + inserido + depois.replace(/^\s+/, "");
  return { texto: novo, caret: estado.inicioDoValor + inserido.length };
}

/**
 * Acrescenta `nome:` de uma opção ao fim do campo — o clique no chip de uma
 * opcional ainda não usada, ou no "+N" da barra.
 */
export function acrescentarOpcao(texto: string, opcao: OpcaoDeComando): { texto: string; caret: number } {
  const base = /\s$/.test(texto) ? texto : `${texto} `;
  const novo = `${base}${opcao.name}:`;
  return { texto: novo, caret: novo.length };
}
