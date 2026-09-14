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
  if (doApp) return interpretarComandoDeApp(doApp, arg);

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

/** Tira as aspas de `"valor com espaço"`, quando elas embrulham o valor inteiro. */
function semAspas(valor: string): string {
  const v = valor.trim();
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
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
  const re = /(^|\s)([a-z0-9_-]{1,32}):/g;
  for (let m = re.exec(argumento); m; m = re.exec(argumento)) {
    const nome = m[2].toLowerCase();
    if (!declaradas.has(nome)) continue;
    marcas.push({ nome, inicio: m.index + m[1].length, fim: m.index + m[0].length });
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
export function interpretarComandoDeApp(comando: ComandoDeApp, argumento: string): ResultadoComando {
  const nomeadas = repartirNomeadas(argumento, comando.options);
  const opcoes: OpcaoDeInteracao[] = [];

  for (const opcao of comando.options) {
    const bruto = nomeadas
      ? (nomeadas.get(opcao.name.toLowerCase()) ?? "")
      : comando.options.length === 1
        ? semAspas(argumento)
        : "";
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
    app: { id: c.applicationId, nome: c.applicationName, botUser: c.botUser },
  };
}

/**
 * As seções do seletor para o termo digitado depois do `/`.
 *
 * Nativos primeiro (é a mesma precedência do `interpretarComando`), depois um
 * grupo por app, na ordem em que o servidor os devolveu. O comando de bot que
 * colide com um nativo some pelo mesmo motivo de `sugestoesDeComandosDeApp`.
 * Seção vazia não entra — o trilho não pode ter ícone que leva a nada.
 *
 * Não existe "Usados com frequência": o Discord abre com ela, mas o Streamz não
 * guarda uso de comando, e uma seção inventada a partir de nada seria mentira.
 */
export function agruparComandos(termo: string, comandosDeApp: readonly ComandoDeApp[]): GrupoDeComandos[] {
  const grupos: GrupoDeComandos[] = [];
  const nativos = buscarComandos(termo).map(nativoListavel);
  if (nativos.length > 0) {
    grupos.push({ id: GRUPO_NATIVOS, nome: "Integrados", botUser: null, comandos: nativos });
  }
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
 * próxima opção. Valor com espaço vai entre aspas, que `semAspas` tira na hora
 * de interpretar.
 */
export function aplicarValorDeOpcao(
  texto: string,
  caret: number,
  estado: EstadoDoComando,
  valor: string,
): { texto: string; caret: number } {
  const cursor = caret < 0 ? texto.length : caret;
  const escrito = /\s/.test(valor) && !valor.startsWith('"') ? `"${valor}"` : valor;
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
