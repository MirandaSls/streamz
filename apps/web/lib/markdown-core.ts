/**
 * Markdown do Discord, com a gramática que o cliente dele aceita numa mensagem:
 *
 * - inline: **negrito**, *itálico* ou _itálico_, __sublinhado__, ~~riscado~~,
 *   `código`, ||spoiler||, link automático, `<https://…>` (link sem prévia),
 *   link mascarado `[texto](https://…)`, menções `@usuário`, `<@id>`, `<@!id>`,
 *   `<@&cargo>`, `<#canal>`, carimbo de data `<t:unix>`/`<t:unix:F|R|d|D|t|T|f>`
 *   e emoji personalizado `<:nome:id>`;
 * - blocos: `# ## ###` títulos, `-# ` subtexto, `> ` citação de linha,
 *   `>>> ` citação até o fim da mensagem, listas `- `/`* `/`1. ` com recuo, e
 *   bloco de código cercado por ``` com linguagem.
 *
 * Parser próprio, pequeno e determinístico, para não trazer um markdown
 * completo (tabelas, HTML) que o Discord também não renderiza. Sem HTML: tudo
 * vira elementos React, então não há como injetar marcação.
 *
 * O destaque de sintaxe (`destacarCodigo`) também é daqui e não uma
 * dependência: o projeto não tem highlight.js nem Prism, e o cartão da onda 2
 * proíbe dependência nova. Ele devolve os mesmos nomes de classe do
 * highlight.js (`keyword`, `string`, `title`…) porque é por eles que o CSS do
 * Discord pinta o código (`css-bruto/189423.af2f7f677928e0a3.css`, `.hljs-*`).
 */

export type EstiloDeCarimbo = "t" | "T" | "d" | "D" | "f" | "F" | "R";

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "italic"; c: Inline[] }
  | { t: "underline"; c: Inline[] }
  | { t: "strike"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "spoiler"; c: Inline[] }
  | { t: "link"; href: string }
  /** `[texto](https://…)`: só o texto aparece, na cor de link. */
  | { t: "maskedLink"; href: string; c: Inline[] }
  /** `@username` digitado (o composer do Streamz insere assim). */
  | { t: "mention"; username: string }
  /** `<@id>`/`<@!id>` — a forma do Discord, que é a que bot manda. */
  | { t: "userMention"; userId: string }
  /** menção a cargo: `<@&roleId>` (c-cargos) — o texto guarda o id, não o nome. */
  | { t: "roleMention"; roleId: string }
  /** `<#id>`: pílula com o nome do canal. */
  | { t: "channelMention"; channelId: string }
  /** `<t:unix:estilo>`; `bruto` é o texto original, para o caso de não dar para formatar. */
  | { t: "timestamp"; unix: number; estilo: EstiloDeCarimbo; bruto: string }
  /** emoji personalizado de servidor: `<:nome:id>` (g-emojis-midia). */
  | { t: "emoji"; name: string; id: string };

export interface ItemDeLista {
  c: Inline[];
  /** sublistas (linhas com mais recuo logo abaixo do item). */
  filhos: Block[];
}

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  /** `-# texto`: a linha pequena e apagada do Discord. */
  | { t: "sub"; c: Inline[] }
  /** `> ` (linhas seguidas viram uma citação só) e `>>> ` (até o fim). */
  | { t: "quote"; c: Block[] }
  | { t: "list"; ordenada: boolean; inicio: number; itens: ItemDeLista[] }
  | { t: "codeblock"; lang: string | null; v: string };

const URL_RE = /https?:\/\/[^\s<>"')\]]+/y;
/** `<https://…>`: o Discord mostra o link e não gera prévia. */
const URL_SEM_PREVIA_RE = /<(https?:\/\/[^\s<>]+)>/y;
/**
 * `[texto](url)`, com a url opcionalmente entre `<>`. Só http(s): um
 * `javascript:` mascarado seria clique perigoso com cara de link comum.
 */
const LINK_MASCARADO_RE = /\[((?:\\.|[^\[\]\n\\])+)\]\(\s*<?(https?:\/\/[^\s<>()]+)>?\s*\)/y;
const MENTION_RE = /@([A-Za-z0-9_.-]{3,32})/y;
/** Forma interna do emoji personalizado; o contrato tem a mesma expressão. */
const EMOJI_RE = /<:([a-z0-9_]{2,32}):([A-Za-z0-9_-]{1,64})>/y;
/** Menção a cargo; a mesma expressão que `mentionedRoleIds` do contrato usa. */
const ROLE_MENTION_RE = /<@&([A-Za-z0-9_-]{1,64})>/y;
/** `<@id>` e `<@!id>` (o `!` é a forma antiga de "apelido" que bots ainda mandam). */
const USER_MENTION_RE = /<@!?([A-Za-z0-9_-]{1,64})>/y;
const CHANNEL_MENTION_RE = /<#([A-Za-z0-9_-]{1,64})>/y;
/** Mesma forma do Discord: segundos (podem ser negativos) e um estilo opcional. */
const TIMESTAMP_RE = /<t:(-?\d{1,17})(?::([tTdDfFR]))?>/y;

/** Delimitadores inline, do mais longo para o mais curto (ordem importa). */
const MARKS: {
  open: string;
  t: "bold" | "underline" | "strike" | "spoiler" | "italic";
}[] = [
  { open: "**", t: "bold" },
  { open: "__", t: "underline" },
  { open: "~~", t: "strike" },
  { open: "||", t: "spoiler" },
  { open: "*", t: "italic" },
  { open: "_", t: "italic" },
];

/** Maior data que `Date` representa, em ms (ECMA-262 §21.4.1.1). */
const LIMITE_DE_DATA_MS = 8.64e15;

function casar(re: RegExp, src: string, i: number): RegExpExecArray | null {
  re.lastIndex = i;
  return re.exec(src);
}

/**
 * `links = false` dentro do texto de um link mascarado: um link dentro de
 * outro não tem para onde ir, e o Discord também não aninha.
 */
export function parseInline(src: string, links = true): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  const empurrar = (no: Inline, tamanho: number) => {
    flush();
    out.push(no);
    i += tamanho;
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // escape: \* imprime o asterisco
    if (ch === "\\" && i + 1 < src.length) {
      text += src[i + 1];
      i += 2;
      continue;
    }

    // `código` e ``código com ` dentro``
    if (ch === "`") {
      const cerca = src.startsWith("``", i) ? "``" : "`";
      const end = src.indexOf(cerca, i + cerca.length);
      const v = end < 0 ? "" : src.slice(i + cerca.length, end);
      // "``" vazio não é código: sai como texto, como antes
      if (v.length > 0) {
        empurrar({ t: "code", v: cerca.length === 2 ? v.trim() || v : v }, end + cerca.length - i);
        continue;
      }
    }

    if (ch === "<") {
      let m: RegExpExecArray | null;
      if (links && (m = casar(URL_SEM_PREVIA_RE, src, i))) {
        empurrar({ t: "link", href: m[1] }, m[0].length);
        continue;
      }
      // <@&id> antes de <@id>: o `&` não casa com a menção a usuário, mas a
      // ordem deixa a intenção explícita
      if ((m = casar(ROLE_MENTION_RE, src, i))) {
        empurrar({ t: "roleMention", roleId: m[1] }, m[0].length);
        continue;
      }
      if ((m = casar(USER_MENTION_RE, src, i))) {
        empurrar({ t: "userMention", userId: m[1] }, m[0].length);
        continue;
      }
      if ((m = casar(CHANNEL_MENTION_RE, src, i))) {
        empurrar({ t: "channelMention", channelId: m[1] }, m[0].length);
        continue;
      }
      if ((m = casar(TIMESTAMP_RE, src, i))) {
        const unix = Number(m[1]);
        // fora do alcance de `Date` o Discord deixa o texto cru; aqui também
        if (Number.isFinite(unix) && Math.abs(unix * 1000) <= LIMITE_DE_DATA_MS) {
          const estilo = (m[2] ?? "f") as EstiloDeCarimbo;
          empurrar({ t: "timestamp", unix, estilo, bruto: m[0] }, m[0].length);
          continue;
        }
      }
      // <:nome:id> — emoji personalizado (o cliente troca `:nome:` antes de enviar)
      if ((m = casar(EMOJI_RE, src, i))) {
        empurrar({ t: "emoji", name: m[1], id: m[2] }, m[0].length);
        continue;
      }
    }

    // [texto](https://…)
    if (links && ch === "[") {
      const m = casar(LINK_MASCARADO_RE, src, i);
      if (m) {
        empurrar({ t: "maskedLink", href: m[2], c: parseInline(m[1], false) }, m[0].length);
        continue;
      }
    }

    // link automático
    if (links && ch === "h" && src.startsWith("http", i)) {
      const m = casar(URL_RE, src, i);
      if (m) {
        empurrar({ t: "link", href: m[0] }, m[0].length);
        continue;
      }
    }

    // @menção (no início ou depois de espaço/pontuação)
    if (ch === "@" && (i === 0 || /[\s(["']/.test(src[i - 1]))) {
      const m = casar(MENTION_RE, src, i);
      if (m) {
        empurrar({ t: "mention", username: m[1] }, m[0].length);
        continue;
      }
    }

    // marcas pareadas: **x**, __x__, ~~x~~, ||x||, *x*, _x_
    let matched = false;
    for (const mark of MARKS) {
      if (!src.startsWith(mark.open, i)) continue;
      const start = i + mark.open.length;
      // * e _ só abrem se colados ao conteúdo (evita "2 * 3" virar itálico)
      if (start >= src.length || /\s/.test(src[start])) continue;
      let end = src.indexOf(mark.open, start);
      if (end <= start) continue;
      // "**a *b***": o fechamento é o último par da sequência, para o par de
      // dentro (*b*) continuar inteiro — é como o Discord resolve a ambiguidade
      while (src.startsWith(mark.open, end + 1)) end += 1;
      if (/\s/.test(src[end - 1])) continue;
      flush();
      out.push({ t: mark.t, c: parseInline(src.slice(start, end), links) });
      i = end + mark.open.length;
      matched = true;
      break;
    }
    if (matched) continue;

    text += ch;
    i += 1;
  }
  flush();
  return out;
}

// ── blocos ───────────────────────────────────────────────────

/** `- item`, `* item`, `1. item`, com o recuo em espaços na frente. */
const ITEM_RE = /^( *)(?:([-*])|(\d{1,9})\.) +(\S.*)$/;
/** Nome de linguagem depois da cerca: `ts`, `c++`, `c#`, `objective-c`. */
const LINGUAGEM_RE = /^[A-Za-z0-9_+#.-]{1,32}$/;

interface LinhaDeLista {
  recuo: number;
  ordenada: boolean;
  numero: number;
  texto: string;
}

function montarListas(linhas: LinhaDeLista[]): Block[] {
  const out: Block[] = [];
  let k = 0;
  while (k < linhas.length) {
    const primeira = linhas[k];
    const nivel = primeira.recuo;
    const lista: Extract<Block, { t: "list" }> = {
      t: "list",
      ordenada: primeira.ordenada,
      inicio: primeira.ordenada ? primeira.numero : 1,
      itens: [],
    };
    // trocar de "-" para "1." no mesmo nível começa outra lista, como no Discord
    while (k < linhas.length && linhas[k].recuo <= nivel && linhas[k].ordenada === lista.ordenada) {
      const item = linhas[k++];
      const desde = k;
      while (k < linhas.length && linhas[k].recuo > nivel) k++;
      lista.itens.push({ c: parseInline(item.texto), filhos: montarListas(linhas.slice(desde, k)) });
    }
    out.push(lista);
  }
  return out;
}

/**
 * Bloco cercado por ```. Devolve `null` quando não fecha (vira texto) e o
 * resto da linha de fechamento, se houver texto depois da cerca.
 */
function lerBlocoDeCodigo(
  lines: string[],
  i: number,
): { bloco: Extract<Block, { t: "codeblock" }>; proxima: number; sobra: string } | null {
  const resto = lines[i].slice(3);
  const naMesmaLinha = resto.indexOf("```");
  if (naMesmaLinha >= 0) {
    // ```código``` numa linha só: no Discord a primeira palavra só é
    // linguagem quando vem sozinha antes de uma quebra
    const v = resto.slice(0, naMesmaLinha);
    if (!v.trim()) return null;
    return { bloco: { t: "codeblock", lang: null, v }, proxima: i + 1, sobra: resto.slice(naMesmaLinha + 3) };
  }
  const primeira = resto.trim();
  const lang = primeira && LINGUAGEM_RE.test(primeira) ? primeira : null;
  const buf: string[] = [];
  if (primeira && !lang) buf.push(resto);
  for (let j = i + 1; j < lines.length; j++) {
    const fim = lines[j].indexOf("```");
    if (fim < 0) {
      buf.push(lines[j]);
      continue;
    }
    if (fim > 0) buf.push(lines[j].slice(0, fim));
    return { bloco: { t: "codeblock", lang, v: buf.join("\n") }, proxima: j + 1, sobra: lines[j].slice(fim + 3) };
  }
  return null;
}

function blocosDeLinhas(lines: string[], permiteCitacao: boolean): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lido = lerBlocoDeCodigo(lines, i);
      if (lido) {
        blocks.push(lido.bloco);
        if (lido.sobra.trim()) blocks.push({ t: "p", c: parseInline(lido.sobra) });
        i = lido.proxima;
        continue;
      }
      // sem fechamento: trata como texto
    }

    // Citação não se aninha no Discord: dentro de uma, `>` é texto
    if (permiteCitacao && (line.startsWith(">>> ") || line === ">>>")) {
      blocks.push({ t: "quote", c: blocosDeLinhas([line.slice(4), ...lines.slice(i + 1)], false) });
      break;
    }
    if (permiteCitacao && (line.startsWith("> ") || line === ">")) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        buf.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push({ t: "quote", c: blocosDeLinhas(buf, false) });
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(\S.*)$/);
    if (h) {
      blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, c: parseInline(h[2]) });
      i += 1;
      continue;
    }

    const sub = line.match(/^-#\s+(\S.*)$/);
    if (sub) {
      blocks.push({ t: "sub", c: parseInline(sub[1]) });
      i += 1;
      continue;
    }

    if (ITEM_RE.test(line)) {
      const linhas: LinhaDeLista[] = [];
      let m: RegExpExecArray | null;
      while (i < lines.length && (m = ITEM_RE.exec(lines[i]))) {
        linhas.push({
          recuo: m[1].length,
          ordenada: m[3] !== undefined,
          numero: m[3] !== undefined ? Number(m[3]) : 1,
          texto: m[4],
        });
        i += 1;
      }
      blocks.push(...montarListas(linhas));
      continue;
    }

    blocks.push({ t: "p", c: parseInline(line) });
    i += 1;
  }
  return blocks;
}

export function parseBlocks(src: string): Block[] {
  return blocosDeLinhas(src.replace(/\r\n?/g, "\n").split("\n"), true);
}

// ── carimbo de data <t:…> ────────────────────────────────────

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(tipo: "t" | "T" | "d" | "D" | "dia", fuso: string | undefined): Intl.DateTimeFormat {
  const chave = `${tipo}|${fuso ?? ""}`;
  let f = formatadores.get(chave);
  if (!f) {
    const opcoes: Intl.DateTimeFormatOptions =
      tipo === "t"
        ? { hour: "2-digit", minute: "2-digit" }
        : tipo === "T"
          ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
          : tipo === "d"
            ? { day: "2-digit", month: "2-digit", year: "numeric" }
            : tipo === "D"
              ? { day: "numeric", month: "long", year: "numeric" }
              : { weekday: "long" };
    f = new Intl.DateTimeFormat("pt-BR", { ...opcoes, timeZone: fuso });
    formatadores.set(chave, f);
  }
  return f;
}

const RELATIVO = new Intl.RelativeTimeFormat("pt-BR", { numeric: "always" });

/** Do maior para o menor; o primeiro que cabe inteiro na diferença é o usado. */
const UNIDADES: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400],
  ["month", 30 * 86_400],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

/**
 * Texto de um `<t:unix:estilo>` em pt-BR, no fuso de quem lê — o carimbo
 * existe justamente para cada um ver a data no próprio fuso.
 *
 * - `t` 16:20 · `T` 16:20:30 · `d` 20/04/2021 · `D` 20 de abril de 2021
 * - `f` (padrão) 20 de abril de 2021 16:20
 * - `F` terça-feira, 20 de abril de 2021 16:20
 * - `R` há 2 meses / em 5 minutos
 *
 * `f` e `F` são montados à mão e não com um `Intl` só: dependendo da versão do
 * ICU o pt-BR põe "às" entre data e hora, e o mesmo carimbo sairia diferente
 * no desktop e no navegador.
 *
 * `agora` e `fuso` existem para os testes.
 */
export function formatarCarimbo(
  unix: number,
  estilo: EstiloDeCarimbo,
  agora: number = Date.now(),
  fuso?: string,
): string {
  const data = new Date(unix * 1000);
  switch (estilo) {
    case "t":
    case "T":
    case "d":
    case "D":
      return formatador(estilo, fuso).format(data);
    case "f":
      return `${formatador("D", fuso).format(data)} ${formatador("t", fuso).format(data)}`;
    case "F":
      return `${formatador("dia", fuso).format(data)}, ${formatarCarimbo(unix, "f", agora, fuso)}`;
    case "R": {
      const segundos = Math.trunc((data.getTime() - agora) / 1000);
      const abs = Math.abs(segundos);
      for (const [unidade, tamanho] of UNIDADES) {
        if (abs >= tamanho || unidade === "second") {
          return RELATIVO.format(Math.trunc(segundos / tamanho), unidade);
        }
      }
      return RELATIVO.format(0, "second");
    }
  }
}

/**
 * Quando o texto relativo (`R`) pode mudar: a cada segundo no primeiro minuto,
 * depois a cada 30 s. Devolve ms até a próxima atualização.
 */
export function intervaloDoRelativo(unix: number, agora: number = Date.now()): number {
  return Math.abs(unix * 1000 - agora) < 60_000 ? 1_000 : 30_000;
}

// ── texto puro ───────────────────────────────────────────────

/** Texto puro dos nós (para prévias e testes). */
export function plainText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
        case "code":
          return n.v;
        case "link":
          return n.href;
        case "mention":
          return `@${n.username}`;
        case "userMention":
          return "@usuário";
        case "roleMention":
          return "@cargo";
        case "channelMention":
          return "#canal";
        case "timestamp":
          return formatarCarimbo(n.unix, n.estilo);
        case "emoji":
          return `:${n.name}:`;
        default:
          return plainText(n.c);
      }
    })
    .join("");
}

/**
 * "Jumbo": mensagem feita só de emoji vira emoji grande, como no Discord.
 *
 * Vale para até `MAX_EMOJIS_JUMBO` emojis (personalizados ou unicode) sem
 * nenhum outro texto — com uma frase junto, o emoji volta ao tamanho da linha.
 */
export const MAX_EMOJIS_JUMBO = 27;

/**
 * Casa um emoji unicode com o que costuma vir grudado nele: seletor de variação
 * (U+FE0F), modificador de tom de pele e o juntador ZWJ das sequências de
 * família/profissão. Sem consumir o ZWJ, uma sequência composta deixaria o
 * caractere invisível para trás e a mensagem não seria vista como "só emoji".
 */
const UNICODE_EMOJI_RE = /\p{Extended_Pictographic}(\uFE0F|\p{Emoji_Modifier}|\u200D)*/gu;

/**
 * true quando o texto da mensagem é só emoji (e espaços). Trabalha sobre os
 * blocos já analisados para não repetir o parser — e porque `<:nome:id>` só é
 * emoji depois de reconhecido como token.
 */
export function soEmojis(blocks: Block[]): boolean {
  let total = 0;
  for (const b of blocks) {
    if (b.t !== "p") return false;
    for (const n of b.c) {
      if (n.t === "emoji") {
        total += 1;
        continue;
      }
      if (n.t !== "text") return false;
      const semEmoji = n.v.replace(UNICODE_EMOJI_RE, () => {
        total += 1;
        return "";
      });
      if (semEmoji.trim().length > 0) return false;
    }
  }
  return total > 0 && total <= MAX_EMOJIS_JUMBO;
}

// ── destaque de sintaxe ──────────────────────────────────────

/** Nomes do highlight.js que o CSS do Discord pinta (`.hljs-<tipo>`). */
export type TipoDeTrecho =
  | "keyword"
  | "built_in"
  | "type"
  | "title"
  | "literal"
  | "variable"
  | "attr"
  | "meta"
  | "property"
  | "number"
  | "string"
  | "comment"
  | "name"
  | "addition"
  | "deletion";

export interface TrechoDeCodigo {
  tipo: TipoDeTrecho | null;
  v: string;
}

interface Gramatica {
  comentarioLinha?: string[];
  comentarioBloco?: [string, string][];
  aspas: string[];
  /** `"""` e `'''` (Python). */
  aspasTriplas?: boolean;
  palavras: Set<string>;
  literais?: Set<string>;
  embutidos?: Set<string>;
  /** SQL: `SELECT` e `select` são a mesma palavra. */
  semCaixa?: boolean;
  /** Identificador com inicial maiúscula é tipo (TS, Java, Rust…). */
  tipoMaiusculo?: boolean;
  /** `@decorador` (Python, TS, Java). */
  decorador?: boolean;
  /** `$VAR` (shell, PHP). */
  cifrao?: boolean;
  /** Chave antes de `:` vira atributo (JSON, YAML); em CSS só dentro de `{}`. */
  chaves?: "sempre" | "dentroDeChaves";
  /** `#fff` de CSS é número. */
  hexCss?: boolean;
  /** Palavras depois das quais o identificador é nome de função/classe. */
  antesDeTitulo?: Set<string>;
}

const conjunto = (s: string) => new Set(s.split(" "));

const LITERAIS_C = conjunto("true false null undefined NaN Infinity nil None True False");

const C_LIKE: Gramatica = {
  comentarioLinha: ["//"],
  comentarioBloco: [["/*", "*/"]],
  aspas: ['"', "'", "`"],
  palavras: conjunto(
    "abstract as async await break case catch class const continue debugger declare default delete do else enum export extends final finally fn for from func function get go if impl implements import in instanceof interface let match mod move mut namespace new of override package private protected pub public readonly return set static struct super switch this throw throws trait try type typeof use var void where while with yield chan defer fallthrough goto map range select crate dyn loop ref self Self unsafe val when object fun lateinit data sealed open internal is",
  ),
  literais: LITERAIS_C,
  embutidos: conjunto(
    "console window document process require module Math JSON Promise Array Object String Number Boolean Map Set Date Error println print fmt len make append string int float bool byte rune i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 usize isize char double long short void unsigned signed any never unknown number boolean symbol bigint",
  ),
  tipoMaiusculo: true,
  decorador: true,
  antesDeTitulo: conjunto("function class fn func interface type struct enum trait impl new fun"),
};

const PYTHON: Gramatica = {
  comentarioLinha: ["#"],
  aspas: ['"', "'"],
  aspasTriplas: true,
  palavras: conjunto(
    "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case",
  ),
  literais: conjunto("True False None"),
  embutidos: conjunto(
    "print len range int str float list dict set tuple bool open super isinstance enumerate zip map filter sorted sum min max abs type object self cls",
  ),
  tipoMaiusculo: true,
  decorador: true,
  antesDeTitulo: conjunto("def class"),
};

const SHELL: Gramatica = {
  comentarioLinha: ["#"],
  aspas: ['"', "'"],
  palavras: conjunto("if then else elif fi for while until do done case esac in function select return break continue local export"),
  embutidos: conjunto("echo cd ls cat grep sed awk rm cp mv mkdir chmod chown sudo apt npm pnpm yarn node git docker curl wget source exit read printf test set unset"),
  literais: conjunto("true false"),
  cifrao: true,
};

const JSON_G: Gramatica = {
  aspas: ['"'],
  palavras: new Set(),
  literais: conjunto("true false null"),
  chaves: "sempre",
};

const YAML: Gramatica = {
  comentarioLinha: ["#"],
  aspas: ['"', "'"],
  palavras: new Set(),
  literais: conjunto("true false null yes no on off ~"),
  chaves: "sempre",
};

const CSS: Gramatica = {
  comentarioBloco: [["/*", "*/"]],
  aspas: ['"', "'"],
  palavras: conjunto("important media import supports keyframes from to and not only screen"),
  chaves: "dentroDeChaves",
  hexCss: true,
};

const SQL: Gramatica = {
  comentarioLinha: ["--"],
  comentarioBloco: [["/*", "*/"]],
  aspas: ["'", '"'],
  palavras: conjunto(
    "select from where insert into values update set delete create table alter drop index view join inner left right outer full on as and or not in is like between order by group having limit offset distinct union all primary key foreign references default unique check constraint if exists returning case when then else end begin commit rollback with asc desc",
  ),
  literais: conjunto("null true false"),
  embutidos: conjunto("count sum avg min max now coalesce int integer bigint text varchar char boolean date timestamp serial uuid json jsonb"),
  semCaixa: true,
};

const LUA: Gramatica = {
  comentarioLinha: ["--"],
  aspas: ['"', "'"],
  palavras: conjunto("and break do else elseif end for function goto if in local not or repeat return then until while"),
  literais: conjunto("nil true false"),
  embutidos: conjunto("print pairs ipairs require table string math tostring tonumber type"),
  antesDeTitulo: conjunto("function"),
};

/** Linguagens reconhecidas pela cerca (```ts). O resto sai sem cor, como no Discord. */
const GRAMATICAS: Record<string, Gramatica | "diff" | "html"> = {
  js: C_LIKE, javascript: C_LIKE, jsx: C_LIKE, mjs: C_LIKE, cjs: C_LIKE,
  ts: C_LIKE, typescript: C_LIKE, tsx: C_LIKE,
  java: C_LIKE, kotlin: C_LIKE, kt: C_LIKE, scala: C_LIKE, swift: C_LIKE, dart: C_LIKE,
  c: C_LIKE, h: C_LIKE, cpp: C_LIKE, "c++": C_LIKE, cc: C_LIKE, hpp: C_LIKE,
  cs: C_LIKE, csharp: C_LIKE, "c#": C_LIKE,
  go: C_LIKE, golang: C_LIKE, rust: C_LIKE, rs: C_LIKE, php: { ...C_LIKE, cifrao: true },
  py: PYTHON, python: PYTHON,
  sh: SHELL, bash: SHELL, shell: SHELL, zsh: SHELL, console: SHELL, ps1: SHELL, powershell: SHELL,
  json: JSON_G, jsonc: { ...JSON_G, comentarioLinha: ["//"] },
  yaml: YAML, yml: YAML, toml: { ...YAML, chaves: undefined },
  css: CSS, scss: { ...CSS, comentarioLinha: ["//"], cifrao: true }, less: CSS,
  sql: SQL, lua: LUA,
  diff: "diff", patch: "diff",
  html: "html", xml: "html", svg: "html", vue: "html",
};

const IDENT_RE = /[A-Za-z_][\w]*/y;
const NUMERO_RE = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;
const HEX_CSS_RE = /#[0-9a-fA-F]{3,8}\b/y;
/** `${HOME}` do shell. */
const VARIAVEL_ENTRE_CHAVES_RE = /\{[^}\n]*\}/y;

function proximoNaoEspaco(src: string, j: number): string {
  while (j < src.length && (src[j] === " " || src[j] === "\t")) j++;
  return src[j] ?? "";
}

class Acumulador {
  readonly out: TrechoDeCodigo[] = [];
  private texto = "";
  soltar(v: string) {
    this.texto += v;
  }
  marcar(tipo: TipoDeTrecho | null, v: string) {
    if (!v) return;
    if (tipo === null) {
      this.texto += v;
      return;
    }
    if (this.texto) this.out.push({ tipo: null, v: this.texto });
    this.texto = "";
    this.out.push({ tipo, v });
  }
  fim(): TrechoDeCodigo[] {
    if (this.texto) this.out.push({ tipo: null, v: this.texto });
    this.texto = "";
    return this.out;
  }
}

function destacarGenerico(src: string, g: Gramatica): TrechoDeCodigo[] {
  const acc = new Acumulador();
  let i = 0;
  let profundidade = 0;
  let anterior = "";
  while (i < src.length) {
    const ch = src[i];

    const linha = g.comentarioLinha?.find((p) => src.startsWith(p, i));
    // `#` de CSS/SCSS e de shell só é comentário no começo ou depois de espaço
    if (linha && (linha !== "#" || i === 0 || /\s/.test(src[i - 1]))) {
      let fim = src.indexOf("\n", i);
      if (fim < 0) fim = src.length;
      acc.marcar("comment", src.slice(i, fim));
      i = fim;
      continue;
    }
    const bloco = g.comentarioBloco?.find(([a]) => src.startsWith(a, i));
    if (bloco) {
      const fim = src.indexOf(bloco[1], i + bloco[0].length);
      const ate = fim < 0 ? src.length : fim + bloco[1].length;
      acc.marcar("comment", src.slice(i, ate));
      i = ate;
      continue;
    }

    if (g.aspas.includes(ch)) {
      const cerca = g.aspasTriplas && src.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch;
      let j = i + cerca.length;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src.startsWith(cerca, j)) {
          j += cerca.length;
          break;
        }
        // aspas simples não atravessam linha; crase (template) e tripla sim
        if (cerca.length === 1 && ch !== "`" && src[j] === "\n") break;
        j++;
      }
      j = Math.min(j, src.length);
      const ehChave =
        (g.chaves === "sempre" || (g.chaves === "dentroDeChaves" && profundidade > 0)) &&
        proximoNaoEspaco(src, j) === ":";
      acc.marcar(ehChave ? "attr" : "string", src.slice(i, j));
      i = j;
      continue;
    }

    if (g.hexCss && ch === "#") {
      const m = casar(HEX_CSS_RE, src, i);
      if (m && profundidade > 0) {
        acc.marcar("number", m[0]);
        i += m[0].length;
        continue;
      }
    }

    if (/[0-9]/.test(ch) && !/[\w$]/.test(src[i - 1] ?? "")) {
      const m = casar(NUMERO_RE, src, i);
      if (m) {
        acc.marcar("number", m[0]);
        i += m[0].length;
        continue;
      }
    }

    if (g.cifrao && ch === "$") {
      const m = casar(IDENT_RE, src, i + 1) ?? casar(VARIAVEL_ENTRE_CHAVES_RE, src, i + 1);
      if (m) {
        acc.marcar("variable", "$" + m[0]);
        i += 1 + m[0].length;
        continue;
      }
    }

    if (g.decorador && ch === "@" && !/[\w]/.test(src[i - 1] ?? "")) {
      const m = casar(IDENT_RE, src, i + 1);
      if (m) {
        acc.marcar("meta", "@" + m[0]);
        i += 1 + m[0].length;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(ch) && !/[\w$]/.test(src[i - 1] ?? "")) {
      const m = casar(IDENT_RE, src, i);
      if (m) {
        const palavra = m[0];
        const chave = g.semCaixa ? palavra.toLowerCase() : palavra;
        const depois = proximoNaoEspaco(src, i + palavra.length);
        let tipo: TipoDeTrecho | null = null;
        if (g.palavras.has(chave)) tipo = "keyword";
        else if (g.literais?.has(chave)) tipo = "literal";
        else if (g.antesDeTitulo?.has(anterior)) tipo = "title";
        else if (
          (g.chaves === "sempre" || (g.chaves === "dentroDeChaves" && profundidade > 0)) &&
          depois === ":"
        )
          tipo = "attr";
        else if (g.embutidos?.has(chave)) tipo = "built_in";
        else if (depois === "(" && !g.chaves) tipo = "title";
        else if (g.tipoMaiusculo && /^[A-Z]/.test(palavra) && /[a-z]/.test(palavra)) tipo = "type";
        acc.marcar(tipo, palavra);
        anterior = chave;
        i += palavra.length;
        continue;
      }
    }

    if (ch === "{") profundidade += 1;
    else if (ch === "}") profundidade = Math.max(0, profundidade - 1);
    if (!/\s/.test(ch)) anterior = ch;
    acc.soltar(ch);
    i += 1;
  }
  return acc.fim();
}

function destacarDiff(src: string): TrechoDeCodigo[] {
  const acc = new Acumulador();
  const linhas = src.split("\n");
  linhas.forEach((linha, k) => {
    const quebra = k < linhas.length - 1 ? "\n" : "";
    const tipo: TipoDeTrecho | null = linha.startsWith("+")
      ? "addition"
      : linha.startsWith("-")
        ? "deletion"
        : linha.startsWith("@@")
          ? "meta"
          : null;
    acc.marcar(tipo, linha + quebra);
  });
  return acc.fim();
}

const TAG_RE = /<\/?([A-Za-z][\w:.-]*)/y;
const ATRIBUTO_RE = /([A-Za-z_:][\w:.-]*)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s>"']+)?/y;

function destacarHtml(src: string): TrechoDeCodigo[] {
  const acc = new Acumulador();
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("<!--", i)) {
      const fim = src.indexOf("-->", i + 4);
      const ate = fim < 0 ? src.length : fim + 3;
      acc.marcar("comment", src.slice(i, ate));
      i = ate;
      continue;
    }
    const tag = src[i] === "<" ? casar(TAG_RE, src, i) : null;
    if (!tag) {
      acc.soltar(src[i]);
      i += 1;
      continue;
    }
    acc.soltar(tag[0].slice(0, tag[0].length - tag[1].length));
    acc.marcar("name", tag[1]);
    i += tag[0].length;
    // atributos até o `>`
    while (i < src.length && src[i] !== ">") {
      if (/\s|\//.test(src[i])) {
        acc.soltar(src[i]);
        i += 1;
        continue;
      }
      const a = casar(ATRIBUTO_RE, src, i);
      if (!a || a[0].length === 0) {
        acc.soltar(src[i]);
        i += 1;
        continue;
      }
      acc.marcar("attr", a[1]);
      if (a[2]) acc.soltar(a[2]);
      if (a[3]) acc.marcar("string", a[3]);
      i += a[0].length;
    }
  }
  return acc.fim();
}

/**
 * Trechos coloridos de um bloco de código, ou `null` quando a linguagem não é
 * reconhecida — o Discord também só pinta o que o highlight.js conhece, e
 * código sem linguagem sai numa cor só.
 *
 * É uma aproximação por léxico (comentário, string, número, palavra-chave,
 * nome de função, tipo, chave), não uma gramática completa: é o que dá para
 * ter sem trazer o highlight.js, e cobre o que aparece em conversa.
 */
export function destacarCodigo(codigo: string, lang: string | null): TrechoDeCodigo[] | null {
  if (!lang) return null;
  const g = GRAMATICAS[lang.toLowerCase()];
  if (!g) return null;
  if (g === "diff") return destacarDiff(codigo);
  if (g === "html") return destacarHtml(codigo);
  return destacarGenerico(codigo, g);
}
