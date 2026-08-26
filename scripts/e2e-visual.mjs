/**
 * Passeio ponta a ponta com screenshots, para conferir o app no olho.
 *
 * Usa o Chrome/Edge já instalado (playwright-core, sem download de browser).
 * Dois usuários em contextos separados: um cria o servidor e convida; o outro
 * entra, conversa, menciona, abre DM. As capturas vão para --out (ou ./e2e-shots).
 *
 *   node scripts/e2e-visual.mjs --out C:/tmp/shots
 *
 * Pré-requisitos: API em :3333 e web em :3000 rodando.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "./e2e-shots");
mkdirSync(outDir, { recursive: true });
const WEB = process.env.WEB_URL ?? "http://localhost:3000";

// i-conta: o registro exige e-mail e senha forte, o login usa `#identificador`
// e, após registrar, a web passa por /verify-email (a conta já é utilizável).
const E2E_EMAIL_DOMINIO = "e2e.newdisc.test";
async function preencherCredenciais(page, user, pass) {
  if (await page.$("#email")) await page.fill("#email", `${user}@${E2E_EMAIL_DOMINIO}`);
  await page.fill((await page.$("#identificador")) ? "#identificador" : "#username", user);
  await page.fill("#password", pass);
}
async function esperarApp(page, opts = {}) {
  await page.waitForURL(/\/(app|verify-email)(\/|\?|#|$)/, opts);
  if (page.url().includes("/verify-email")) {
    await page.goto(new URL("/app", page.url()).toString());
    await page.waitForURL("**/app", opts);
  }
}

const sufixo = Date.now().toString(36).slice(-5);
const ANA = { user: `ana${sufixo}`, pass: "Xk9#vWq2pLm7!" };
const BETO = { user: `beto${sufixo}`, pass: "Xk9#vWq2pLm7!" };
let n = 0;
const shot = async (page, nome) => {
  n += 1;
  const file = resolve(outDir, `${String(n).padStart(2, "0")}-${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const viewport = { width: 1440, height: 900 };
/** Erros de console/página vão para o terminal — é o que explica um passo que trava. */
function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
  page.on("requestfailed", (r) => console.log(`[${nome} requestfailed]`, r.url(), r.failure()?.errorText));
  page.on("response", (r) => r.status() >= 400 && console.log(`[${nome} http ${r.status()}]`, r.url()));
}

async function registrar(ctx, { user, pass }) {
  const page = await ctx.newPage();
  observar(page, user);
  await page.goto(`${WEB}/register`);
  await preencherCredenciais(page, user, pass);
  await page.click('button[type="submit"]');
  await esperarApp(page, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return page;
}

try {
  const ctxA = await browser.newContext({ viewport, locale: "pt-BR" });
  const ctxB = await browser.newContext({ viewport, locale: "pt-BR" });
  const login = await ctxA.newPage();
  await login.goto(`${WEB}/login`);
  await shot(login, "login");
  await login.close();

  const ana = await registrar(ctxA, ANA);
  await shot(ana, "app-vazio");

  // cria servidor
  await ana.click('button[aria-label="Adicionar um servidor"]');
  await ana.fill('input[aria-label="Criar um servidor"]', "Time de Produto");
  await ana.getByRole("button", { name: "Criar", exact: true }).click();
  await ana.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await ana.waitForTimeout(800);
  await shot(ana, "servidor-criado");

  // manda mensagens com markdown e link
  const composer = 'textarea[aria-label="Mensagem para #geral"]';
  await ana.fill(composer, "Olá, **time**! Esse é o *novo* canal `geral`.");
  await ana.press(composer, "Enter");
  await ana.waitForTimeout(400);
  await ana.fill(composer, "Documentação aqui: https://nextjs.org");
  await ana.press(composer, "Enter");
  await ana.waitForTimeout(400);
  await ana.fill(composer, "> citação\n||spoiler escondido||");
  await ana.press(composer, "Enter");
  await ana.waitForTimeout(1500);
  await shot(ana, "mensagens-markdown");

  // convite
  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: /Convidar pessoas/ }).click();
  await ana.waitForSelector('[role="dialog"] code');
  const code = (await ana.textContent('[role="dialog"] code'))?.trim();
  await shot(ana, "convite");
  await ana.keyboard.press("Escape");
  console.log("convite:", code);

  // Beto entra pelo convite
  const beto = await registrar(ctxB, BETO);
  await beto.click('button[aria-label="Entrar com convite"]');
  await beto.fill('input[aria-label="Entrar em um servidor"]', code);
  await beto.getByRole("button", { name: "Entrar", exact: true }).click();
  await beto.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await beto.waitForTimeout(800);
  await shot(beto, "beto-entrou");

  // Beto menciona a Ana; Ana vê a menção e a lista de membros online
  await beto.fill(composer, `Oi @${ANA.user}, cheguei! 🎉`);
  await beto.press(composer, "Enter");
  await beto.waitForTimeout(1500);
  await shot(beto, "beto-mencao");
  await ana.waitForTimeout(500);
  await shot(ana, "ana-recebe-mencao");

  // Ana abre o perfil do Beto e manda DM
  await ana.click(`aside[aria-label="Membros"] button[aria-label="Perfil de ${BETO.user}"]`);
  await ana.waitForTimeout(500);
  await shot(ana, "popover-perfil");
  await ana.getByRole("button", { name: "Enviar mensagem" }).click();
  await ana.waitForSelector(`textarea[aria-label="Mensagem para ${BETO.user}"]`, { timeout: 15_000 });
  await ana.fill(`textarea[aria-label="Mensagem para ${BETO.user}"]`, "Bem-vindo! Isso é uma DM.");
  await ana.press(`textarea[aria-label="Mensagem para ${BETO.user}"]`, "Enter");
  await ana.waitForTimeout(1500);
  await shot(ana, "dm-ana");

  // Beto vê o não-lido no rail e abre a DM
  await beto.waitForTimeout(800);
  await shot(beto, "beto-nao-lido-rail");
  await beto.click('button[aria-label="Mensagens diretas (não lido)"]').catch(() => beto.click('button[aria-label="Mensagens diretas"]'));
  await beto.waitForTimeout(1500);
  await shot(beto, "beto-dm");

  // configurações: nome de exibição
  await beto.click('button[aria-label="Configurações do usuário"]');
  await beto.fill("#displayName", "Beto da Silva");
  await beto.getByRole("button", { name: "Salvar alterações" }).click();
  await beto.waitForTimeout(800);
  await shot(beto, "minha-conta");
  await beto.keyboard.press("Escape");

  // menu de contexto de mensagem
  await ana.click('button[aria-label^="Time de Produto"]');
  await ana.waitForTimeout(800);
  const primeira = ana.locator("text=Esse é o").first();
  await primeira.click({ button: "right" });
  await ana.waitForTimeout(400);
  await shot(ana, "menu-contexto");
  await ana.keyboard.press("Escape");

  // seletor de emoji
  await ana.click('button[aria-label="Emoji"]');
  await ana.waitForTimeout(1200);
  await shot(ana, "emoji-picker");
  await ana.keyboard.press("Escape");

  console.log("OK");
} catch (e) {
  console.log("FALHOU:", String(e.message ?? e).split(String.fromCharCode(10))[0]);
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) await shot(p, "erro");
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
