/**
 * Passeio ponta a ponta do agente B (canais): categorias, reordenar por
 * arrastar, tópico, modo lento e canal de anúncios.
 *
 *   WEB_URL=http://localhost:3102 node scripts/e2e-b-canais.mjs --out ./e2e-shots-b
 *
 * Pré-requisitos: API e web do worktree no ar (portas do briefing: 3402/3102).
 * Usa o Chrome já instalado (playwright-core, sem download de browser).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "./e2e-shots-b",
);
mkdirSync(outDir, { recursive: true });
const WEB = process.env.WEB_URL ?? "http://localhost:3102";

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

function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
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

/** Confere uma condição e explode com uma mensagem legível quando falha. */
function conferir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
  console.log("✔", mensagem);
}

try {
  const ctxA = await browser.newContext({ viewport, locale: "pt-BR" });
  const ctxB = await browser.newContext({ viewport, locale: "pt-BR" });

  const ana = await registrar(ctxA, ANA);
  await ana.click('button[aria-label="Adicionar um servidor"]');
  await ana.fill('input[aria-label="Criar um servidor"]', "Time de Produto");
  await ana.getByRole("button", { name: "Criar", exact: true }).click();
  await ana.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await ana.waitForTimeout(800);
  await shot(ana, "servidor-criado");

  // ── 1. criar categoria ──────────────────────────────────────
  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: /Criar categoria/ }).click();
  await ana.waitForSelector('[role="dialog"] input');
  await ana.fill('[role="dialog"] input', "Assuntos gerais");
  await ana.getByRole("button", { name: "Criar", exact: true }).click();
  await ana.waitForSelector("text=Assuntos gerais", { timeout: 15_000 });
  await ana.waitForTimeout(600);
  await shot(ana, "categoria-criada");
  conferir(await ana.isVisible("text=Assuntos gerais"), "categoria aparece na barra lateral");

  // ── 2. criar canal de anúncios dentro da categoria ──────────
  await ana.click('button[aria-label="Criar canal em Assuntos gerais"]');
  await ana.waitForSelector('input[aria-label="Nome do canal"]');
  await ana.fill('input[aria-label="Nome do canal"]', "avisos");
  await ana.getByRole("button", { name: "Anúncios" }).click();
  await ana.getByRole("button", { name: "Criar canal", exact: true }).click();
  await ana.waitForTimeout(1200);
  await shot(ana, "canal-anuncios-na-categoria");
  conferir(await ana.isVisible("text=avisos"), "canal de anúncios criado dentro da categoria");

  // ── 3. arrastar #geral para dentro da categoria ─────────────
  await ana.dragAndDrop(
    '[data-channel-button]:has-text("geral")',
    'button[aria-expanded]:has-text("Assuntos gerais")',
  );
  await ana.waitForTimeout(1200);
  await shot(ana, "canal-movido");

  // ── 4. tópico e modo lento pelo modal de configurações ──────
  await ana.click('button[aria-label="Configurações de geral"]');
  await ana.waitForSelector('[role="dialog"] textarea');
  await ana.fill('[role="dialog"] textarea', "Tudo que interessa ao time de produto.");
  await ana.selectOption('[role="dialog"] select', "5");
  await shot(ana, "configuracoes-do-canal");
  await ana.getByRole("button", { name: "Salvar", exact: true }).click();
  await ana.waitForTimeout(1200);
  await shot(ana, "topico-no-cabecalho");
  conferir(
    await ana.isVisible("text=Tudo que interessa ao time de produto."),
    "tópico aparece no cabeçalho",
  );

  // tópico completo em modal
  await ana.click('button:has-text("Tudo que interessa ao time de produto.")');
  await ana.waitForTimeout(500);
  await shot(ana, "topico-modal");
  await ana.keyboard.press("Escape");

  // ── 5. convite para o Beto (que é membro comum, não isento) ─
  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: /Convidar pessoas/ }).click();
  await ana.waitForSelector('[role="dialog"] code');
  const code = (await ana.textContent('[role="dialog"] code'))?.trim();
  await ana.keyboard.press("Escape");

  const beto = await registrar(ctxB, BETO);
  await beto.click('button[aria-label="Entrar com convite"]');
  await beto.fill('input[aria-label="Entrar em um servidor"]', code);
  await beto.getByRole("button", { name: "Entrar", exact: true }).click();
  await beto.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await beto.waitForTimeout(1000);
  await shot(beto, "beto-entrou");

  // ── 6. modo lento bloqueia a segunda mensagem seguida ───────
  const composer = 'textarea[aria-label="Mensagem para #geral"]';
  await beto.fill(composer, "primeira mensagem");
  await beto.press(composer, "Enter");
  await beto.waitForTimeout(800);
  await beto.fill(composer, "segunda, logo em seguida");
  await beto.press(composer, "Enter");
  await beto.waitForTimeout(600);
  await shot(beto, "modo-lento-bloqueia");
  conferir(
    await beto.isVisible("text=/Modo lento: aguarde/"),
    "modo lento avisa quantos segundos faltam",
  );

  // depois do intervalo, a mensagem passa
  await beto.waitForTimeout(6000);
  await beto.fill(composer, "agora vai");
  await beto.press(composer, "Enter");
  await beto.waitForTimeout(1200);
  await shot(beto, "modo-lento-liberou");
  conferir(await beto.isVisible("text=agora vai"), "envio volta a funcionar após o intervalo");

  // ── 7. canal de anúncios é somente leitura para o membro ────
  await beto.click('[data-channel-button]:has-text("avisos")');
  await beto.waitForTimeout(1000);
  await shot(beto, "anuncios-somente-leitura");
  conferir(
    await beto.isVisible("text=Você não tem permissão para enviar mensagens neste canal."),
    "canal de anúncios não deixa membro comum publicar",
  );

  // ── 8. recolher categoria e marcar o servidor como lido ─────
  await beto.click('button[aria-expanded="true"]:has-text("Assuntos gerais")');
  await beto.waitForTimeout(400);
  await shot(beto, "categoria-recolhida");

  await beto.click('button[aria-haspopup="menu"]');
  await beto.getByRole("menuitem", { name: /Marcar servidor como lido/ }).click();
  await beto.waitForTimeout(800);
  await shot(beto, "servidor-lido");

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
