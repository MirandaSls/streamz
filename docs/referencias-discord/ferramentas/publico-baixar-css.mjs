// Baixa os bundles CSS públicos do cliente do Discord para tokens/css-bruto/.
// Fonte 1: os .css citados no HTML servido de /login e /invite/<código> (ordem do HTML).
// Fonte 2: os .css que o navegador pede em runtime nessas páginas (chunks sob demanda).
// Uso: node publico-baixar-css.mjs   (de dentro de ferramentas/)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = new URL("../tokens", import.meta.url).pathname;
const DIR = path.join(BASE, "css-bruto");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const PAGINAS = ["https://discord.com/login", "https://discord.com/invite/discord-developers"];
fs.mkdirSync(DIR, { recursive: true });

const lista = []; // [caminho, origem]
const visto = new Set();
for (const url of PAGINAS) {
  const html = await (await fetch(url, { headers: { "user-agent": UA } })).text();
  for (const m of html.matchAll(/\/assets\/[a-zA-Z0-9._-]+\.css/g)) {
    if (!visto.has(m[0])) { visto.add(m[0]); lista.push([m[0], "html " + new URL(url).pathname]); }
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
await ctx.route("**/api/v*/**", (r) =>
  r.request().method() !== "GET" && /\/(auth|invites)\//.test(r.request().url()) ? r.abort() : r.continue());
ctx.on("response", (r) => {
  const p = new URL(r.url()).pathname;
  if (p.endsWith(".css") && p.startsWith("/assets/") && !visto.has(p)) { visto.add(p); lista.push([p, "runtime"]); }
});
for (const url of [...PAGINAS, "https://discord.com/register"]) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  await page.close();
}
await browser.close();

// Fonte 3: o mapa de chunks CSS do webpack dentro do web.<hash>.js que o /login carrega
// (função `X.k=e=>...`). São os estilos do app logado (lista de servidores, chat, membros...),
// todos públicos em /assets/. Vão para css-bruto/sob-demanda/.
const htmlLogin = await (await fetch(PAGINAS[0], { headers: { "user-agent": UA } })).text();
const webJs = htmlLogin.match(/\/assets\/web\.[a-z0-9]+\.js/)?.[0];
const sobDemanda = [];
if (webJs) {
  const js = await (await fetch("https://discord.com" + webJs, { headers: { "user-agent": UA } })).text();
  // o mapa começa com `.k=e=>"<id>"===e?""+e+".<hash>.css"` e termina em `})[e]+".css"`
  const ini = js.search(/\.k=e=>"\d+"===e\?""\+e\+"\./);
  const fim = ini === -1 ? -1 : js.indexOf('})[e]+".css"', ini);
  const trecho = ini === -1 || fim === -1 ? "" : js.slice(ini, fim + 2);
  for (const m of trecho.matchAll(/"(\d+)"===e\?""\+e\+"\.([0-9a-f]+)\.css"/g)) sobDemanda.push(`${m[1]}.${m[2]}.css`);
  const obj = trecho.lastIndexOf("({");
  for (const m of trecho.slice(obj).matchAll(/\d+:"([0-9a-f]+)"/g)) sobDemanda.push(`${m[1]}.css`);
}
fs.mkdirSync(path.join(DIR, "sob-demanda"), { recursive: true });

let novos = 0;
const baixar = async (p, destino) => {
  if (fs.existsSync(destino)) return;
  const r = await fetch("https://discord.com" + p, { headers: { "user-agent": UA } });
  if (!r.ok) { console.log("falhou", r.status, p); return; }
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  novos++;
};
for (const [p] of lista) await baixar(p, path.join(DIR, path.basename(p)));
for (const f of new Set(sobDemanda)) {
  if (fs.existsSync(path.join(DIR, f))) continue; // já veio pelo HTML/runtime
  await baixar("/assets/" + f, path.join(DIR, "sob-demanda", f));
}
fs.writeFileSync(path.join(BASE, "css-bruto-ordem.txt"), lista.map(([p, o]) => `${p}\t${o}`).join("\n") + "\n");
console.log("css listados:", lista.length, "| chunks sob demanda no web.js:", new Set(sobDemanda).size, "| baixados agora:", novos);
