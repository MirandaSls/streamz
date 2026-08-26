/**
 * Passeio ponta a ponta das configurações (agente E), com screenshots.
 *
 * Cobre o que o briefing pediu para validar: abrir as configurações, mudar a
 * escala da fonte, silenciar um canal e ver que ele para de acusar novidade, e
 * a busca rápida (Ctrl+K). De quebra confere o deep link `?settings=<aba>` e a
 * aba "Teclado".
 *
 *   node scripts/e2e-e-configuracoes.mjs --out C:/tmp/shots-e
 *
 * Pré-requisitos: API e web no ar. Aponte com WEB_URL (padrão: :3105, a porta
 * do agente E).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "./e2e-shots-e",
);
mkdirSync(outDir, { recursive: true });
const WEB = process.env.WEB_URL ?? "http://localhost:3105";

// i-conta: o registro exige e-mail e senha forte, o login usa `#identificador`
// e, após registrar, a web passa por /verify-email (a conta já é utilizável).
const E2E_EMAIL_DOMINIO = "e2e.streamz.test";
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

/** Falha alto: um passo que "passou" sem o efeito é pior que um erro. */
function conferir(condicao, mensagem) {
  if (!condicao) throw new Error(`conferência falhou: ${mensagem}`);
  console.log("✓", mensagem);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const viewport = { width: 1440, height: 900 };

/** O `next dev` compila a rota na primeira visita; 90 s cobre isso com folga. */
const TIMEOUT_MS = 90_000;

function observar(page, nome) {
  page.setDefaultTimeout(TIMEOUT_MS);
  page.setDefaultNavigationTimeout(TIMEOUT_MS);
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
  page.on("response", (r) => r.status() >= 400 && console.log(`[${nome} http ${r.status()}]`, r.url()));
}

async function registrar(ctx, { user, pass }) {
  const page = await ctx.newPage();
  observar(page, user);
  await page.goto(`${WEB}/register`, { timeout: TIMEOUT_MS });
  await preencherCredenciais(page, user, pass);
  await page.click('button[type="submit"]');
  await esperarApp(page, { timeout: TIMEOUT_MS });
  await page.waitForTimeout(1500);
  return page;
}

/** O menu lateral das configurações — "Notificações" também é o sino do canal. */
const menuConfig = (page) => page.locator('nav[aria-label="Configurações"]');

/** Escala da fonte lida do próprio `<html>` — é onde a preferência é aplicada. */
const fonteDoDocumento = (page) =>
  page.evaluate(() => document.documentElement.style.fontSize || "");

try {
  const ctxA = await browser.newContext({ viewport, locale: "pt-BR" });
  const ctxB = await browser.newContext({ viewport, locale: "pt-BR" });

  const ana = await registrar(ctxA, ANA);

  // servidor com um canal para silenciar depois
  await ana.click('button[aria-label="Adicionar um servidor"]');
  await ana.fill('input[aria-label="Criar um servidor"]', "Configurações QA");
  await ana.getByRole("button", { name: "Criar", exact: true }).click();
  await ana.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await ana.waitForTimeout(800);

  // ── 1. shell de configurações ──
  await ana.click('button[aria-label="Configurações do usuário"]');
  await ana.waitForSelector('[role="dialog"][aria-label="Configurações"]', { timeout: 15_000 });
  await shot(ana, "config-minha-conta");
  conferir(
    (await ana.url()).includes("settings="),
    "a aba aberta aparece na URL (deep link)",
  );

  // ── 2. aparência: escala da fonte ──
  await menuConfig(ana).getByRole("button", { name: "Aparência" }).click();
  await ana.waitForTimeout(300);
  const antes = await fonteDoDocumento(ana);
  const escala = ana.locator('input[type="range"]').first();
  await escala.focus();
  for (let i = 0; i < 4; i += 1) await ana.keyboard.press("ArrowRight");
  await ana.waitForTimeout(300);
  const depois = await fonteDoDocumento(ana);
  conferir(antes !== depois && depois.endsWith("px"), `escala da fonte mudou (${antes} → ${depois})`);
  await shot(ana, "config-aparencia");

  // modo compacto muda a prévia na hora
  await ana.getByRole("switch", { name: "Modo compacto" }).click();
  await ana.waitForTimeout(300);
  conferir(
    await ana.evaluate(() => document.documentElement.classList.contains("modo-compacto")),
    "modo compacto ligado",
  );
  await shot(ana, "config-modo-compacto");
  await ana.getByRole("switch", { name: "Modo compacto" }).click();

  // volta a escala para não atrapalhar as capturas seguintes
  await escala.focus();
  for (let i = 0; i < 4; i += 1) await ana.keyboard.press("ArrowLeft");

  // ── 3. atalhos e notificações ──
  await menuConfig(ana).getByRole("button", { name: "Teclado" }).click();
  await ana.waitForTimeout(300);
  await shot(ana, "config-teclado");
  await menuConfig(ana).getByRole("button", { name: "Notificações" }).click();
  await ana.waitForTimeout(300);
  await shot(ana, "config-notificacoes");

  // Esc fecha, como no Discord
  await ana.keyboard.press("Escape");
  await ana.waitForTimeout(400);
  conferir(
    (await ana.locator('[role="dialog"][aria-label="Configurações"]').count()) === 0,
    "Esc fecha as configurações",
  );

  // ── 4. deep link ──
  await ana.goto(`${WEB}/app?settings=acessibilidade`, {
    timeout: TIMEOUT_MS,
    // o `load` só chega quando todo subrecurso do dev server termina; o que
    // interessa aqui é o app montar, e disso cuida o waitForSelector abaixo
    waitUntil: "domcontentloaded",
  });
  await ana.waitForSelector('[role="dialog"][aria-label="Configurações"]', { timeout: 20_000 });
  await ana.waitForTimeout(500);
  conferir(
    (await ana.locator("h1", { hasText: "Acessibilidade" }).count()) > 0,
    "?settings=acessibilidade abre a aba certa",
  );
  await shot(ana, "config-deep-link");
  await ana.keyboard.press("Escape");
  await ana.waitForTimeout(500);

  // ── 5. busca rápida (Ctrl+K) ──
  await ana.keyboard.press("Control+K");
  await ana.waitForSelector('input[aria-label="Onde você quer ir?"]', { timeout: 15_000 });
  await shot(ana, "quick-switcher-vazio");
  await ana.fill('input[aria-label="Onde você quer ir?"]', "#ger");
  await ana.waitForTimeout(400);
  await shot(ana, "quick-switcher-busca");
  await ana.keyboard.press("Enter");
  await ana.waitForTimeout(800);
  conferir(
    (await ana.locator('h1:has-text("geral")').count()) > 0,
    "Enter na busca rápida abre o canal",
  );

  // ── 6. silenciar canal ──
  const convite = await (async () => {
    await ana.click('button[aria-haspopup="menu"]');
    await ana.getByRole("menuitem", { name: /Convidar pessoas/ }).click();
    await ana.waitForSelector('[role="dialog"] code');
    const codigo = (await ana.textContent('[role="dialog"] code'))?.trim();
    await ana.keyboard.press("Escape");
    return codigo;
  })();
  console.log("convite:", convite);

  // um segundo canal, para o não-lido aparecer sem estar aberto na tela
  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: /Criar canal/ }).click();
  await ana.fill('input[aria-label="Nome do canal"]', "avisos");
  await ana.getByRole("button", { name: "Criar canal", exact: true }).click();
  await ana.waitForTimeout(1200);

  // volta para #geral e silencia #avisos pelo botão direito
  await ana.getByRole("button", { name: /^geral/ }).click();
  await ana.waitForTimeout(600);
  await ana.getByRole("button", { name: /^avisos/ }).click({ button: "right" });
  await ana.waitForTimeout(300);
  await shot(ana, "menu-canal");
  await ana.getByRole("menuitem", { name: "Notificações" }).click();
  await ana.waitForTimeout(300);
  await shot(ana, "menu-notificacao");
  await ana.getByRole("menuitem", { name: "Até eu reativar" }).click();
  await ana.waitForTimeout(800);
  await shot(ana, "canal-silenciado");

  // Beto entra e escreve em #avisos
  const beto = await registrar(ctxB, BETO);
  await beto.click('button[aria-label="Entrar com convite"]');
  await beto.fill('input[aria-label="Entrar em um servidor"]', convite);
  await beto.getByRole("button", { name: "Entrar", exact: true }).click();
  await beto.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await beto.getByRole("button", { name: /^avisos/ }).click();
  await beto.waitForTimeout(800);
  await beto.fill('textarea[aria-label="Mensagem para #avisos"]', "aviso que a Ana silenciou");
  await beto.press('textarea[aria-label="Mensagem para #avisos"]', "Enter");
  await beto.waitForTimeout(2000);

  await ana.waitForTimeout(1200);
  await shot(ana, "silenciado-nao-acusa");
  const avisos = ana.getByRole("button", { name: /^avisos/ });
  conferir(
    !(await avisos.evaluate((el) => el.className.includes("font-semibold"))),
    "canal silenciado não fica em negrito de não lido",
  );

  // dessilenciar traz o não lido de volta
  await avisos.click({ button: "right" });
  await ana.getByRole("menuitem", { name: "Notificações" }).click();
  await ana.getByRole("menuitem", { name: "Dessilenciar" }).click();
  await ana.waitForTimeout(1000);
  await shot(ana, "dessilenciado");

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
