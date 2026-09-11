// Extrai tokens de design do CSS público do cliente do Discord.
//
// Uso (de dentro de ferramentas/):
//   node publico-tokens.mjs            # parse offline + resolução no navegador
//   node publico-tokens.mjs --offline  # só o parse (não abre o navegador)
//
// Entrada: tokens/css-bruto/*.css (baixados por publico-baixar-css.mjs)
// Saída:   tokens/variaveis.json, tokens/variaveis-resolvidas.json,
//          tokens/tipografia-e-formas.json (fontes, escala, raios, sombras, breakpoints)
// Os .md são gerados por publico-tokens-md.mjs a partir desses JSONs.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { parseCss, splitDecls } from "./publico-css-parser.mjs";

const BASE = new URL("../tokens", import.meta.url).pathname;
const DIR = path.join(BASE, "css-bruto");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const offline = process.argv.includes("--offline");

// Classes de CSS module têm sufixo de hash (foo_d27f17, foo__201d5). Escopo "global" é o
// seletor que sobra sem elas: :root, .theme-*, .visual-refresh, .density-* etc.
const HASH = /[_-][0-9a-z]{5,6}\b/;
const ehGlobal = (sel) => !HASH.test(sel.replace(/theme-[a-z]+|visual-refresh[a-z-]*|density-[a-z]+|high-contrast-mode|custom-theme-background|custom-user-profile-theme|refresh-fast-follow-avatars|platform-[a-z]+|user-profile-sidebar[a-z-]*|custom-client-theme/g, ""));

// Ordem: a do HTML do login (mais fiel à cascata real), depois o resto.
const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".css"));
let ordem = [];
try {
  ordem = fs.readFileSync(path.join(DIR, "..", "css-bruto-ordem.txt"), "utf8").split("\n").filter(Boolean).map((l) => path.basename(l.split("\t")[0]));
} catch {}
arquivos.sort((a, b) => {
  const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
  return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib) || a.localeCompare(b);
});
// Chunks do app logado (sob demanda) entram depois: na vida real carregam depois do bundle
// inicial, então numa colisão de :root eles venceriam.
const SOB = path.join(DIR, "sob-demanda");
if (fs.existsSync(SOB)) arquivos.push(...fs.readdirSync(SOB).filter((f) => f.endsWith(".css")).sort().map((f) => "sob-demanda/" + f));

const escopos = {}; // chave -> { "--x": valor }
const origemEscopo = {}; // chave -> Set(arquivo)
const conflitosRoot = [];
const fontFaces = [];
const cont = { "font-size": {}, "font-weight": {}, "line-height": {}, "font-family": {}, "border-radius": {}, "box-shadow": {}, "letter-spacing": {} };
const medias = {};
const usoVar = {};
const escalaTexto = {};
let regrasTotal = 0, varsComponente = 0;

const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };

for (const f of arquivos) {
  const css = fs.readFileSync(path.join(DIR, f), "utf8");
  for (const m of css.matchAll(/var\((--[a-zA-Z0-9_-]+)/g)) inc(usoVar, m[1]);
  for (const r of parseCss(css)) {
    if (r.tipo === "fontface") {
      const d = Object.fromEntries(splitDecls(r.decl).map((x) => [x.prop, x.valor]));
      fontFaces.push({ arquivo: f, ...d });
      continue;
    }
    if (r.tipo !== "regra") continue;
    regrasTotal++;
    const terceiro = /Incode|SignatureCanvas/.test(r.seletor); // SDK de terceiros, fora das estatísticas
    if (!terceiro) for (const c of r.ctx) if (c.startsWith("@media")) inc(medias, c);
    const decls = splitDecls(r.decl);
    // escala tipográfica: .text-md\/normal_hash, .heading-xl\/bold_hash, .display-sm\/...
    const mEsc = r.seletor.match(/^\.((?:text|heading|display|eyebrow|code)-[a-z0-9]+)\\\/([a-z]+)_[a-z0-9]+$/);
    if (mEsc && !r.ctx.length) {
      const o = Object.fromEntries(decls.map((x) => [x.prop, x.valor]));
      escalaTexto[`${mEsc[1]}/${mEsc[2]}`] = o;
    }
    const vars = decls.filter((d) => d.prop.startsWith("--"));
    if (!terceiro) for (const d of decls) if (cont[d.prop]) inc(cont[d.prop], d.valor);
    if (!vars.length) continue;
    // Incode = SDK de terceiros (verificação de idade) embutido em chunks sob demanda; não é
    // tema do Discord.
    if (!ehGlobal(r.seletor) || /Incode|SignatureCanvas/.test(r.seletor) || r.ctx.some((c) => /@layer (properties|incode)/.test(c))) {
      varsComponente += vars.length; continue;
    }
    // Chunks sob demanda NÃO se misturam aos escopos do bundle inicial: um deles
    // (2ebfdf9d6f68a8bf.css) redefine todo o :root com "hotpink" (folha de depuração de
    // token faltando) e sobrescreveria a paleta. Ficam num escopo próprio, por arquivo.
    const prefixo = f.startsWith("sob-demanda/") ? `[${f}] ` : "";
    const chave = prefixo + (r.ctx.length ? r.ctx.join(" ") + " " : "") + r.seletor;
    escopos[chave] ??= {};
    (origemEscopo[chave] ??= new Set()).add(f);
    for (const v of vars) {
      if (chave === ":root" && escopos[chave][v.prop] !== undefined && escopos[chave][v.prop] !== v.valor) {
        conflitosRoot.push({ var: v.prop, antes: escopos[chave][v.prop], depois: v.valor, arquivo: f });
      }
      escopos[chave][v.prop] = v.valor;
    }
  }
}

// Ordena escopos: os de tema primeiro.
const prioridade = [":root", ".visual-refresh", ".theme-dark", ".theme-darker", ".theme-midnight", ".theme-light"];
const chaves = Object.keys(escopos).sort((a, b) => {
  const pa = prioridade.indexOf(a), pb = prioridade.indexOf(b);
  const sa = a.startsWith("[sob-demanda"), sb = b.startsWith("[sob-demanda");
  return (sa - sb) || (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || Object.keys(escopos[b]).length - Object.keys(escopos[a]).length;
});
const variaveis = Object.fromEntries(chaves.map((k) => [k, escopos[k]]));
fs.writeFileSync(path.join(BASE, "variaveis.json"), JSON.stringify(variaveis, null, 1));

const top = (o, n = 25) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([valor, vezes]) => ({ valor, vezes }));
const formas = {
  coletadoEm: "2026-09-11",
  arquivosCss: arquivos.length,
  regras: regrasTotal,
  varsDeComponente: varsComponente,
  fontFaces: fontFaces.map((f) => ({
    familia: (f["font-family"] || "").replace(/["']/g, ""),
    peso: f["font-weight"] || "",
    estilo: f["font-style"] || "",
    display: f["font-display"] || "",
    urls: [...(f.src || "").matchAll(/url\(([^)]+)\)/g)].map((m) => {
      const u = m[1].replace(/["']/g, "");
      // fonte embutida em data: URI não é copiada (seria o próprio arquivo da fonte)
      if (u.startsWith("data:")) return "data: (fonte embutida no CSS, omitida)";
      return u.startsWith("/") ? "https://discord.com" + u : u;
    }),
    unicodeRange: (f["unicode-range"] || "").slice(0, 80),
    arquivoCss: f.arquivo,
  })),
  escalaTexto,
  maisUsados: Object.fromEntries(Object.entries(cont).map(([k, v]) => [k, top(v, k === "font-family" ? 15 : 30)])),
  mediaQueries: top(medias, 40),
  varsMaisReferenciadas: top(usoVar, 200),
  conflitosRoot: conflitosRoot.slice(0, 50),
};
fs.writeFileSync(path.join(BASE, "tipografia-e-formas.json"), JSON.stringify(formas, null, 1));

console.log("escopos globais:", chaves.length);
for (const k of chaves.slice(0, 12)) console.log(" ", Object.keys(escopos[k]).length, k, [...origemEscopo[k]].length, "arquivo(s)");
console.log("font-face:", fontFaces.length, "escala:", Object.keys(escalaTexto).length, "conflitos :root:", conflitosRoot.length);

if (offline) process.exit(0);

// ---- Resolução no navegador --------------------------------------------------------
// Abrimos o próprio /login (que carrega todo esse CSS na ordem real), tiramos as classes de
// tema do <html> e medimos em divs com a combinação de classes de cada tema. O Chrome faz a
// substituição de var() e a conta de color-mix/calc; o canvas converte o resultado em sRGB.
const TEMAS = {
  claro: "theme-light visual-refresh density-default",
  cinza: "theme-dark visual-refresh density-default", // "Ash" no seletor de temas
  escuro: "theme-dark theme-darker visual-refresh density-default", // "Dark": padrão do login deslogado
  onyx: "theme-dark theme-midnight visual-refresh density-default", // "Onyx"
};
const nomes = [...new Set(chaves.filter((k) => !/^\[sob-demanda|lang\(|mobile-visual|high-contrast|custom-user-profile|user-profile-sidebar/.test(k)).flatMap((k) => Object.keys(escopos[k])))].sort();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
await ctx.route("**/api/v*/**", (r) =>
  r.request().method() !== "GET" && /\/(auth|invites)\//.test(r.request().url()) ? r.abort() : r.continue());
const page = await ctx.newPage();
for (let tentativa = 1; ; tentativa++) {
  try { await page.goto("https://discord.com/login", { waitUntil: "domcontentloaded", timeout: 90000 }); break; }
  catch (e) { if (tentativa >= 3) throw e; console.log("goto falhou, tentando de novo:", e.message.split("\n")[0]); }
}
await page.waitForSelector("form, [class*=authBox]", { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(8000);
const htmlClasses = await page.evaluate(() => document.documentElement.className);
const resolvidas = await page.evaluate(({ TEMAS, nomes }) => {
  document.documentElement.className = "platform-web";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const c2d = canvas.getContext("2d", { willReadFrequently: true });
  const hex = (n) => n.toString(16).padStart(2, "0");
  function paraHex(cor) {
    c2d.clearRect(0, 0, 1, 1);
    c2d.fillStyle = "#000"; // reset: valor inválido não troca o fillStyle
    c2d.fillStyle = cor;
    c2d.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = c2d.getImageData(0, 0, 1, 1).data;
    return "#" + hex(r) + hex(g) + hex(b) + (a < 255 ? hex(a) : "");
  }
  const out = {};
  for (const [tema, classes] of Object.entries(TEMAS)) {
    const div = document.createElement("div");
    div.className = classes;
    document.body.appendChild(div);
    const cs = getComputedStyle(div);
    const res = {};
    // Um <span> por cor, todos anexados de uma vez: um único recálculo de estilo em vez
    // de um por variável (a versão ingênua levava ~15 min nesta página).
    const probes = [];
    for (const n of nomes) {
      const v = cs.getPropertyValue(n).trim();
      if (!v) continue;
      res[n] = { valor: v };
      if (!/^-?[\d.]+(px|rem|em|%|ms|s)?$/.test(v) && CSS.supports("color", v)) {
        const probe = document.createElement("span");
        probe.style.color = v;
        div.appendChild(probe);
        probes.push([n, probe]);
      }
    }
    for (const [n, probe] of probes) {
      const comp = getComputedStyle(probe).color;
      res[n].cor = paraHex(comp);
      res[n].computado = comp;
    }
    out[tema] = res;
    div.remove();
  }
  return out;
}, { TEMAS, nomes });
await browser.close();

fs.writeFileSync(path.join(BASE, "variaveis-resolvidas.json"), JSON.stringify({
  coletadoEm: "2026-09-11",
  fonte: "https://discord.com/login (CSS carregado pela página), Chrome headless",
  classesDoHtmlNoLogin: htmlClasses,
  temas: Object.fromEntries(Object.entries(TEMAS).map(([k, v]) => [k, v])),
  valores: resolvidas,
}, null, 1));
for (const [t, r] of Object.entries(resolvidas)) console.log(t, Object.keys(r).length, "vars,", Object.values(r).filter((x) => x.cor).length, "cores");
