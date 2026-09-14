#!/usr/bin/env node
/**
 * Gera os tokens de cor e sombra do app a partir das variáveis do Discord
 * (ADR-0009). É a única origem de cor do `apps/web`: nenhum hex é escrito à mão
 * — faltando um valor, ele sai daqui.
 *
 *   node scripts/paridade/gerar-tokens.mjs [--refs <dir de tokens>]
 *
 * `--refs` aponta para `docs/referencias-discord/tokens` (padrão: o do próprio
 * repositório). As worktrees de trabalho não têm as referências (sparse-checkout),
 * então ali passe o caminho da worktree de referências.
 *
 * Saídas (todas commitadas, todas com o aviso "gerado"):
 *   apps/web/app/tokens.css          variáveis por tema (`:root` = Dark; Ash e Onyx
 *                                    por `data-tema` no <html>, só o que difere)
 *   apps/web/tokens.gerados.ts       mapa nome → cor para o tailwind.config.ts
 *   scripts/paridade/tokens-de-marca.json   o que o limão substituiu, para revisão
 *
 * Três regras da ADR-0009, item 3, que este arquivo aplica e ninguém mais:
 *   1. Cor da família blurple (matiz 224–238°, saturação ≥ 40%) vira o passo
 *      equivalente da escala do limão — por origem do valor, não por nome.
 *   2. Texto e ícone desenhados SOBRE a cor de marca viram `accent-ink`.
 *   3. Onde o blurple é conteúdo (ANSI), ele fica como no Discord.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const REFS = resolve(
  args.includes("--refs") ? args[args.indexOf("--refs") + 1] : join(RAIZ, "docs/referencias-discord/tokens"),
);

// ── marca (os únicos valores nossos) ─────────────────────────────────────────
const LIMAO = "#9be31f";
const ACCENT_INK = "#0b0b0f";

/**
 * Temas: o nome do app (`stores/settings.ts#Tema`), a coluna de
 * `variaveis-resolvidas.json` e o seletor em que ela sai (onda 9).
 *
 * O Dark é o `:root` e vem **primeiro**: é a base. Ash e Onyx saem num bloco
 * por `data-tema` no <html> (escrito antes da primeira pintura pelo script de
 * `app/layout.tsx`) com **só** as variáveis cujo valor difere do Dark — o que
 * não aparece no bloco herda o `:root`. As colunas são as de `VARIAVEIS.md`:
 * `cinza` = `theme-dark` (Ash), `onyx` = `theme-dark theme-midnight` (Onyx).
 * O Light (`claro`) fica fora: o limão só vai sobre escuro, e um accent para
 * fundo claro é outra ADR.
 */
const TEMAS = [
  { nome: "dark", coluna: "escuro", seletor: ":root" },
  { nome: "ash", coluna: "cinza", seletor: ':root[data-tema="ash"]' },
  { nome: "onyx", coluna: "onyx", seletor: ':root[data-tema="onyx"]' },
];

/**
 * Famílias que não entram: gráficos, Nitro, missões, perfis com gradiente, a
 * paleta crua (os semânticos já vêm resolvidos) e o que o Discord marca como
 * legado. O `brand` sai também — no lugar dele vai a escala do limão.
 */
const PREFIXOS_FORA = [
  "chart", "expressive", "nitro", "premium", "quest", "creator", "steam",
  "legacy", "android", "plum", "primary", "yellow", "green", "teal", "blue",
  "orange", "red", "brand", "blurple", "opacity", "white", "black", "bg",
  "custom", "logo", "theme", "brightness", "contrast", "experimental",
];
/**
 * Fora dos prefixos acima, estes entram assim mesmo. São da paleta crua (não
 * dependem de tema), mas o próprio Discord os usa direto em componente:
 * - `--white`/`--black`: texto sobre cor, fundo de mídia, QR code;
 * - `--primary-*`: o cinza das dicas (`tooltipGrey`) e de ícone sobre imagem;
 *   o `--primary-600` é a amostra do Ash em Aparência > Temas padrão
 *   (`.darkIcon__36dee`);
 * - `--plum-20`: a amostra do Dark na mesma grade (`.darkerIcon__36dee`) — as
 *   amostras são da paleta crua de propósito: iguais em qualquer tema ativo;
 * - `--green-360`: a dica verde;
 * - `--opacity-black-*`/`--opacity-white-*`: preto e branco com alfa, que é como
 *   o Discord faz véu de vídeo, capa de botão sobre mídia e máscara de recorte —
 *   o `--background-scrim` tem alfa fixo de 72% e não serve para isso.
 */
const EXTRAS = [
  /^--(white|black)$/,
  /^--primary-(230|330|600|700)$/,
  /^--plum-20$/,
  /^--green-360$/,
  /^--opacity-(black|white)-\d+$/,
];

/**
 * O que o Discord não tem e o app precisa. Cada um aponta para um token dele:
 * é apelido com papel próprio, não cor nova.
 */
const NOSSOS = {
  // cor do cargo sem cor (`Role.color` nulo) — o cinza do que não tem cor própria
  "--role-default": "--channels-default",
};

/** Blurple que é conteúdo e não marca (regra 3). */
const CONTEUDO_AZUL = [/^--ansi-/];
/**
 * Regra 2: texto/ícone sobre fundo de marca. Branco sobre limão dá 1,57:1.
 * O polegar do switch continua branco (é peça, não texto — como no Discord), mas
 * o ícone de dentro dele, que no Discord é blurple sobre branco, vira escuro:
 * limão sobre branco quebra a regra "limão só sobre escuro".
 */
const SOBRE_A_MARCA = [
  /^--control-primary-(text|icon)-/,
  /^--badge-text-brand$/,
  /^--checkbox-icon-active$/,
  /^--radio-thumb-background-active$/,
  /^--switch-thumb-icon-active$/,
];

// ── cor: hex ⇄ sRGB ⇄ OKLab/OKLCH (Björn Ottosson) ──────────────────────────
function hexParaRgba(hex) {
  const h = hex.replace("#", "");
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0) / 255, g: n(2) / 255, b: n(4) / 255, a: h.length === 8 ? n(6) / 255 : 1 };
}
const lin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const gam = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);
function rgbParaOklch({ r, g, b }) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, Bb), h: Math.atan2(Bb, A) };
}
function oklchParaLinear({ L, C, h }) {
  const A = C * Math.cos(h);
  const Bb = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * Bb) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
/** Corta o croma até caber no sRGB — o matiz e a luminosidade não mudam. */
function oklchParaRgb(c) {
  const dentro = (x) => x.every((u) => u >= -1e-6 && u <= 1 + 1e-6);
  let lo = 0;
  let hi = c.C;
  if (!dentro(oklchParaLinear(c))) {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (dentro(oklchParaLinear({ ...c, C: mid }))) lo = mid;
      else hi = mid;
    }
    c = { ...c, C: lo };
  }
  const [r, g, b] = oklchParaLinear(c).map((u) => Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, u))))));
  return { r, g, b };
}
const b2 = (u) => Math.round(u * 255).toString(16).padStart(2, "0");
const rgbaParaHex = ({ r, g, b, a = 1 }) => `#${b2(r)}${b2(g)}${b2(b)}${a < 1 ? b2(a) : ""}`;

function hsl({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
const ehBlurple = (rgba) => {
  const { h, s } = hsl(rgba);
  return h >= 224 && h <= 238 && s >= 0.4;
};
function contraste(a, b) {
  const Y = ({ r, g, b: bb }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bb);
  const [x, y] = [Y(hexParaRgba(a)), Y(hexParaRgba(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ── entrada ──────────────────────────────────────────────────────────────────
const cru = JSON.parse(readFileSync(join(REFS, "variaveis.json"), "utf8"));
const resolvidas = JSON.parse(readFileSync(join(REFS, "variaveis-resolvidas.json"), "utf8"));

/** Os tokens que dependem de tema: os definidos nos escopos do Dark e da refresh. */
const nomesDeTema = new Set();
for (const [escopo, vars] of Object.entries(cru)) {
  const ehTema = /theme-dark|theme-darker/.test(escopo) || escopo === ".visual-refresh";
  if (!ehTema || /high-contrast|custom/.test(escopo)) continue;
  for (const nome of Object.keys(vars)) if (!nome.endsWith("-hsl")) nomesDeTema.add(nome);
}

// ── a escala do limão (regra 1, ADR-0009 item 3.4) ───────────────────────────
const escuro = resolvidas.valores.escuro;
const PASSOS = Object.keys(escuro)
  .filter((n) => /^--brand-\d+$/.test(n))
  .sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
const brand = Object.fromEntries(PASSOS.map((n) => [n, rgbParaOklch(hexParaRgba(escuro[n].cor))]));
const B500 = brand["--brand-500"];
const LMAX = Math.max(...Object.values(brand).map((c) => c.L));
const LMIN = Math.min(...Object.values(brand).map((c) => c.L));
const LIM = rgbParaOklch(hexParaRgba(LIMAO));

/**
 * Leva uma cor da família blurple para o limão: guarda a posição relativa de
 * luminosidade entre o 500 e o extremo da escala (clara ou escura), e o croma
 * proporcional ao do 500. O matiz é o do limão. O alfa é o da cor original.
 */
function paraOLimao(hex) {
  const rgba = hexParaRgba(hex);
  const c = rgbParaOklch(rgba);
  const L =
    c.L >= B500.L
      ? LIM.L + ((c.L - B500.L) / (LMAX - B500.L)) * (Math.max(LMAX, LIM.L) - LIM.L)
      : LIM.L - ((B500.L - c.L) / (B500.L - LMIN)) * (LIM.L - LMIN);
  const C = LIM.C * Math.min(1.2, c.C / B500.C);
  return rgbaParaHex({ ...oklchParaRgb({ L, C, h: LIM.h }), a: rgba.a });
}

// ── geração por tema ─────────────────────────────────────────────────────────
const ehFora = (nome) => PREFIXOS_FORA.includes(nome.slice(2).split("-")[0]);
const ehSombra = (nome) => /^--(shadow|elevation)-/.test(nome) && !nome.endsWith("-filter");

/** O que a regra da marca trocou, por tema (`dark`, `ash`, `onyx`). */
const trocasPorTema = {};
/** Cor final de cada token, por tema: é daqui que sai o relatório de contraste. */
const coresPorTema = {};
const semValor = [];
const blocos = [];
let cores = [];
let sombras = [];
/** Declarações do Dark, `variável → valor`: os outros temas só escrevem o que difere. */
const doDark = new Map();

for (const { nome: tema, coluna, seletor } of TEMAS) {
  const ehDark = seletor === ":root";
  const vals = resolvidas.valores[coluna];
  const trocasDeMarca = (trocasPorTema[tema] = []);
  const coresTema = [];
  const sombrasTema = [];

  // a escala do limão, com os nomes do Discord
  for (const n of PASSOS) {
    const hex = n === "--brand-500" ? LIMAO : paraOLimao(vals[n].cor);
    coresTema.push([n, hex]);
  }

  const extras = Object.keys(vals).filter((n) => EXTRAS.some((re) => re.test(n)));
  for (const nome of [...new Set([...nomesDeTema, ...extras])].sort()) {
    if (ehFora(nome) && !EXTRAS.some((re) => re.test(nome))) continue;
    const v = vals[nome];
    if (!v) {
      if (ehDark) semValor.push(nome);
      continue;
    }
    if (ehSombra(nome)) {
      // `hsl(none …)` e `calc(1*x%)` (o fator de saturação do Discord) são CSS
      // válido, mas WebView antigo de Android não entende o `none`.
      const valor = v.valor.replace(/hsl\(none /g, "hsl(0 ").replace(/calc\(1\*([\d.]+%)\)/g, "$1");
      sombrasTema.push([nome, valor]);
      continue;
    }
    if (!v.cor) continue; // não é cor nem sombra: tamanho, fonte, gradiente
    let hex = v.cor.toLowerCase();
    if (SOBRE_A_MARCA.some((re) => re.test(nome))) {
      trocasDeMarca.push({ nome, regra: "sobre a marca", discord: hex, streamz: ACCENT_INK });
      hex = ACCENT_INK;
    } else if (ehBlurple(hexParaRgba(hex)) && !CONTEUDO_AZUL.some((re) => re.test(nome))) {
      const novo = paraOLimao(hex);
      trocasDeMarca.push({ nome, regra: "família blurple", discord: hex, streamz: novo });
      hex = novo;
    }
    coresTema.push([nome, hex]);
  }

  for (const [nosso, alvo] of Object.entries(NOSSOS)) {
    const base = coresTema.find(([n]) => n === alvo);
    if (base) coresTema.push([nosso, base[1]]);
  }

  const decls = [];
  for (const [nome, hex] of coresTema) {
    const { r, g, b, a } = hexParaRgba(hex);
    decls.push([nome, hex]);
    decls.push([`${nome}-rgb`, `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`]);
    decls.push([`${nome}-a`, `${+a.toFixed(4)}`]);
  }
  for (const [nome, valor] of sombrasTema) decls.push([nome, valor]);
  if (ehDark) for (const [nome, valor] of decls) doDark.set(nome, valor);
  // Ash/Onyx: só o que difere do Dark, e só variável que o Dark tem — nome novo
  // aqui ficaria fora do `tokens.gerados.ts`, que sai do Dark
  const linhas = decls
    .filter(([nome, valor]) => ehDark || (doDark.has(nome) && doDark.get(nome) !== valor))
    .map(([nome, valor]) => `  ${nome}: ${valor};`);
  blocos.push(`${seletor} {\n${linhas.join("\n")}\n}`);
  coresPorTema[tema] = Object.fromEntries(coresTema);
  if (ehDark) {
    cores = coresTema.map(([n]) => n);
    sombras = sombrasTema.map(([n]) => n);
  }
}

// ── saídas ───────────────────────────────────────────────────────────────────
const AVISO = `Gerado por scripts/paridade/gerar-tokens.mjs a partir de
 * docs/referencias-discord/tokens/variaveis-resolvidas.json (Discord, 2026-09-11).
 * NÃO EDITE À MÃO: mude o gerador e rode de novo. ADR-0009.`;

writeFileSync(
  join(RAIZ, "apps/web/app/tokens.css"),
  `/*\n * ${AVISO}\n *\n * Cada cor sai em três variáveis: o hex, os canais (\`-rgb\`) e o alfa (\`-a\`).\n * As duas últimas existem para o modificador de opacidade do Tailwind\n * (\`bg-x/20\`) multiplicar o alfa que o token do Discord já tem.\n *\n * \`:root\` é o tema Dark. Ash e Onyx (\`data-tema\` no <html>) sobrescrevem só\n * as variáveis cujo valor muda; o resto herda o Dark.\n */\n${blocos.join("\n\n")}\n`,
);

const chave = (n) => n.slice(2);
const ts = [
  `/**\n * ${AVISO}\n *\n * Nome da classe = utilitário + nome do token do Discord sem o \`--\`:\n * \`bg-background-base-lower\`, \`text-text-muted\`, \`border-border-subtle\`.\n */`,
  "",
  "/** Cor que aceita o modificador de opacidade do Tailwind sobre o alfa do próprio token. */",
  "const cor = (n: string) => `rgb(var(--${n}-rgb) / calc(var(--${n}-a) * <alpha-value>))`;",
  "",
  "export const coresDoDiscord: Record<string, string> = {",
  ...cores.map((n) => `  "${chave(n)}": cor("${chave(n)}"),`),
  "};",
  "",
  "export const sombrasDoDiscord: Record<string, string> = {",
  ...sombras.map((n) => `  "${chave(n)}": "var(${n})",`),
  "};",
  "",
];
writeFileSync(join(RAIZ, "apps/web/tokens.gerados.ts"), ts.join("\n"));

mkdirSync(join(RAIZ, "scripts/paridade"), { recursive: true });
writeFileSync(
  join(RAIZ, "scripts/paridade/tokens-de-marca.json"),
  JSON.stringify(
    {
      aviso:
        "Gerado por gerar-tokens.mjs. O que a regra da ADR-0009 (item 3) trocou: `trocas` no tema Dark; `trocasPorTema`, só as trocas de Ash e Onyx que diferem das do Dark.",
      limao: LIMAO,
      accentInk: ACCENT_INK,
      escala: Object.fromEntries(PASSOS.map((n) => [n, n === "--brand-500" ? LIMAO : paraOLimao(escuro[n].cor)])),
      trocas: trocasPorTema.dark,
      trocasPorTema: Object.fromEntries(
        TEMAS.filter((t) => t.seletor !== ":root").map((t) => [
          t.nome,
          trocasPorTema[t.nome].filter((x) => {
            const d = trocasPorTema.dark.find((y) => y.nome === x.nome);
            return !d || d.discord !== x.discord || d.streamz !== x.streamz;
          }),
        ]),
      ),
    },
    null,
    2,
  ) + "\n",
);

// ── relatório ────────────────────────────────────────────────────────────────
console.log(`tokens de tema: ${nomesDeTema.size}; cores emitidas: ${cores.length}; sombras: ${sombras.length}`);
console.log(
  `trocas pela marca (Dark): ${trocasPorTema.dark.length}; sem valor no Dark (pulados): ${semValor.length}; ` +
    `variáveis sobrescritas: ${blocos.slice(1).map((b, i) => `${TEMAS[i + 1].nome} ${b.split("\n").length - 2}`).join(", ")}`,
);
console.log("escala do limão:", PASSOS.map((n) => `${n.slice(8)} ${n === "--brand-500" ? LIMAO : paraOLimao(escuro[n].cor)}`).join(" · "));
// AA: 4,5:1 texto normal, 3:1 texto grande, ícone e borda. Cores com alfa são
// comparadas pelo RGB (o limão e o texto escuro são opacos).
for (const { nome: tema } of TEMAS) {
  const c = coresPorTema[tema];
  for (const n of ["--control-primary-background-default", "--control-primary-background-hover", "--control-primary-background-active"]) {
    console.log(`[${tema}] accent-ink sobre ${n} (${c[n]}): ${contraste(ACCENT_INK, c[n].slice(0, 7)).toFixed(2)}:1`);
  }
  for (const n of ["--mention-foreground", "--text-brand", "--brand-500"]) {
    for (const fundo of ["--background-base-lowest", "--background-base-lower", "--background-surface-highest"]) {
      console.log(`[${tema}] ${n} (${c[n]}) sobre ${fundo} (${c[fundo]}): ${contraste(c[n].slice(0, 7), c[fundo].slice(0, 7)).toFixed(2)}:1`);
    }
  }
}
