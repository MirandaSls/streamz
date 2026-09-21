/**
 * O documento **OpenAPI 3.1** da API compatível com o Discord
 * (`GET {API_URL}/api/v10/openapi.json`), normalizado no que a página de
 * desenvolvedores precisa desenhar.
 *
 * Por que uma camada de normalização em vez de ler o documento cru na hora de
 * renderizar: o OpenAPI permite escrever a mesma coisa de várias formas
 * (`$ref` em qualquer profundidade, `type` como string ou lista, `allOf` que
 * só existe para juntar dois pedaços) e a especificação é **gerada por outro
 * processo** — se ela mudar de forma, quem quebra é este arquivo, um só, e não
 * cada tabela da tela.
 *
 * Duas regras que valem para tudo aqui:
 *
 * - **Nada é obrigatório.** Todo campo do documento é opcional no nosso tipo,
 *   porque um documento incompleto tem de desenhar uma página incompleta, não
 *   uma tela branca. O `indexar` nunca lança.
 * - **`x-` desconhecido é ignorado em silêncio; `x-` conhecido é bônus.** Cada
 *   leitor de extensão abaixo (`lerGuias`, `lerTabelaDePermissoes`,
 *   `lerIntents`…) confere campo a campo e devolve lista vazia no que não
 *   entender — bloco ausente some da tela, não a derruba.
 *
 * As extensões que a especificação publica hoje, e que a página desenha:
 *
 * | Bloco | Onde aparece |
 * |---|---|
 * | `x-guias` | os capítulos de texto, em Markdown, na ordem em que vierem |
 * | `x-tabela-permissoes` | tabelas no fim do guia de permissões |
 * | `x-intents`, `x-opcodes`, `x-eventos-gateway`, `x-codigos-de-fechamento` | tabelas no fim do guia do gateway |
 * | `x-codigos-de-erro` | seção própria, depois dos guias |
 * | `x-permissao`, `x-estado`, `x-exemplo-discordjs` | por operação, no cabeçalho e no painel de cada rota |
 *
 * Ciclos de `$ref` (mensagem → autor → … ) são a armadilha real de gerar
 * exemplo a partir de esquema: toda descida carrega o conjunto `vistos` e para
 * ao reencontrar um nome, senão a pilha estoura ao abrir a página.
 *
 * `$ref` também aparece **fora** dos esquemas: a especificação reaproveita
 * respostas de erro (`#/components/responses/NaoAutenticado`) e parâmetros
 * (`#/components/parameters/MotivoDeAuditoria`). Quem não resolver esses dois
 * desenha uma lista de respostas sem descrição nenhuma — por isso `indexar`
 * resolve tudo uma vez, e os componentes recebem objeto pronto.
 */

/** Um valor JSON qualquer — o que sai do documento e o que entra no exemplo. */
export type ValorJson = string | number | boolean | null | ValorJson[] | { [chave: string]: ValorJson };

export interface Esquema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  enum?: ValorJson[];
  const?: ValorJson;
  default?: ValorJson;
  /** OpenAPI 3.0 escrevia `example`; 3.1 usa `examples`, que é uma lista. */
  example?: ValorJson;
  examples?: ValorJson[];
  items?: Esquema;
  properties?: Record<string, Esquema>;
  required?: string[];
  additionalProperties?: boolean | Esquema;
  /** OpenAPI 3.0 escrevia assim; 3.1 usa `type: [..., "null"]`. Aceitamos os dois. */
  nullable?: boolean;
  deprecated?: boolean;
  allOf?: Esquema[];
  anyOf?: Esquema[];
  oneOf?: Esquema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface TipoDeMidia {
  schema?: Esquema;
  example?: ValorJson;
  examples?: Record<string, { value?: ValorJson; summary?: string }>;
}

export interface Parametro {
  name?: string;
  in?: string;
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: Esquema;
  example?: ValorJson;
}

export interface CorpoDeRequisicao {
  description?: string;
  required?: boolean;
  content?: Record<string, TipoDeMidia>;
}

export interface Resposta {
  description?: string;
  content?: Record<string, TipoDeMidia>;
  headers?: Record<string, { description?: string; schema?: Esquema }>;
}

/** Uma referência a `#/components/<seção>/<nome>`, no lugar do objeto. */
export interface Referencia {
  $ref?: string;
}

export type ParametroOuRef = Parametro & Referencia;
export type RespostaOuRef = Resposta & Referencia;

/**
 * O estado de implementação da rota (`x-estado`).
 *
 * Não é o mesmo eixo que `deprecated`: a especificação marca como `deprecated`
 * as rotas que respondem **501**, e três delas são `parcial` (o caminho
 * `@original` funciona, os outros ids não). Ver `RotaIndexada.obsoleta`.
 */
export type EstadoDaRota = "estavel" | "parcial" | "nao-implementado";

/** `x-exemplo-discordjs`: um trecho pronto, com o título que o explica. */
export interface ExemploDeCodigo {
  titulo: string;
  codigo: string;
}

export interface Operacao {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: ParametroOuRef[];
  requestBody?: CorpoDeRequisicao;
  responses?: Record<string, RespostaOuRef>;
  /** `[]` = rota pública, sem `Authorization`. Ausente = herda a global. */
  security?: Record<string, string[]>[];
  /** o que a rota exige; `null` = nenhuma permissão de servidor. */
  "x-permissao"?: string | null;
  "x-estado"?: string;
  "x-exemplo-discordjs"?: { titulo?: string; codigo?: string };
}

export interface VariavelDeServidor {
  default?: string;
  enum?: string[];
  description?: string;
}

export interface ServidorDeclarado {
  url?: string;
  description?: string;
  variables?: Record<string, VariavelDeServidor>;
}

export interface DocumentoOpenAPI {
  openapi?: string;
  info?: { title?: string; version?: string; summary?: string; description?: string };
  servers?: ServidorDeclarado[];
  tags?: { name?: string; description?: string }[];
  security?: Record<string, string[]>[];
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, Esquema>;
    responses?: Record<string, Resposta>;
    parameters?: Record<string, Parametro>;
    securitySchemes?: Record<string, { type?: string; in?: string; name?: string; description?: string }>;
  };
  "x-guias"?: unknown;
  "x-tabela-permissoes"?: unknown;
  "x-intents"?: unknown;
  "x-opcodes"?: unknown;
  "x-eventos-gateway"?: unknown;
  "x-codigos-de-fechamento"?: unknown;
  "x-codigos-de-erro"?: unknown;
}

/** Os verbos que o OpenAPI reconhece dentro de um item de caminho. */
const METODOS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Índice: o que a página desenha
// ─────────────────────────────────────────────────────────────────────────────

export interface RotaIndexada {
  /** parte da âncora depois do `#/` — ex.: `mensagens/criar-mensagem` */
  id: string;
  metodo: string;
  caminho: string;
  titulo: string;
  operacao: Operacao;
  /** parâmetros do caminho já somados aos da operação, com o `$ref` resolvido */
  parametros: Parametro[];
  /** respostas já resolvidas, na ordem de exibição */
  respostas: { codigo: string; resposta: Resposta }[];
  tag: string;
  /** `x-permissao`: o que a rota exige. `null` = nenhuma permissão de servidor. */
  permissao: string | null;
  /** `x-estado`, quando a especificação declarou um valor que conhecemos. */
  estado: EstadoDaRota | null;
  /**
   * `deprecated` **não** quer dizer "vai sumir" nesta API: marca as rotas que
   * respondem 501 para a biblioteca ler `20012` em vez de um 404 genérico. O
   * rótulo na tela diz isso; ver `Rota.tsx`.
   */
  obsoleta: boolean;
  /** `security: []` — chamada sem `Authorization` (callback e followup). */
  publica: boolean;
  exemplos: ExemploDeCodigo[];
}

export interface GrupoDeRotas {
  id: string;
  nome: string;
  descricao?: string;
  rotas: RotaIndexada[];
}

export interface EsquemaIndexado {
  id: string;
  nome: string;
  esquema: Esquema;
}

export interface Guia {
  /** a âncora inteira (`guias/permissoes`) */
  id: string;
  /** só o apelido (`permissoes`) — é por ele que as tabelas acham o seu guia */
  slug: string;
  titulo: string;
  /** uma linha, do `resumo` da especificação */
  resumo?: string;
  conteudo: string;
}

// ── os blocos `x-` que viram tabela ──────────────────────────

export interface ParDePermissao {
  streamz: string;
  bitStreamz: number | null;
  discord: string;
  bitDiscord: number | null;
}

export interface PermissaoSempreConcedida {
  discord: string;
  bitDiscord: number | null;
  porque: string;
}

export interface TabelaDePermissoes {
  pares: ParDePermissao[];
  sempreConcedidas: PermissaoSempreConcedida[];
  sempreApagadas: string[];
  nota: string;
}

export interface IntentDocumentado {
  nome: string;
  bit: number | null;
  valor: number | null;
  eventos: string[];
  nota?: string;
}

export interface OpcodeDocumentado {
  codigo: number | null;
  nome: string;
  direcao: string;
  suporte: string;
}

export interface EventoDoGateway {
  nome: string;
  /** o intent que o libera; `null` = sempre entregue */
  intent: string | null;
  quando: string;
  /** nome do esquema do payload, quando a especificação apontou um */
  payload?: string;
}

export interface CodigoDeFechamento {
  codigo: number | null;
  nome: string;
  quando: string;
  /** `false` = irrecuperável: a biblioteca não deve tentar de novo */
  reconecta: boolean;
}

export interface CodigoDeErro {
  code: number | null;
  http: number | null;
  nome: string;
  quando: string;
}

export interface ItemDeBusca {
  tipo: "rota" | "esquema" | "campo" | "guia";
  titulo: string;
  detalhe: string;
  ancora: string;
  /** minúsculas e sem acento, para casar sem normalizar a cada tecla */
  chave: string;
}

export interface Indice {
  titulo: string;
  versao: string;
  descricao?: string;
  servidor: string;
  servidores: { url: string; description?: string }[];
  grupos: GrupoDeRotas[];
  esquemas: EsquemaIndexado[];
  guias: Guia[];
  permissoes: TabelaDePermissoes | null;
  intents: IntentDocumentado[];
  opcodes: OpcodeDocumentado[];
  eventos: EventoDoGateway[];
  fechamentos: CodigoDeFechamento[];
  erros: CodigoDeErro[];
  busca: ItemDeBusca[];
  /** todas as rotas em ordem de tela, para o realce por rolagem */
  totalDeRotas: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Texto
// ─────────────────────────────────────────────────────────────────────────────

/** Minúsculas sem acento: a chave de busca e a base de toda âncora. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** `Criar mensagem` → `criar-mensagem`. Vazio nunca sai: viraria `#/` solto. */
export function apelido(texto: string): string {
  const limpo = normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return limpo || "item";
}

/** `rate-limit` → `Rate limit`: título decente para guia que só trouxe a chave. */
function humanizar(chave: string): string {
  const texto = chave.replace(/[-_]+/g, " ").trim();
  return texto ? texto[0].toUpperCase() + texto.slice(1) : chave;
}

/**
 * O `id` do elemento que a âncora `#/<id>` encontra.
 *
 * A barra inicial não é enfeite: o navegador casa `#x` com `id="x"`, então
 * para o link `#/mensagens/criar` funcionar sem JavaScript o elemento precisa
 * ter literalmente `id="/mensagens/criar"`. HTML5 aceita qualquer caractere
 * menos espaço no `id`; quem não aceita é o `querySelector` (a barra virava
 * seletor de tipo), e por isso a busca do elemento é sempre por
 * `getElementById`, nunca por seletor.
 */
export function idDoElemento(ancora: string): string {
  return `/${ancora}`;
}

/** O `href` da âncora. */
export function hrefDaAncora(ancora: string): string {
  return `#/${ancora}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// `$ref`
// ─────────────────────────────────────────────────────────────────────────────

/** `#/components/schemas/Message` → `Message`. */
export function nomeDoRef(ref: string): string {
  const partes = ref.split("/");
  return decodeURIComponent(partes[partes.length - 1] ?? ref);
}

/** Âncora do esquema, para o `$ref` virar link interno. */
export function ancoraDoEsquema(nome: string): string {
  return `esquemas/${apelido(nome)}`;
}

/** O que sobra quando um `$ref` de resposta não resolve: nada a dizer. */
const RESPOSTA_VAZIA: Resposta = {};

/**
 * Resolve `{ $ref: "#/components/responses/<nome>" }` contra o documento.
 *
 * **Toda** rota autenticada referencia `NaoAutenticado`, `LimiteExcedido` e
 * `ErroInterno` em vez de repetir o texto dos três. Sem resolver, a lista de
 * respostas sai com linhas vazias em cinquenta e cinco rotas — e o painel de
 * exemplo, sem o corpo do erro, que é o que a biblioteca vai receber.
 *
 * Um `$ref` que aponta para fora de `#/components/responses` (arquivo externo,
 * URL) vira resposta vazia: buscar outro documento pela rede aqui seria uma
 * segunda fonte de verdade, e a página não tem o que fazer com ela.
 */
function resolverResposta(doc: DocumentoOpenAPI, valor: RespostaOuRef | undefined): Resposta {
  if (!valor) return RESPOSTA_VAZIA;
  if (!valor.$ref) return valor;
  const prefixo = "#/components/responses/";
  if (!valor.$ref.startsWith(prefixo)) return RESPOSTA_VAZIA;
  return doc.components?.responses?.[nomeDoRef(valor.$ref)] ?? RESPOSTA_VAZIA;
}

/** O mesmo, para `#/components/parameters/<nome>` (o `x-audit-log-reason`). */
function resolverParametro(doc: DocumentoOpenAPI, valor: ParametroOuRef | undefined): Parametro | undefined {
  if (!valor) return undefined;
  if (!valor.$ref) return valor;
  const prefixo = "#/components/parameters/";
  if (!valor.$ref.startsWith(prefixo)) return undefined;
  return doc.components?.parameters?.[nomeDoRef(valor.$ref)];
}

/**
 * A URL de um servidor com as variáveis (`{versao}`) já trocadas pelo padrão.
 *
 * `https://api.streamz.chat/api/{versao}` é o que o documento declara, e é a
 * URL **do documento**, não a de quem chama: um `curl` com a chave literal no
 * caminho responde 404. O padrão declarado (`v10`) é o que a página mostra.
 */
export function urlDoServidor(servidor: ServidorDeclarado | undefined): string {
  const bruta = (servidor?.url ?? "").trim();
  if (!bruta) return "";
  return bruta.replace(/\{([^}]+)\}/g, (inteiro, chave: string) => {
    const variavel = servidor?.variables?.[chave];
    const padrao = typeof variavel?.default === "string" ? variavel.default : variavel?.enum?.[0];
    return padrao ?? inteiro;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos legíveis
// ─────────────────────────────────────────────────────────────────────────────

export interface TipoLegivel {
  /** o que escrever antes dos links (`array de`, `string`, `um de`…) */
  rotulo: string;
  /** nomes de esquema citados, já prontos para virar link */
  refs: string[];
  /** `null` na união de tipos ou `nullable: true` */
  aceitaNulo: boolean;
}

/**
 * Descreve o tipo de um esquema sem resolver o `$ref`: o nome referenciado é
 * mais informativo que o objeto por trás dele, e vira link.
 *
 * Os nomes de tipo (`string`, `integer`, `object`) ficam como estão de
 * propósito — são identificadores do JSON Schema, não texto de interface:
 * quem lê a tabela vai procurá-los na especificação, e traduzir criaria uma
 * palavra que não existe em lugar nenhum.
 */
export function descreverTipo(esquema: Esquema | undefined): TipoLegivel {
  if (!esquema) return { rotulo: "—", refs: [], aceitaNulo: false };

  if (esquema.$ref) return { rotulo: "", refs: [nomeDoRef(esquema.$ref)], aceitaNulo: false };

  const uniao = esquema.oneOf ?? esquema.anyOf;
  if (uniao?.length) {
    const filhos = uniao.map(descreverTipo);
    const nulo = filhos.some((f) => f.aceitaNulo || f.rotulo === "null");
    const uteis = filhos.filter((f) => f.rotulo !== "null");
    if (uteis.length === 1) return { ...uteis[0], aceitaNulo: nulo };
    return {
      rotulo: uteis.map((f) => f.rotulo).filter(Boolean).join(" ou ") || "um de",
      refs: uteis.flatMap((f) => f.refs),
      aceitaNulo: nulo,
    };
  }

  if (esquema.allOf?.length) {
    // `allOf` quase sempre é "este esquema, com um detalhe a mais": o primeiro
    // membro é o que tem nome, e é o que interessa na tabela
    const filhos = esquema.allOf.map(descreverTipo);
    return {
      rotulo: filhos.map((f) => f.rotulo).filter(Boolean)[0] ?? "",
      refs: filhos.flatMap((f) => f.refs),
      aceitaNulo: filhos.some((f) => f.aceitaNulo),
    };
  }

  const tipos = Array.isArray(esquema.type) ? esquema.type : esquema.type ? [esquema.type] : [];
  const aceitaNulo = Boolean(esquema.nullable) || tipos.includes("null");
  const concretos = tipos.filter((t) => t !== "null");

  if (concretos.includes("array") || esquema.items) {
    const filho = descreverTipo(esquema.items);
    const sufixo = filho.rotulo || (filho.refs.length ? "" : "valores");
    return {
      rotulo: `array de ${sufixo}`.trim(),
      refs: filho.refs,
      aceitaNulo,
    };
  }

  if (esquema.enum?.length && concretos.length === 0) return { rotulo: "enum", refs: [], aceitaNulo };

  // `type: "null"` sozinho é um tipo, não um tipo ausente: é como a
  // especificação declara os campos que **sempre** vêm nulos (`avatar`). Sem
  // este caso o rótulo sairia "any ou nulo", que é o contrário de informativo.
  if (!concretos.length && aceitaNulo) return { rotulo: "null", refs: [], aceitaNulo: false };

  const base = concretos.length ? concretos.join(" ou ") : esquema.properties ? "object" : "any";
  const formato = esquema.format ? ` (${esquema.format})` : "";
  return { rotulo: `${base}${formato}`, refs: [], aceitaNulo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exemplo a partir do esquema
// ─────────────────────────────────────────────────────────────────────────────

/** Snowflake de exemplo — o mesmo em toda a página, para o olho reconhecer. */
export const ID_DE_EXEMPLO = "1382915770057249472";

const EXEMPLO_POR_FORMATO: Record<string, ValorJson> = {
  snowflake: ID_DE_EXEMPLO,
  "date-time": "2026-09-21T18:30:00.000+00:00",
  date: "2026-09-21",
  uri: "https://streamz.chat",
  url: "https://streamz.chat",
  email: "bot@streamz.chat",
  uuid: "6f1b1e2a-6c5f-4d0f-9a61-5c4f3b2a1d0e",
  binary: "<arquivo>",
};

/**
 * Um valor de exemplo para o esquema, para a coluna da direita mostrar JSON de
 * verdade em vez de `{}`.
 *
 * `vistos` guarda os nomes já expandidos nesta descida: sem ele, um esquema que
 * se referencia (mensagem → mensagem respondida → mensagem…) desce até estourar
 * a pilha. Ao reencontrar um nome, o exemplo vira `null` — que é o que o campo
 * costuma ser quando a recursão para de valer.
 */
export function exemploDoEsquema(
  doc: DocumentoOpenAPI,
  esquema: Esquema | undefined,
  vistos: ReadonlySet<string> = new Set(),
  profundidade = 0,
): ValorJson {
  if (!esquema || profundidade > 6) return null;

  if (esquema.$ref) {
    const nome = nomeDoRef(esquema.$ref);
    if (vistos.has(nome)) return null;
    const alvo = doc.components?.schemas?.[nome];
    if (!alvo) return null;
    return exemploDoEsquema(doc, alvo, new Set([...vistos, nome]), profundidade + 1);
  }

  // `examples` antes de `example`: é o que o OpenAPI 3.1 escreve, e é o que
  // esta especificação usa (`Snowflake`, `retry_after`, a URL do gateway)
  if (esquema.examples?.length) return esquema.examples[0];
  if (esquema.example !== undefined) return esquema.example;
  if (esquema.const !== undefined) return esquema.const;
  if (esquema.default !== undefined) return esquema.default;
  if (esquema.enum?.length) return esquema.enum[0];

  if (esquema.allOf?.length) {
    // um `allOf` de objetos é um objeto só: juntamos os exemplos dos membros
    const juntos: Record<string, ValorJson> = {};
    for (const parte of esquema.allOf) {
      const valor = exemploDoEsquema(doc, parte, vistos, profundidade + 1);
      if (valor && typeof valor === "object" && !Array.isArray(valor)) Object.assign(juntos, valor);
    }
    return Object.keys(juntos).length ? juntos : null;
  }

  const uniao = esquema.oneOf ?? esquema.anyOf;
  if (uniao?.length) {
    const util = uniao.find((parte) => parte.type !== "null") ?? uniao[0];
    return exemploDoEsquema(doc, util, vistos, profundidade + 1);
  }

  const tipos = Array.isArray(esquema.type) ? esquema.type : esquema.type ? [esquema.type] : [];
  const tipo = tipos.find((t) => t !== "null");

  if (tipo === "array" || (!tipo && esquema.items)) {
    const item = exemploDoEsquema(doc, esquema.items, vistos, profundidade + 1);
    return item === null && !esquema.items ? [] : [item];
  }

  if (tipo === "object" || (!tipo && esquema.properties)) {
    const objeto: Record<string, ValorJson> = {};
    for (const [chave, filho] of Object.entries(esquema.properties ?? {})) {
      objeto[chave] = exemploDoEsquema(doc, filho, vistos, profundidade + 1);
    }
    return objeto;
  }

  if (tipo === "boolean") return false;
  if (tipo === "integer" || tipo === "number") {
    if (esquema.minimum !== undefined) return esquema.minimum;
    return tipo === "integer" ? 0 : 0.5;
  }
  if (tipo === "null") return null;

  // string (e o que não declarou tipo)
  if (esquema.format && EXEMPLO_POR_FORMATO[esquema.format] !== undefined) {
    return EXEMPLO_POR_FORMATO[esquema.format];
  }
  if (esquema.pattern && /^\^?\[?\\?d|\[0-9\]/.test(esquema.pattern)) return ID_DE_EXEMPLO;
  return esquema.title ?? "texto";
}

/** O exemplo declarado no `content`, se houver; senão, um derivado do esquema. */
export function exemploDoConteudo(
  doc: DocumentoOpenAPI,
  conteudo: Record<string, TipoDeMidia> | undefined,
): { midia: string; valor: ValorJson } | null {
  if (!conteudo) return null;
  const midia = conteudo["application/json"] ? "application/json" : Object.keys(conteudo)[0];
  if (!midia) return null;
  const item = conteudo[midia];
  if (item?.example !== undefined) return { midia, valor: item.example };
  const nomeado = Object.values(item?.examples ?? {}).find((e) => e?.value !== undefined);
  if (nomeado?.value !== undefined) return { midia, valor: nomeado.value };
  if (!item?.schema) return null;
  return { midia, valor: exemploDoEsquema(doc, item.schema) };
}

/** JSON indentado — o que o painel da direita mostra e o que o `curl` manda. */
export function formatarJson(valor: ValorJson): string {
  try {
    return JSON.stringify(valor, null, 2) ?? "null";
  } catch {
    return "null";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// `curl`
// ─────────────────────────────────────────────────────────────────────────────

/** Valor plausível para um parâmetro, para o `curl` sair copiável. */
export function valorDeParametro(doc: DocumentoOpenAPI, parametro: Parametro): string {
  if (parametro.example !== undefined) return String(parametro.example);
  const valor = exemploDoEsquema(doc, parametro.schema);
  if (valor === null || typeof valor === "object") return ID_DE_EXEMPLO;
  // `"texto"` é o que sobra de uma string sem exemplo declarado. No meio de um
  // caminho ela vira `/interactions/138…/texto/callback`, que parece uma URL de
  // verdade e não é — o nome do parâmetro em caixa alta diz o que pôr ali.
  if (valor === "texto" && parametro.name) return parametro.name.toUpperCase();
  return String(valor);
}

/**
 * O `curl` da rota, com o servidor desta instância, o cabeçalho de bot e o
 * corpo de exemplo. É o trecho que a coluna da direita mostra primeiro — o que
 * dá a uma referência a cara de documentação, e não de formulário.
 *
 * Aspas simples em volta da URL e do corpo, `'\''` para escapar a aspa que
 * aparecer dentro: é o escape que funciona no shell POSIX sem depender de
 * como o terminal trata a barra invertida.
 */
export function curlDaRota(doc: DocumentoOpenAPI, servidor: string, rota: RotaIndexada): string {
  let caminho = rota.caminho;
  for (const p of rota.parametros) {
    if (p.in !== "path" || !p.name) continue;
    caminho = caminho.replace(`{${p.name}}`, valorDeParametro(doc, p));
  }

  const consulta = rota.parametros
    .filter((p) => p.in === "query" && p.required && p.name)
    .map((p) => `${encodeURIComponent(p.name as string)}=${encodeURIComponent(valorDeParametro(doc, p))}`)
    .join("&");

  const url = `${servidor}${caminho}${consulta ? `?${consulta}` : ""}`;
  const linhas = [`curl -X ${rota.metodo} ${aspas(url)}`];
  // rota pública (`security: []`) não leva cabeçalho: o credencial dela é o
  // token da interação, que já está no caminho. Mandar `Authorization` num
  // callback é o erro que faz o exemplo "não funcionar" sem dizer por quê.
  if (!rota.publica) linhas.push(`  -H ${aspas("Authorization: Bot SEU_TOKEN")}`);

  const corpo = exemploDoConteudo(doc, rota.operacao.requestBody?.content);
  if (corpo) {
    linhas.push(`  -H ${aspas(`Content-Type: ${corpo.midia}`)}`);
    linhas.push(`  -d ${aspas(formatarJson(corpo.valor))}`);
  }
  return linhas.join(" \\\n");
}

function aspas(texto: string): string {
  return `'${texto.replace(/'/g, "'\\''")}'`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guias (`x-guias`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `x-guias`: a lista de capítulos, **na ordem em que a página deve exibi-los**
 * — a especificação escolhe a sequência (primeiros passos → autenticação →
 * limites → gateway → …), e reordenar aqui seria a página discordando dela.
 *
 * O `id` de cada guia é o apelido que vira âncora, e é também o que as tabelas
 * de `x-intents`, `x-tabela-permissoes` e companhia usam para achar o guia a
 * que pertencem (`slug`). Guia sem `conteudo` não vira seção vazia na
 * navegação — é o único motivo de um item ser descartado.
 *
 * Os nomes alternativos de campo continuam aceitos (`title`, `content`,…): não
 * custam nada e mantêm a página de pé se a extensão for reescrita.
 */
export function lerGuias(bruto: unknown): Guia[] {
  const cru: [string, unknown][] = Array.isArray(bruto)
    ? bruto.map((item: unknown, i: number): [string, unknown] => [String(i), item])
    : bruto && typeof bruto === "object"
      ? Object.entries(bruto as Record<string, unknown>)
      : [];

  const guias: Guia[] = [];
  for (const [chave, item] of cru) {
    if (typeof item === "string") {
      if (!item.trim()) continue;
      const slug = apelido(chave);
      guias.push({ id: `guias/${slug}`, slug, titulo: humanizar(chave), conteudo: item });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const objeto = item as Record<string, unknown>;
    const titulo = primeiroTexto(objeto, ["titulo", "title", "nome", "name"]) ?? humanizar(chave);
    const conteudo = primeiroTexto(objeto, ["conteudo", "corpo", "texto", "content", "body", "markdown", "description"]);
    if (!conteudo) continue;
    const slug = apelido(primeiroTexto(objeto, ["id", "slug"]) ?? titulo);
    guias.push({
      id: `guias/${slug}`,
      slug,
      titulo,
      resumo: primeiroTexto(objeto, ["resumo", "summary", "descricao"]),
      conteudo,
    });
  }
  return guias;
}

function primeiroTexto(objeto: Record<string, unknown>, chaves: string[]): string | undefined {
  for (const chave of chaves) {
    const valor = objeto[chave];
    if (typeof valor === "string" && valor.trim()) return valor;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Os blocos `x-` que viram tabela
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os leitores abaixo seguem todos a mesma regra: **linha que não tem o campo
 * que a identifica é descartada**, e o resto de cada linha é normalizado para o
 * tipo que a tabela espera. É o que impede uma célula `undefined` de virar o
 * texto "undefined" no meio de uma tabela de permissões.
 */
function lerLista<T>(bruto: unknown, ler: (linha: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(bruto)) return [];
  const saida: T[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const lida = ler(item as Record<string, unknown>);
    if (lida !== null) saida.push(lida);
  }
  return saida;
}

function textoDe(linha: Record<string, unknown>, chave: string): string {
  const valor = linha[chave];
  return typeof valor === "string" ? valor : "";
}

/** Número, ou `null` — para a célula mostrar "—" em vez de `NaN`. */
function numeroDe(linha: Record<string, unknown>, chave: string): number | null {
  const valor = linha[chave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function textosDe(linha: Record<string, unknown>, chave: string): string[] {
  const valor = linha[chave];
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

export function lerTabelaDePermissoes(bruto: unknown): TabelaDePermissoes | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const objeto = bruto as Record<string, unknown>;

  const pares = lerLista<ParDePermissao>(objeto.pares, (linha) => {
    const streamz = textoDe(linha, "streamz");
    const discord = textoDe(linha, "discord");
    if (!streamz && !discord) return null;
    return { streamz, discord, bitStreamz: numeroDe(linha, "bitStreamz"), bitDiscord: numeroDe(linha, "bitDiscord") };
  });

  const sempreConcedidas = lerLista<PermissaoSempreConcedida>(objeto.sempreConcedidas, (linha) => {
    const discord = textoDe(linha, "discord");
    if (!discord) return null;
    return { discord, bitDiscord: numeroDe(linha, "bitDiscord"), porque: textoDe(linha, "porque") };
  });

  const sempreApagadas = Array.isArray(objeto.sempreApagadas)
    ? objeto.sempreApagadas.filter((v): v is string => typeof v === "string")
    : [];

  const nota = typeof objeto.nota === "string" ? objeto.nota : "";

  if (!pares.length && !sempreConcedidas.length && !sempreApagadas.length) return null;
  return { pares, sempreConcedidas, sempreApagadas, nota };
}

export function lerIntents(bruto: unknown): IntentDocumentado[] {
  return lerLista<IntentDocumentado>(bruto, (linha) => {
    const nome = textoDe(linha, "nome");
    if (!nome) return null;
    const nota = textoDe(linha, "nota");
    return {
      nome,
      bit: numeroDe(linha, "bit"),
      valor: numeroDe(linha, "valor"),
      eventos: textosDe(linha, "eventos"),
      nota: nota || undefined,
    };
  });
}

export function lerOpcodes(bruto: unknown): OpcodeDocumentado[] {
  return lerLista<OpcodeDocumentado>(bruto, (linha) => {
    const nome = textoDe(linha, "nome");
    if (!nome) return null;
    return {
      nome,
      codigo: numeroDe(linha, "codigo"),
      direcao: textoDe(linha, "direcao"),
      suporte: textoDe(linha, "suporte"),
    };
  });
}

export function lerEventosDoGateway(bruto: unknown): EventoDoGateway[] {
  return lerLista<EventoDoGateway>(bruto, (linha) => {
    const nome = textoDe(linha, "nome");
    if (!nome) return null;
    // `intent: null` é informação, não ausência: quer dizer "sempre entregue".
    // Por isso o campo é `string | null` e não `string | undefined`.
    const intent = typeof linha.intent === "string" && linha.intent.trim() ? linha.intent : null;
    const payload = linha.payload as Referencia | undefined;
    return {
      nome,
      intent,
      quando: textoDe(linha, "quando"),
      payload: typeof payload?.$ref === "string" ? nomeDoRef(payload.$ref) : undefined,
    };
  });
}

export function lerCodigosDeFechamento(bruto: unknown): CodigoDeFechamento[] {
  return lerLista<CodigoDeFechamento>(bruto, (linha) => {
    const codigo = numeroDe(linha, "codigo");
    if (codigo === null) return null;
    return {
      codigo,
      nome: textoDe(linha, "nome"),
      quando: textoDe(linha, "quando"),
      // só `true` explícito reconecta: no silêncio, avisar que é irrecuperável
      // erra para o lado seguro — quem lê confere, em vez de ficar em retry cego
      reconecta: linha.reconecta === true,
    };
  });
}

export function lerCodigosDeErro(bruto: unknown): CodigoDeErro[] {
  return lerLista<CodigoDeErro>(bruto, (linha) => {
    const code = numeroDe(linha, "code");
    if (code === null) return null;
    return { code, http: numeroDe(linha, "http"), nome: textoDe(linha, "nome"), quando: textoDe(linha, "quando") };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Índice
// ─────────────────────────────────────────────────────────────────────────────

const SEM_TAG = "Outras rotas";

export interface CampoDeEsquema {
  nome: string;
  esquema: Esquema;
  obrigatorio: boolean;
}

/**
 * Os campos de um esquema de objeto, já com o `$ref` resolvido e os `allOf`
 * achatados — que é a forma como um gerador escreve "este esquema mais aquele"
 * e a tabela precisa mostrar como uma lista só.
 *
 * `oneOf`/`anyOf` **não** são achatados: ali os campos são alternativas, e
 * juntá-los numa tabela diria que todos convivem, o que é falso. Nesse caso a
 * tabela fica vazia e o leitor cai no exemplo e nos links de tipo.
 */
export function camposDoEsquema(
  doc: DocumentoOpenAPI,
  esquema: Esquema | undefined,
  vistos: ReadonlySet<string> = new Set(),
): CampoDeEsquema[] {
  if (!esquema) return [];

  if (esquema.$ref) {
    const nome = nomeDoRef(esquema.$ref);
    if (vistos.has(nome)) return [];
    return camposDoEsquema(doc, doc.components?.schemas?.[nome], new Set([...vistos, nome]));
  }

  if (esquema.allOf?.length) {
    const juntos = new Map<string, CampoDeEsquema>();
    for (const parte of esquema.allOf) {
      for (const campo of camposDoEsquema(doc, parte, vistos)) juntos.set(campo.nome, campo);
    }
    return [...juntos.values()];
  }

  const obrigatorios = new Set(esquema.required ?? []);
  return Object.entries(esquema.properties ?? {}).map(([nome, filho]) => ({
    nome,
    esquema: filho,
    obrigatorio: obrigatorios.has(nome),
  }));
}

/** Ordena os códigos de resposta: sucesso primeiro, `default` por último. */
export function ordenarRespostas(codigos: string[]): string[] {
  return [...codigos].sort((a, b) => {
    if (a === "default") return 1;
    if (b === "default") return -1;
    return Number(a) - Number(b);
  });
}

const ESTADOS: readonly EstadoDaRota[] = ["estavel", "parcial", "nao-implementado"];

/** `x-estado`, só quando o valor é um dos que a página sabe desenhar. */
function lerEstado(bruto: unknown): EstadoDaRota | null {
  return typeof bruto === "string" && (ESTADOS as readonly string[]).includes(bruto)
    ? (bruto as EstadoDaRota)
    : null;
}

/**
 * `x-exemplo-discordjs` é **um objeto** (`{titulo, codigo}`), não uma string:
 * o título é o que a barra do cartão mostra ("Responder com embed e arquivo"),
 * e sem ele o leitor tem de ler o trecho inteiro para saber o que ele faz.
 *
 * A lista existe porque a extensão pode ganhar irmãs (discord.py, curl) sem
 * mexer em quem desenha — mas hoje só `discord.js` é publicada.
 */
function lerExemplos(operacao: Operacao): ExemploDeCodigo[] {
  const bruto = operacao["x-exemplo-discordjs"];
  const codigo = typeof bruto?.codigo === "string" ? bruto.codigo.trim() : "";
  if (!codigo) return [];
  return [{ titulo: typeof bruto?.titulo === "string" && bruto.titulo.trim() ? bruto.titulo : "discord.js", codigo }];
}

export function indexar(doc: DocumentoOpenAPI, servidorPadrao: string): Indice {
  const servidores = (doc.servers ?? [])
    .map((s) => ({ url: urlDoServidor(s), description: s?.description }))
    .filter((s) => s.url);
  const servidor = servidores[0]?.url ?? servidorPadrao;

  const descricaoPorTag = new Map<string, string | undefined>();
  const ordemDasTags: string[] = [];
  for (const tag of doc.tags ?? []) {
    const nome = tag?.name?.trim();
    if (!nome) continue;
    descricaoPorTag.set(nome, tag.description);
    ordemDasTags.push(nome);
  }

  const porTag = new Map<string, RotaIndexada[]>();
  const usados = new Set<string>();

  for (const [caminho, item] of Object.entries(doc.paths ?? {})) {
    if (!item || typeof item !== "object") continue;
    const doCaminho = Array.isArray((item as { parameters?: ParametroOuRef[] }).parameters)
      ? ((item as { parameters?: ParametroOuRef[] }).parameters as ParametroOuRef[])
      : [];

    for (const metodo of METODOS) {
      const bruta = (item as Record<string, unknown>)[metodo];
      if (!bruta || typeof bruta !== "object") continue;
      const operacao = bruta as Operacao;
      const tag = operacao.tags?.[0]?.trim() || SEM_TAG;
      const titulo = operacao.summary?.trim() || `${metodo.toUpperCase()} ${caminho}`;

      // âncora estável: o `operationId` é o que o gerador promete manter entre
      // versões, e é o que faz um link colado no chat continuar valendo
      const base = `${apelido(tag)}/${apelido(operacao.operationId || `${metodo}-${caminho}`)}`;
      let id = base;
      for (let n = 2; usados.has(id); n += 1) id = `${base}-${n}`;
      usados.add(id);

      const permissaoBruta = operacao["x-permissao"];

      const rota: RotaIndexada = {
        id,
        metodo: metodo.toUpperCase(),
        caminho,
        titulo,
        operacao,
        parametros: [...doCaminho, ...(operacao.parameters ?? [])]
          .map((p) => resolverParametro(doc, p))
          .filter((p): p is Parametro => Boolean(p && p.name)),
        respostas: ordenarRespostas(Object.keys(operacao.responses ?? {})).map((codigo) => ({
          codigo,
          resposta: resolverResposta(doc, operacao.responses?.[codigo]),
        })),
        tag,
        permissao: typeof permissaoBruta === "string" && permissaoBruta.trim() ? permissaoBruta : null,
        estado: lerEstado(operacao["x-estado"]),
        obsoleta: operacao.deprecated === true,
        publica: Array.isArray(operacao.security) && operacao.security.length === 0,
        exemplos: lerExemplos(operacao),
      };
      const lista = porTag.get(tag);
      if (lista) lista.push(rota);
      else porTag.set(tag, [rota]);
    }
  }

  // a ordem de `tags` manda (é a que o gerador escolheu); o que não está lá vai
  // depois, na ordem em que apareceu nos caminhos
  const nomesDeTag = [
    ...ordemDasTags.filter((t) => porTag.has(t)),
    ...[...porTag.keys()].filter((t) => !ordemDasTags.includes(t)),
  ];

  const grupos: GrupoDeRotas[] = nomesDeTag.map((nome) => ({
    id: apelido(nome),
    nome,
    descricao: descricaoPorTag.get(nome),
    rotas: porTag.get(nome) ?? [],
  }));

  const esquemas: EsquemaIndexado[] = Object.entries(doc.components?.schemas ?? {})
    .filter(([, esquema]) => esquema && typeof esquema === "object")
    .map(([nome, esquema]) => ({ id: ancoraDoEsquema(nome), nome, esquema }));

  const guias = lerGuias(doc["x-guias"]);
  const permissoes = lerTabelaDePermissoes(doc["x-tabela-permissoes"]);
  const intents = lerIntents(doc["x-intents"]);
  const opcodes = lerOpcodes(doc["x-opcodes"]);
  const eventos = lerEventosDoGateway(doc["x-eventos-gateway"]);
  const fechamentos = lerCodigosDeFechamento(doc["x-codigos-de-fechamento"]);
  const erros = lerCodigosDeErro(doc["x-codigos-de-erro"]);

  return {
    titulo: doc.info?.title?.trim() || "API do Streamz",
    versao: doc.info?.version?.trim() || "v10",
    descricao: doc.info?.description ?? doc.info?.summary,
    servidor,
    servidores,
    grupos,
    esquemas,
    guias,
    permissoes,
    intents,
    opcodes,
    eventos,
    fechamentos,
    erros,
    busca: montarBusca(grupos, esquemas, guias, { intents, opcodes, eventos, fechamentos, erros }),
    totalDeRotas: grupos.reduce((soma, g) => soma + g.rotas.length, 0),
  };
}

/** O que as tabelas dos guias acrescentam à busca, por guia. */
interface TabelasParaBusca {
  intents: IntentDocumentado[];
  opcodes: OpcodeDocumentado[];
  eventos: EventoDoGateway[];
  fechamentos: CodigoDeFechamento[];
  erros: CodigoDeErro[];
}

/**
 * O que a busca acha: rota, esquema, **campo** de esquema e guia. O campo é o
 * que falta na maioria das referências — quem procura `retry_after` não sabe em
 * qual esquema ele mora, que é exatamente a razão de estar procurando.
 *
 * O conteúdo das tabelas entra na chave do guia que as desenha, e não como item
 * próprio: quem digita `4004` ou `INTERACTION_CREATE` quer a seção onde a
 * tabela está, não uma linha solta que não leva a lugar nenhum.
 */
function montarBusca(
  grupos: GrupoDeRotas[],
  esquemas: EsquemaIndexado[],
  guias: Guia[],
  tabelas: TabelasParaBusca,
): ItemDeBusca[] {
  const itens: ItemDeBusca[] = [];

  for (const grupo of grupos) {
    for (const rota of grupo.rotas) {
      itens.push({
        tipo: "rota",
        titulo: rota.titulo,
        detalhe: `${rota.metodo} ${rota.caminho}`,
        ancora: rota.id,
        chave: normalizar(`${rota.titulo} ${rota.metodo} ${rota.caminho} ${rota.operacao.operationId ?? ""} ${grupo.nome}`),
      });
    }
  }

  for (const { nome, id, esquema } of esquemas) {
    itens.push({
      tipo: "esquema",
      titulo: nome,
      detalhe: esquema.description?.split("\n")[0] ?? "Esquema",
      ancora: id,
      chave: normalizar(nome),
    });
    for (const campo of Object.keys(esquema.properties ?? {})) {
      itens.push({
        tipo: "campo",
        titulo: campo,
        detalhe: `Campo de ${nome}`,
        ancora: id,
        chave: normalizar(`${campo} ${nome}`),
      });
    }
  }

  const doGateway = [
    ...tabelas.intents.map((i) => i.nome),
    ...tabelas.opcodes.map((o) => `${o.codigo} ${o.nome}`),
    ...tabelas.eventos.map((e) => e.nome),
    ...tabelas.fechamentos.map((f) => `${f.codigo} ${f.nome}`),
  ].join(" ");

  for (const guia of guias) {
    itens.push({
      tipo: "guia",
      titulo: guia.titulo,
      detalhe: guia.resumo?.replace(/`/g, "") ?? "Guia",
      ancora: guia.id,
      chave: normalizar(
        `${guia.titulo} ${guia.resumo ?? ""} ${guia.conteudo.slice(0, 400)} ${guia.slug === ANCORA_DO_GATEWAY ? doGateway : ""}`,
      ),
    });
  }

  if (tabelas.erros.length) {
    itens.push({
      tipo: "guia",
      titulo: TITULO_DOS_ERROS,
      detalhe: "Os códigos do corpo de erro, e o que cada um quer dizer",
      ancora: ANCORA_DOS_ERROS,
      chave: normalizar(
        `${TITULO_DOS_ERROS} ${tabelas.erros.map((e) => `${e.code} ${e.http} ${e.nome}`).join(" ")}`,
      ),
    });
  }

  return itens;
}

/**
 * O guia cujo `id` na especificação recebe as tabelas do gateway. É uma string
 * literal porque a especificação escolhe o id, e a página só sabe casar com ele
 * — errando o nome, as tabelas somem em vez de aparecer no lugar errado.
 */
export const ANCORA_DO_GATEWAY = "gateway";
export const ANCORA_DAS_PERMISSOES = "permissoes";

/**
 * Os códigos de erro (`x-codigos-de-erro`) não pertencem a guia nenhum: eles
 * valem para **toda** rota, e o guia que mais os cita é o de limitações, que
 * fala de outra coisa. Ganham seção própria, logo depois dos guias e antes da
 * referência, que é onde o leitor bate neles.
 */
export const ANCORA_DOS_ERROS = "guias/codigos-de-erro";
export const TITULO_DOS_ERROS = "Códigos de erro";

/**
 * Filtra e ordena os resultados. Quem começa com o termo vem antes de quem só
 * o contém — procurar `chan` tem de trazer `channel_id` antes de
 * `attachment-channel`, senão a busca parece quebrada.
 */
export function buscar(itens: ItemDeBusca[], termo: string, teto = 40): ItemDeBusca[] {
  const alvo = normalizar(termo.trim());
  if (!alvo) return [];
  const pontos = (item: ItemDeBusca) => {
    const titulo = normalizar(item.titulo);
    if (titulo === alvo) return 0;
    if (titulo.startsWith(alvo)) return 1;
    if (titulo.includes(alvo)) return 2;
    return 3;
  };
  return itens
    .filter((item) => item.chave.includes(alvo))
    .sort((a, b) => pontos(a) - pontos(b) || a.titulo.length - b.titulo.length)
    .slice(0, teto);
}
