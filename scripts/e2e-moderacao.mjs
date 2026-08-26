/**
 * Passeio ponta a ponta da moderação (agente H), com screenshots.
 *
 * Cobre o que o briefing pede provar no olho:
 *   1. castigo bloqueia o envio de mensagem;
 *   2. banimento com motivo aparece no registro de auditoria;
 *   3. a página pública `/invite/:code` abre sem login;
 *   4. enquete votada por dois usuários muda ao vivo para os dois.
 *
 * Usa o Chrome/Edge já instalado (playwright-core, sem download de browser).
 *
 *   node scripts/e2e-moderacao.mjs --out C:/tmp/shots-h
 *
 * Pré-requisitos: API e web no ar (por padrão :3408 e :3108 — o par do
 * agente H; ajuste com WEB_URL).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "./e2e-shots-h",
);
mkdirSync(outDir, { recursive: true });
const WEB = process.env.WEB_URL ?? "http://localhost:3108";
const sufixo = Date.now().toString(36).slice(-5);
const ANA = { user: `ana${sufixo}`, pass: "senha123" };
const BETO = { user: `beto${sufixo}`, pass: "senha123" };

let n = 0;
const shot = async (page, nome) => {
  n += 1;
  const file = resolve(outDir, `${String(n).padStart(2, "0")}-${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const viewport = { width: 1440, height: 900 };

/** Erros de console/página vão para o terminal — é o que explica um passo travado. */
function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
  page.on("response", (r) => r.status() >= 400 && console.log(`[${nome} http ${r.status()}]`, r.url()));
}

async function registrar(ctx, { user, pass }) {
  const page = await ctx.newPage();
  observar(page, user);
  await page.goto(`${WEB}/register`);
  await page.fill("#username", user);
  await page.fill("#password", pass);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return page;
}

const composer = 'textarea[aria-label="Mensagem para #geral"]';

try {
  const ctxA = await browser.newContext({ viewport, locale: "pt-BR" });
  const ctxB = await browser.newContext({ viewport, locale: "pt-BR" });

  // ── cenário: Ana cria o servidor e convida ────────────────
  const ana = await registrar(ctxA, ANA);
  await ana.click('button[aria-label="Adicionar um servidor"]');
  await ana.fill('input[aria-label="Criar um servidor"]', "Comunidade H");
  await ana.getByRole("button", { name: "Criar", exact: true }).click();
  await ana.waitForSelector("text=Bem-vindo a #geral!", { timeout: 20_000 });
  await ana.waitForTimeout(800);

  await ana.fill(composer, "Abrindo o canal. Sejam bem-vindos!");
  await ana.press(composer, "Enter");
  await ana.waitForTimeout(600);
  await shot(ana, "servidor-criado");

  // convite: o modal cria o link sozinho ao abrir
  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: /Convidar pessoas/ }).click();
  await ana.waitForFunction(
    () => document.querySelector('[role="dialog"] code')?.textContent?.includes("/invite/"),
    { timeout: 20_000 },
  );
  const url = (await ana.textContent('[role="dialog"] code')).trim();
  const code = url.split("/invite/")[1];
  await shot(ana, "convite-opcoes");
  await ana.getByRole("button", { name: "Editar convite" }).click();
  await ana.waitForTimeout(400);
  await shot(ana, "convite-editar");
  await ana.keyboard.press("Escape");
  console.log("convite:", url);

  // ── cenário 3: página pública do convite, sem login ───────
  const anon = await ctxB.newPage();
  observar(anon, "anon");
  await anon.goto(`${WEB}/invite/${code}`);
  await anon.waitForSelector("text=Comunidade H", { timeout: 20_000 });
  await anon.waitForTimeout(600);
  await shot(anon, "convite-pagina-publica");
  // sem sessão, o botão manda para o login guardando o destino
  await anon.getByRole("button", { name: /Entrar para aceitar/ }).click();
  await anon.waitForURL("**/login?next=**", { timeout: 20_000 });
  await shot(anon, "convite-manda-para-login");
  await anon.close();

  // Beto se registra e aceita o convite pela própria página
  const beto = await registrar(ctxB, BETO);
  await beto.goto(`${WEB}/invite/${code}`);
  await beto.waitForSelector("text=Comunidade H", { timeout: 20_000 });
  await shot(beto, "convite-logado");
  await beto.getByRole("button", { name: "Aceitar convite" }).click();
  await beto.waitForURL("**/app", { timeout: 20_000 });
  await beto.waitForTimeout(2000);
  await shot(beto, "beto-entrou");

  await beto.fill(composer, "Cheguei pelo convite!");
  await beto.press(composer, "Enter");
  await beto.waitForTimeout(1200);

  // ── cenário 4: enquete votada por dois usuários ao vivo ───
  await ana.click('button[aria-label="Anexar arquivo ou criar enquete"]');
  await ana.getByRole("menuitem", { name: "Enquete" }).click();
  await ana.waitForSelector("#poll-question", { timeout: 20_000 });
  await ana.fill("#poll-question", "Qual dia fica melhor?");
  await ana.fill('input[aria-label="Opção 1"]', "Sexta");
  await ana.fill('input[aria-label="Opção 2"]', "Sábado");
  await shot(ana, "enquete-modal");
  await ana.getByRole("button", { name: "Criar enquete" }).click();
  await ana.waitForSelector("text=Qual dia fica melhor?", { timeout: 20_000 });
  await ana.waitForTimeout(1000);
  await shot(ana, "enquete-criada");

  // Ana vota em Sexta
  await ana.getByRole("button", { name: "Sexta" }).click();
  await ana.waitForTimeout(800);
  await shot(ana, "enquete-ana-votou");

  // Beto vê a enquete e vota em Sábado — a contagem da Ana muda sozinha
  await beto.waitForSelector("text=Qual dia fica melhor?", { timeout: 20_000 });
  await beto.getByRole("button", { name: "Sábado" }).click();
  await beto.waitForTimeout(1200);
  await shot(beto, "enquete-beto-votou");
  await ana.waitForTimeout(800);
  await shot(ana, "enquete-ao-vivo-para-ana");

  // ── cenário 1: castigo bloqueia o envio ───────────────────
  await ana.click(`aside[aria-label="Membros"] button[aria-label^="Colocar de castigo"]`);
  await ana.waitForSelector("#timeout-reason", { timeout: 20_000 });
  await ana.fill("#timeout-reason", "teste de castigo");
  await shot(ana, "castigo-modal");
  await ana.getByRole("button", { name: "Colocar de castigo" }).click();
  await ana.waitForTimeout(1500);
  await shot(ana, "castigo-aplicado");

  // Beto perde o composer e ganha o aviso de até quando
  await beto.waitForSelector("text=Você está de castigo", { timeout: 20_000 });
  await beto.waitForTimeout(500);
  await shot(beto, "castigo-bloqueia-envio");

  // ── cenário 2: banimento com motivo no registro de auditoria ──
  await ana.click(`aside[aria-label="Membros"] button[aria-label^="Banir"]`);
  await ana.waitForSelector("#ban-reason", { timeout: 20_000 });
  await ana.fill("#ban-reason", "spam repetido no canal");
  await shot(ana, "banimento-modal");
  await ana.getByRole("button", { name: "Banir", exact: true }).click();
  await ana.waitForTimeout(2000);
  await shot(ana, "banimento-aplicado");

  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: "Registro de auditoria" }).click();
  await ana.waitForSelector("text=Membro banido", { timeout: 20_000 });
  await ana.waitForTimeout(800);
  await shot(ana, "auditoria-mostra-banimento");

  // as denúncias e a entrada/regras ficam na mesma tela
  await ana.getByRole("button", { name: "Denúncias" }).click();
  await ana.waitForTimeout(600);
  await shot(ana, "denuncias-aba");
  await ana.getByRole("button", { name: "Entrada e regras" }).click();
  await ana.waitForTimeout(600);
  await shot(ana, "entrada-e-regras");
  await ana.keyboard.press("Escape");

  // ── descobrir servidores ──────────────────────────────────
  await ana.click('button[aria-label="Descobrir servidores"]');
  await ana.waitForSelector("text=Descobrir servidores", { timeout: 20_000 });
  await ana.waitForTimeout(800);
  await shot(ana, "descobrir");

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
