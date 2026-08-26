/**
 * Markdown do Discord, o subconjunto que aparece nas mensagens:
 * **negrito**, *itálico*, __sublinhado__, ~~riscado~~, `código`, ```bloco```,
 * ||spoiler||, > citação, # títulos, links automáticos, menções @usuário e
 * emoji personalizado `<:nome:id>`.
 *
 * Parser próprio, pequeno e determinístico, para não trazer um markdown
 * completo (tabelas, HTML) que o Discord também não renderiza. Sem HTML: tudo
 * vira elementos React, então não há como injetar marcação.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "italic"; c: Inline[] }
  | { t: "underline"; c: Inline[] }
  | { t: "strike"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "spoiler"; c: Inline[] }
  | { t: "link"; href: string }
  | { t: "mention"; username: string }
  /** emoji personalizado de servidor: `<:nome:id>` (g-emojis-midia). */
  | { t: "emoji"; name: string; id: string };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "quote"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "codeblock"; lang: string | null; v: string };

const URL_RE = /https?:\/\/[^\s<>"')\]]+/y;
const MENTION_RE = /@([A-Za-z0-9_.-]{3,32})/y;
/** Forma interna do emoji personalizado; o contrato tem a mesma expressão. */
const EMOJI_RE = /<:([a-z0-9_]{2,32}):([A-Za-z0-9_-]{1,64})>/y;

/** Delimitadores inline, do mais longo para o mais curto (ordem importa). */
const MARKS: {
  open: string;
  t: Exclude<Inline, { t: "text" | "code" | "link" | "mention" | "emoji" }>["t"];
}[] = [
  { open: "**", t: "bold" },
  { open: "__", t: "underline" },
  { open: "~~", t: "strike" },
  { open: "||", t: "spoiler" },
  { open: "*", t: "italic" },
  { open: "_", t: "italic" },
];

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
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

    // `código`
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // link automático
    if (ch === "h" && src.startsWith("http", i)) {
      URL_RE.lastIndex = i;
      const m = URL_RE.exec(src);
      if (m) {
        flush();
        out.push({ t: "link", href: m[0] });
        i += m[0].length;
        continue;
      }
    }

    // <:nome:id> — emoji personalizado (o cliente troca `:nome:` antes de enviar)
    if (ch === "<") {
      EMOJI_RE.lastIndex = i;
      const m = EMOJI_RE.exec(src);
      if (m) {
        flush();
        out.push({ t: "emoji", name: m[1], id: m[2] });
        i += m[0].length;
        continue;
      }
    }

    // @menção (no início ou depois de espaço/pontuação)
    if (ch === "@" && (i === 0 || /[\s(["']/.test(src[i - 1]))) {
      MENTION_RE.lastIndex = i;
      const m = MENTION_RE.exec(src);
      if (m) {
        flush();
        out.push({ t: "mention", username: m[1] });
        i += m[0].length;
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
      out.push({ t: mark.t, c: parseInline(src.slice(start, end)) });
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

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ```lang ... ```
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || null;
      const buf: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("```")) buf.push(lines[j++]);
      if (j < lines.length) {
        blocks.push({ t: "codeblock", lang, v: buf.join("\n") });
        i = j + 1;
        continue;
      }
      // sem fechamento: trata como texto
    }

    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, c: parseInline(h[2]) });
      i += 1;
      continue;
    }

    if (line.startsWith("> ") || line === ">") {
      blocks.push({ t: "quote", c: parseInline(line.slice(2)) });
      i += 1;
      continue;
    }

    blocks.push({ t: "p", c: parseInline(line) });
    i += 1;
  }
  return blocks;
}

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
