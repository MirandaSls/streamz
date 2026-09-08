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
 * Converte o texto digitado para o tipo que a opção declara.
 *
 * `null` quer dizer "não preenchida": vale para o valor vazio e para um número
 * que não é número (`volume:muito`). Mandar `"muito"` num campo de tipo 4 daria
 * 400 na API — e o toast de opção faltando é uma resposta melhor do que um erro
 * de servidor para quem digitou.
 *
 * Usuário (6), canal (7) e cargo (8) ficam como texto: o composer ainda não tem
 * seletor de alvo, então o que a pessoa escreveu vai como está.
 */
function converterOpcao(opcao: OpcaoDeComando, bruto: string): OpcaoDeInteracao | null {
  const texto = bruto.trim();
  if (opcao.type === 5) {
    // booleano só tem dois lados: o que não é "sim" é "não"
    return { name: opcao.name, type: 5, value: VERDADEIROS.has(texto.toLowerCase()) };
  }
  if (!texto) return null;
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
function repartirNomeadas(
  argumento: string,
  opcoes: readonly OpcaoDeComando[],
): Map<string, string> | null {
  const declaradas = new Set(opcoes.map((o) => o.name.toLowerCase()));
  const marcas: { nome: string; fim: number; inicio: number }[] = [];
  const re = /(^|\s)([a-z0-9_-]{1,32}):/g;
  for (let m = re.exec(argumento); m; m = re.exec(argumento)) {
    const nome = m[2].toLowerCase();
    if (!declaradas.has(nome)) continue;
    marcas.push({ nome, inicio: m.index + m[1].length, fim: m.index + m[0].length });
  }
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
