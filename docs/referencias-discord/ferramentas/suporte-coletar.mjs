// Varre a central de ajuda do Discord (Zendesk) pela API pública e baixa toda
// imagem de artigo com o contexto em volta dela (título, seção, cabeçalho mais
// próximo, texto anterior e a dica de plataforma que o artigo dá).
//
// Por que Chrome visível: o headless leva 403 da Cloudflare; o visível passa.
// A janela abre fora da tela. Rodar de dentro de ferramentas/:
//   node suporte-coletar.mjs
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = path.resolve("../suporte");
const HOST = "https://support.discord.com";
const PULAR_CATEGORIAS = new Set(["Vendor Agreements", "Archived Discord Advertising IAB Addendums"]);
const CONCORRENCIA = 6;

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// Dimensões lidas do cabeçalho do arquivo — evita dependência e evita o sips
// em milhares de arquivos.
function dimensoes(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const t = buf.toString("ascii", 12, 16);
    if (t === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (t === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (t === "VP8L") { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return [null, null];
}

function extensao(tipo, url) {
  const porTipo = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
  if (porTipo[tipo]) return porTipo[tipo];
  const m = url.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "bin";
}

// A plataforma vem, em ordem de confiança: do texto que o artigo põe antes da
// imagem ("On Desktop", "iOS", "Android"...), depois do formato da imagem.
function plataformaPorTexto(t) {
  const s = (t || "").toLowerCase();
  const achou = [];
  if (/\bios\b|iphone|ipad/.test(s)) achou.push("ios");
  if (/android/.test(s)) achou.push("android");
  if (/\bmobile\b|\bphone\b|app on your phone/.test(s) && !achou.length) achou.push("mobile");
  if (/desktop|windows|mac ?os|\bpc\b|linux/.test(s)) achou.push("desktop");
  if (/browser|web app|\bweb\b/.test(s)) achou.push("web");
  if (/xbox|playstation|console/.test(s)) achou.push("console");
  return achou;
}

const browser = await chromium.launch({
  channel: "chrome", headless: false,
  args: ["--disable-blink-features=AutomationControlled", "--window-position=2400,2400", "--window-size=800,600"],
});
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${HOST}/hc/en-us`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

const apiJson = (url) => page.evaluate(async (u) => (await fetch(u)).json(), url);
async function todasAsPaginas(url, chave) {
  const out = [];
  let prox = url;
  while (prox) {
    const j = await apiJson(prox);
    out.push(...j[chave]);
    prox = j.next_page;
  }
  return out;
}

await mkdir(path.join(BASE, "api"), { recursive: true });
const artigos = await todasAsPaginas(`${HOST}/api/v2/help_center/en-us/articles.json?per_page=100`, "articles");
const secoes = await todasAsPaginas(`${HOST}/api/v2/help_center/en-us/sections.json?per_page=100`, "sections");
const categorias = await todasAsPaginas(`${HOST}/api/v2/help_center/en-us/categories.json?per_page=100`, "categories");
await writeFile(path.join(BASE, "api/artigos.json"), JSON.stringify(artigos));
await writeFile(path.join(BASE, "api/secoes.json"), JSON.stringify(secoes, null, 1));
await writeFile(path.join(BASE, "api/categorias.json"), JSON.stringify(categorias, null, 1));
console.log(`artigos=${artigos.length} secoes=${secoes.length} categorias=${categorias.length}`);

const secaoPorId = new Map(secoes.map((s) => [s.id, s]));
const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));

// O parse do HTML acontece no navegador (DOMParser) para não precisar de lib.
const extrair = (html) => page.evaluate((html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const texto = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
  const todos = [...doc.body.querySelectorAll("*")];
  return [...doc.querySelectorAll("img")].map((img) => {
    const idx = todos.indexOf(img);
    let cabecalho = "", anterior = "", dica = "";
    for (let i = idx - 1; i >= 0; i--) {
      const el = todos[i];
      if (!cabecalho && /^H[1-4]$/.test(el.tagName)) cabecalho = texto(el);
      if (!anterior && /^(P|LI)$/.test(el.tagName) && texto(el) && !el.contains(img)) anterior = texto(el).slice(0, 300);
      // Rótulos curtos em negrito/cabeçalho, tipo "Desktop:" ou "Mobile (iOS)".
      if (!dica && /^(H[1-6]|STRONG|B|SUMMARY)$/.test(el.tagName)) {
        const t = texto(el);
        if (t.length < 60 && /desktop|mobile|ios|android|browser|web|console|xbox|playstation/i.test(t)) dica = t;
      }
      if (cabecalho && anterior && dica) break;
    }
    const legenda = texto(img.closest("figure")?.querySelector("figcaption"));
    return { src: img.getAttribute("src"), alt: img.getAttribute("alt") || "", cabecalho, anterior, dica, legenda };
  });
}, html);

const manifesto = [];
const porHash = new Map();
const fila = [];

for (const a of artigos) {
  const sec = secaoPorId.get(a.section_id);
  const cat = categoriaPorId.get(sec?.category_id);
  if (cat && PULAR_CATEGORIAS.has(cat.name)) continue;
  const imgs = await extrair(a.body || "");
  imgs.forEach((im, n) => {
    if (!im.src || im.src.startsWith("data:")) return;
    const url = new URL(im.src, HOST).href;
    const pasta = path.join("imagens", slug(cat?.name || "sem-categoria"), `${a.id}-${slug(a.title)}`);
    fila.push({ a, sec, cat, im, n, url, pasta });
  });
}
console.log(`imagens na fila: ${fila.length}`);

let feitas = 0, falhas = 0;
async function baixar(item) {
  const { a, sec, cat, im, n, url, pasta } = item;
  let resp;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    resp = await ctx.request.get(url, { timeout: 60000 }).catch((e) => ({ erro: e.message }));
    if (!resp.erro && resp.ok()) break;
    await new Promise((r) => setTimeout(r, 2000 * (tentativa + 1)));
  }
  const base = {
    artigo_id: a.id, artigo: a.title, artigo_url: a.html_url, atualizado_em: a.updated_at,
    categoria: cat?.name || null, secao: sec?.name || null, ordem: n + 1, url_origem: url,
    alt: im.alt, legenda: im.legenda, cabecalho: im.cabecalho, texto_anterior: im.anterior, dica_plataforma: im.dica,
  };
  if (resp.erro || !resp.ok()) {
    falhas++;
    manifesto.push({ ...base, arquivo: null, erro: resp.erro || `HTTP ${resp.status()}` });
    return;
  }
  const buf = await resp.body();
  const hash = createHash("sha1").update(buf).digest("hex");
  const [largura, altura] = dimensoes(buf);
  let arquivo = porHash.get(hash);
  const duplicada = Boolean(arquivo);
  if (!arquivo) {
    arquivo = path.join(pasta, `${String(n + 1).padStart(2, "0")}.${extensao(resp.headers()["content-type"], url)}`);
    await mkdir(path.join(BASE, pasta), { recursive: true });
    await writeFile(path.join(BASE, arquivo), buf);
    porHash.set(hash, arquivo);
  }
  const porTexto = plataformaPorTexto(`${im.dica} ${im.cabecalho}`);
  const retrato = largura && altura ? altura / largura > 1.35 : null;
  manifesto.push({
    ...base, arquivo, duplicada_de_outro_artigo: duplicada, sha1: hash, largura, altura, bytes: buf.length,
    plataforma_texto: porTexto,
    plataforma: porTexto.length === 1 ? porTexto[0] : retrato ? "provavel-mobile" : porTexto.length ? porTexto.join("+") : "desconhecida",
  });
  if (++feitas % 100 === 0) console.log(`  ${feitas}/${fila.length}`);
}

for (let i = 0; i < fila.length; i += CONCORRENCIA) {
  await Promise.all(fila.slice(i, i + CONCORRENCIA).map(baixar));
}
manifesto.sort((x, y) => (x.categoria || "").localeCompare(y.categoria || "") || x.artigo_id - y.artigo_id || x.ordem - y.ordem);
await writeFile(path.join(BASE, "manifesto.json"), JSON.stringify(manifesto, null, 1));
console.log(`ok=${feitas} falhas=${falhas} arquivos_unicos=${porHash.size}`);
await browser.close();
