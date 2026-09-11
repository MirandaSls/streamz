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
 *   apps/web/app/tokens.css          variáveis por tema (`:root` = Dark)
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

// Temas: a coluna de `variaveis-resolvidas.json` e o seletor em que ela sai.
// Dark é o `:root`; Ash e Onyx entram na onda 9 como classes no <html>.
const TEMAS = [{ coluna: "escuro", seletor: ":root" }];

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

const trocasDeMarca = [];
const semValor = [];
const blocos = [];
let cores = [];
let sombras = [];

for (const { coluna, seletor } of TEMAS) {
  const vals = resolvidas.valores[coluna];
  const linhas = [];
  const coresTema = [];
  const sombrasTema = [];

  // a escala do limão, com os nomes do Discord
  for (const n of PASSOS) {
    const hex = n === "--brand-500" ? LIMAO : paraOLimao(vals[n].cor);
    coresTema.push([n, hex]);
  }

  for (const nome of [...nomesDeTema].sort()) {
    if (ehFora(nome)) continue;
    const v = vals[nome];
    if (!v) {
      semValor.push(nome);
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

  for (const [nome, hex] of coresTema) {
    const { r, g, b, a } = hexParaRgba(hex);
    linhas.push(`  ${nome}: ${hex};`);
    linhas.push(`  ${nome}-rgb: ${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)};`);
    linhas.push(`  ${nome}-a: ${+a.toFixed(4)};`);
  }
  for (const [nome, valor] of sombrasTema) linhas.push(`  ${nome}: ${valor};`);
  blocos.push(`${seletor} {\n${linhas.join("\n")}\n}`);
  if (coluna === "escuro") {
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
  `/*\n * ${AVISO}\n *\n * Cada cor sai em três variáveis: o hex, os canais (\`-rgb\`) e o alfa (\`-a\`).\n * As duas últimas existem para o modificador de opacidade do Tailwind\n * (\`bg-x/20\`) multiplicar o alfa que o token do Discord já tem.\n */\n${blocos.join("\n\n")}\n`,
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
      aviso: "Gerado por gerar-tokens.mjs. O que a regra da ADR-0009 (item 3) trocou no tema Dark.",
      limao: LIMAO,
      accentInk: ACCENT_INK,
      escala: Object.fromEntries(PASSOS.map((n) => [n, n === "--brand-500" ? LIMAO : paraOLimao(escuro[n].cor)])),
      trocas: trocasDeMarca,
    },
    null,
    2,
  ) + "\n",
);

// ── relatório ────────────────────────────────────────────────────────────────
const cor = (n) => {
  const t = trocasDeMarca.find((x) => x.nome === n);
  return t ? t.streamz : escuro[n]?.cor;
};
console.log(`tokens de tema: ${nomesDeTema.size}; cores emitidas: ${cores.length}; sombras: ${sombras.length}`);
console.log(`trocas pela marca: ${trocasDeMarca.length}; sem valor no Dark (pulados): ${semValor.length}`);
console.log("escala do limão:", PASSOS.map((n) => `${n.slice(8)} ${n === "--brand-500" ? LIMAO : paraOLimao(escuro[n].cor)}`).join(" · "));
for (const n of ["--control-primary-background-default", "--control-primary-background-hover", "--control-primary-background-active"]) {
  console.log(`accent-ink sobre ${n} (${cor(n)}): ${contraste(ACCENT_INK, cor(n).slice(0, 7)).toFixed(2)}:1`);
}
for (const n of ["--mention-foreground", "--text-brand"]) {
  console.log(`${n} (${cor(n)}) sobre --background-base-lower: ${contraste(cor(n).slice(0, 7), escuro["--background-base-lower"].cor).toFixed(2)}:1`);
}
