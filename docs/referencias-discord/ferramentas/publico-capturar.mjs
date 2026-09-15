// Captura as páginas públicas do Discord (sem login) em três perfis.
//
// Uso (de dentro de ferramentas/), uma página ou um lote pequeno por execução:
//   node publico-capturar.mjs <perfil> <id> [id...]
//   node publico-capturar.mjs desktop login login-qr
//   node publico-capturar.mjs web-mobile-ios todas      # todas as páginas do perfil (demora)
// Perfis: desktop | web-mobile-ios | web-mobile-android. Ids: veja PAGINAS abaixo.
//
// Saída: ../publico/<perfil>/<nn>-<nome>{-viewport,-inteira}.png + <nn>-<nome>.html, e as
// entradas correspondentes em ../publico/manifesto.json (mescladas por `arquivo`).
//
// Regras: nenhum formulário é enviado. POST para /api/*/auth/ e /api/*/invites/ é abortado no
// navegador; o único caso "esqueci a senha" responde localmente (ver `esqueci-simulado`).
// Nada de networkidle: o discord.com nunca fica ocioso (gateway + telemetria).

import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright-core";

const RAIZ = new URL("../publico", import.meta.url).pathname;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const PERFIS = {
  desktop: { plataforma: "desktop", ctx: { userAgent: UA, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  "web-mobile-ios": { plataforma: "web-mobile", ctx: { ...devices["iPhone 15 Pro"] } },
  "web-mobile-android": { plataforma: "web-mobile", ctx: { ...devices["Pixel 7"] } },
};
// Chrome não gera screenshot com mais de ~16k px de altura física; cortamos antes.
const ALTURA_MAX_PX = 15000;

const temTexto = (min = 80) => `document.body && document.body.innerText.trim().length > ${min}`;

const PAGINAS = {
  login: { nn: "01", nome: "login", url: "https://discord.com/login", tela: "autenticação > login", pronto: 'input[name="email"]' },
  "login-qr": {
    nn: "02", nome: "login-qr", url: "https://discord.com/login", tela: "autenticação > login por QR", so: ["desktop"],
    pronto: 'input[name="email"]',
    // espera o QR sair do estado "carregando" (o texto aria-live muda para "pronto")
    acao: async (page) => { await page.waitForFunction(() => /QR está pronto|QR code is ready/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1500); },
    recorte: async (page) => page.locator("text=Entrar com código QR").locator("xpath=ancestor::div[.//img or .//canvas or .//svg][1]/..").first(),
  },
  "esqueci-reset": { nn: "03", nome: "esqueci-senha-reset", url: "https://discord.com/reset", tela: "autenticação > esqueci a senha", pronto: 'input[type="password"]',
    obs: "Página /reset aberta sem token (é para onde leva o link do e-mail). Mostra o formulário 'Alterar sua senha'; nada foi enviado." },
  "esqueci-simulado": {
    nn: "04", nome: "esqueci-senha-erro-SIMULADO", url: "https://discord.com/login", tela: "autenticação > esqueci a senha", pronto: 'input[name="email"]',
    obs: "SIMULADO: clique em 'Esqueceu sua senha?' com o e-mail vazio. O POST /api/v9/auth/forgot foi interceptado no navegador e respondido localmente com o erro de validação no formato da API (400, código 50035, 'Este campo é obrigatório'); nada chegou ao Discord. Serve de referência do estado de erro do campo, não é resposta real do servidor.",
    simularEsqueci: true,
    acao: async (page) => { await page.click("text=Esqueceu sua senha?"); await page.waitForTimeout(2500); },
  },
  registro: { nn: "05", nome: "registro", url: "https://discord.com/register", tela: "autenticação > registro", pronto: 'input[name="email"]' },
  "registro-data": {
    nn: "06", nome: "registro-seletor-de-data", url: "https://discord.com/register", tela: "autenticação > registro", pronto: 'input[name="email"]',
    obs: "Mesmo registro, com o seletor de mês da data de nascimento aberto (só abre o dropdown; nada digitado nem enviado).",
    acao: async (page) => {
      // o select é um combobox próprio; o texto "Mês" visível é o placeholder dele
      const campo = page.locator('[data-mana-component="select-input-field"]:has([aria-label="Mês"])').first();
      await campo.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
      let aberto = await page.locator('[role="listbox"], [role="option"]').count();
      if (!aberto) { // fallback: teclado no combobox
        await page.locator('[role="combobox"][aria-label="Mês"]').focus().catch(() => {});
        await page.keyboard.press("Enter");
        await page.waitForTimeout(800);
        aberto = await page.locator('[role="listbox"], [role="option"]').count();
      }
      await page.waitForTimeout(600);
      if (!aberto) console.log("  aviso: dropdown de mês não abriu");
    },
  },
  app: { nn: "07", nome: "app-sem-login", url: "https://discord.com/app", tela: "autenticação > login", pronto: 'input[name="email"]' },
  "convite-dev": { nn: "08", nome: "convite-discord-developers", url: "https://discord.gg/discord-developers", tela: "modais > página de convite", pronto: temTexto() },
  "convite-mine": { nn: "09", nome: "convite-minecraft", url: "https://discord.com/invite/minecraft", tela: "modais > página de convite", pronto: temTexto() },
  "convite-entrar": {
    nn: "10", nome: "convite-minecraft-entrar", url: "https://discord.com/invite/minecraft", tela: "modais > página de convite", so: ["desktop"], pronto: temTexto(),
    obs: "Convite no desktop depois de clicar em 'Já tem uma conta? Entre aqui' (troca o cadastro rápido pelo login dentro do convite; nada enviado).",
    acao: async (page) => { await page.click("text=Entre aqui", { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(2000); },
  },
  servidores: { nn: "11", nome: "descobrir-servidores", url: "https://discord.com/servers", tela: "descoberta > descobrir servidores", pronto: temTexto(300), rolar: true },
  apps: { nn: "12", nome: "diretorio-de-apps", url: "https://discord.com/discovery/applications", tela: "descoberta > diretório de apps", pronto: temTexto(300), rolar: true },
  "app-mee6": { nn: "13", nome: "diretorio-app-mee6", url: "https://discord.com/discovery/applications/159985415099514880", tela: "descoberta > diretório de apps", pronto: temTexto(200), rolar: true,
    obs: "Página pública de um app do diretório (MEE6)." },
  nitro: { nn: "14", nome: "nitro", url: "https://discord.com/nitro", tela: "descoberta > loja", pronto: temTexto(300), rolar: true,
    obs: "Página pública de marketing do Nitro (não é a aba Nitro do app logado)." },
  download: { nn: "15", nome: "download", url: "https://discord.com/download", tela: "marketing", pronto: temTexto(300), rolar: true },
  home: { nn: "16", nome: "home", url: "https://discord.com", tela: "marketing", pronto: temTexto(300), rolar: true },
};

const [perfilNome, ...ids] = process.argv.slice(2);
const perfil = PERFIS[perfilNome];
if (!perfil || !ids.length) {
  console.log("uso: node publico-capturar.mjs <" + Object.keys(PERFIS).join("|") + "> <" + Object.keys(PAGINAS).join("|") + "|todas> ...");
  process.exit(1);
}
const lista = ids[0] === "todas" ? Object.keys(PAGINAS) : ids;
const pasta = path.join(RAIZ, perfilNome);
fs.mkdirSync(pasta, { recursive: true });

const manifestoPath = path.join(RAIZ, "manifesto.json");
const lerManifesto = () => { try { return JSON.parse(fs.readFileSync(manifestoPath, "utf8")); } catch { return []; } };
function registrar(entradas) {
  const m = lerManifesto().filter((e) => !entradas.some((n) => n.arquivo === e.arquivo));
  m.push(...entradas);
  m.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
  fs.writeFileSync(manifestoPath, JSON.stringify(m, null, 2) + "\n");
}

// Screenshot "inteira" que também funciona em SPA com rolagem interna: se o documento não
// rola mas algum contêiner sim, crescemos a viewport até caber o conteúdo dele.
async function inteira(page, arquivo, dsf) {
  const vp = page.viewportSize();
  const alturaMax = Math.floor(ALTURA_MAX_PX / dsf);
  const { doc, extra } = await page.evaluate(() => {
    const doc = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    let extra = 0;
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY) || el.clientHeight < 200) continue;
      extra = Math.max(extra, el.scrollHeight - el.clientHeight);
    }
    return { doc, extra };
  });
  let cortada = false;
  if (doc > vp.height + 4) {
    const h = Math.min(doc, alturaMax);
    cortada = doc > alturaMax;
    await page.screenshot({ path: arquivo, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: h } });
    return { altura: h, alturaReal: doc, cortada, modo: "documento" };
  }
  if (extra > 4) {
    const h = Math.min(vp.height + extra, alturaMax);
    cortada = vp.height + extra > alturaMax;
    await page.setViewportSize({ width: vp.width, height: h });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: arquivo });
    await page.setViewportSize(vp);
    return { altura: h, alturaReal: vp.height + extra, cortada, modo: "rolagem interna (viewport esticada)" };
  }
  await page.screenshot({ path: arquivo, fullPage: true });
  return { altura: vp.height, alturaReal: vp.height, cortada: false, modo: "cabe na viewport" };
}

async function rolarAteOFim(page) {
  // Aciona lazy-load e animações de entrada das páginas de marketing.
  for (let i = 0; i < 40; i++) {
    const fim = await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    });
    await page.waitForTimeout(250);
    if (fim) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const id of lista) {
    const p = PAGINAS[id];
    if (!p) { console.log("id desconhecido:", id); continue; }
    if (p.so && !p.so.includes(perfilNome)) { console.log("pulando", id, "(só", p.so.join(","), ")"); continue; }
    const base = `${p.nn}-${p.nome}`;
    const ctx = await browser.newContext({ ...perfil.ctx, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const bloqueados = [];
    await ctx.route("**/api/v*/**", (r) => {
      const req = r.request();
      if (req.method() === "POST" && /\/auth\/forgot/.test(req.url()) && p.simularEsqueci) {
        bloqueados.push("POST /auth/forgot (respondido localmente)");
        return r.fulfill({ status: 400, contentType: "application/json",
          body: JSON.stringify({ message: "Invalid Form Body", code: 50035, errors: { login: { _errors: [{ code: "BASE_TYPE_REQUIRED", message: "Este campo é obrigatório" }] } } }) });
      }
      if (req.method() !== "GET" && /\/api\/v\d+\/(auth|invites)\//.test(req.url())) {
        bloqueados.push(req.method() + " " + new URL(req.url()).pathname);
        return r.abort();
      }
      return r.continue();
    });
    const page = await ctx.newPage();
    const entrada = { url: p.url, perfil: perfilNome, plataforma: perfil.plataforma, tela: p.tela };
    const obs = [];
    try {
      const t0 = Date.now();
      const resp = await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (p.pronto.includes("document.")) await page.waitForFunction(p.pronto, null, { timeout: 25000 }).catch(() => obs.push("conteúdo demorou (>25 s)"));
      else await page.waitForSelector(p.pronto, { timeout: 25000 }).catch(() => obs.push(`seletor ${p.pronto} não apareceu`));
      await page.waitForTimeout(3000);
      const titulo = await page.title();
      const texto = await page.evaluate(() => document.body?.innerText || "");
      if (/just a moment|verify you are human|verifique que você é humano|cf-challenge/i.test(titulo + texto)) obs.push("CLOUDFLARE/CAPTCHA apareceu; não insisti");
      if (p.rolar) await rolarAteOFim(page);
      if (p.acao) await p.acao(page);
      const final = page.url();
      if (final.replace(/\/$/, "") !== p.url.replace(/\/$/, "")) obs.push(`redirecionou para ${final}`);
      entrada.urlFinal = final;
      entrada.status = resp?.status();
      entrada.titulo = titulo;

      const vpArq = `${perfilNome}/${base}-viewport.png`;
      await page.screenshot({ path: path.join(RAIZ, vpArq) });
      const inArq = `${perfilNome}/${base}-inteira.png`;
      const info = await inteira(page, path.join(RAIZ, inArq), perfil.ctx.deviceScaleFactor || 1);
      if (info.cortada) obs.push(`página inteira cortada em ${info.altura}px CSS (real ${info.alturaReal}px) pelo limite de altura do Chrome`);
      const htmlArq = `${perfilNome}/${base}.html`;
      fs.writeFileSync(path.join(RAIZ, htmlArq), await page.content());

      const extras = [];
      if (p.recorte) {
        const loc = await p.recorte(page);
        const recArq = `${perfilNome}/${base}-recorte.png`;
        await loc.screenshot({ path: path.join(RAIZ, recArq), timeout: 8000 }).then(() => extras.push(recArq)).catch((e) => obs.push("recorte falhou: " + e.message.split("\n")[0]));
      }
      if (bloqueados.length) obs.push("requisições bloqueadas: " + [...new Set(bloqueados)].join(", "));
      const observacao = [p.obs, ...obs, `inteira: ${info.modo}`, `${Math.round((Date.now() - t0) / 1000)} s`].filter(Boolean).join(" | ");
      const entradas = [
        { arquivo: vpArq, tipo: "viewport", ...entrada, observacao },
        { arquivo: inArq, tipo: "pagina-inteira", ...entrada, observacao },
        { arquivo: htmlArq, tipo: "html-renderizado", ...entrada, observacao },
        ...extras.map((a) => ({ arquivo: a, tipo: "recorte", ...entrada, observacao })),
      ];
      registrar(entradas);
      console.log("ok", perfilNome, base, "|", observacao);
    } catch (e) {
      const msg = e.message.split("\n")[0];
      console.log("ERRO", perfilNome, base, msg);
      registrar([{ arquivo: `${perfilNome}/${base}-viewport.png`, tipo: "falhou", ...entrada, observacao: "falhou: " + msg }]);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
} finally {
  await browser.close().catch(() => {});
}
