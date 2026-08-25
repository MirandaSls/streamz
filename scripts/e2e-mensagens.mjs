/**
 * Passeio ponta a ponta das features de mensagem: responder (com "@ ligado"),
 * fixar (com a mensagem de sistema e o painel de fixadas), thread nomeada,
 * caixa de entrada, busca com filtros e "ir para a mensagem".
 *
 * Usa o Chrome/Edge já instalado (playwright-core, sem download de browser).
 *
 *   node scripts/e2e-mensagens.mjs --out ./e2e-shots-mensagens
 *
 * Pré-requisitos: API e web no ar. `WEB_URL` aponta para a web (padrão :3101).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(
  process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : "./e2e-shots-mensagens",
);
mkdirSync(outDir, { recursive: true });
const WEB = process.env.WEB_URL ?? "http://localhost:3101";
const sufixo = Date.now().toString(36).slice(-5);
const ANA = { user: `ana${sufixo}`, pass: "senha123" };
const BETO = { user: `beto${sufixo}`, pass: "senha123" };
const composer = 'textarea[aria-label="Mensagem para #geral"]';

let n = 0;
const shot = async (page, nome) => {
  n += 1;
  const file = resolve(outDir, `${String(n).padStart(2, "0")}-${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
  page.on("response", (r) => r.status() >= 400 && console.log(`[${nome} http ${r.status()}]`, r.url()));
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
// o servidor de desenvolvimento compila as rotas na primeira visita: prazos folgados
const PRAZO = 60_000;
const viewport = { width: 1440, height: 900 };

async function registrar(ctx, { user, pass }) {
  const page = await ctx.newPage();
  observar(page, user);
  await page.goto(`${WEB}/register`, { timeout: 120_000 });
  await page.fill("#username", user);
  await page.fill("#password", pass);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 120_000 });
  await page.waitForTimeout(1500);
  return page;
}

/** Envia uma mensagem no canal aberto e espera o eco do servidor. */
async function enviar(page, texto) {
  await page.fill(composer, texto);
  await page.press(composer, "Enter");
  await page.waitForTimeout(700);
}

/**
 * Passa o mouse na mensagem e clica num botão da barra de ações dela. Usa a
 * *primeira* ocorrência do trecho porque a linha de referência de uma resposta
 * repete o texto da original.
 */
async function acaoNaMensagem(page, trecho, rotulo) {
  const linha = page.locator(".group", { hasText: trecho }).first();
  await linha.hover();
  await linha.getByRole("button", { name: rotulo, exact: true }).first().click();
}

try {
  const ctxA = await browser.newContext({ viewport, locale: "pt-BR" });
  const ctxB = await browser.newContext({ viewport, locale: "pt-BR" });

  // ── cenário: Ana cria o servidor e convida o Beto ──
  const ana = await registrar(ctxA, ANA);
  await ana.click('button[aria-label="Adicionar um servidor"]');
  await ana.fill('input[aria-label="Criar um servidor"]', "Time de Produto");
  await ana.getByRole("button", { name: "Criar", exact: true }).click();
  await ana.waitForSelector("text=Bem-vindo a #geral!", { timeout: PRAZO });

  await enviar(ana, "Primeira mensagem do canal, para achar na busca depois.");
  await enviar(ana, "Alguém revisa o PR? https://github.com/exemplo/pr");
  await shot(ana, "canal-com-mensagens");

  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: /Convidar pessoas/ }).click();
  await ana.waitForSelector('[role="dialog"] code');
  const code = (await ana.textContent('[role="dialog"] code'))?.trim();
  await ana.keyboard.press("Escape");

  const beto = await registrar(ctxB, BETO);
  await beto.click('button[aria-label="Entrar com convite"]');
  await beto.fill('input[aria-label="Entrar em um servidor"]', code);
  await beto.getByRole("button", { name: "Entrar", exact: true }).click();
  await beto.waitForSelector("text=Bem-vindo a #geral!", { timeout: PRAZO });

  // ── 1. responder: a barra "@ ligado" e a linha de referência ──
  await acaoNaMensagem(beto, "Alguém revisa o PR", "Responder");
  await beto.waitForSelector("text=Respondendo a");
  await shot(beto, "barra-respondendo");
  await enviar(beto, "Eu reviso hoje.");
  await shot(beto, "resposta-na-timeline");

  // a Ana recebeu a resposta como menção (o "@" estava ligado)
  await ana.waitForTimeout(1000);
  await shot(ana, "ana-resposta-conta-como-mencao");

  // ── 2. fixar: sistema no canal + painel de fixadas ──
  await acaoNaMensagem(ana, "Primeira mensagem do canal", "Fixar mensagem");
  await ana.waitForSelector("text=fixou uma mensagem neste canal", { timeout: PRAZO });
  await shot(ana, "mensagem-de-sistema-fixou");
  await ana.click('button[aria-label="Mensagens fixadas"]');
  await ana.waitForSelector('[role="dialog"][aria-label="Mensagens fixadas"]');
  await shot(ana, "painel-fixadas");

  // ── 3. ir para a mensagem, a partir das fixadas ──
  await ana.getByRole("button", { name: "Ir para a mensagem" }).first().click();
  await ana.waitForTimeout(1200);
  await shot(ana, "ir-para-a-mensagem-destacada");

  // ── 4. thread nomeada ──
  await acaoNaMensagem(ana, "Alguém revisa o PR", "Criar thread");
  await ana.waitForSelector('input[aria-label="Criar thread"], [role="dialog"] input');
  await ana.fill('[role="dialog"] input', "revisão do PR");
  await ana.getByRole("button", { name: "Criar", exact: true }).click();
  await ana.waitForTimeout(1200);
  await shot(ana, "thread-criada");
  await ana.click('button[aria-label="Threads"]');
  await ana.waitForSelector('[role="dialog"][aria-label="Threads"]');
  await shot(ana, "painel-threads");
  await ana.keyboard.press("Escape");

  // ── 5. caixa de entrada do Beto (menção da Ana) ──
  await enviar(ana, `@${BETO.user} dá uma olhada nisso, por favor.`);
  await beto.waitForTimeout(1200);
  await beto.click('button[aria-label="Caixa de entrada"]');
  await beto.waitForSelector('[role="dialog"][aria-label="Caixa de entrada"]');
  await shot(beto, "caixa-de-entrada-mencoes");
  await beto.getByRole("button", { name: "Não lidos" }).click();
  await beto.waitForTimeout(400);
  await shot(beto, "caixa-de-entrada-nao-lidos");
  await beto.keyboard.press("Escape");

  // ── 6. busca com filtros, no painel da direita ──
  const busca = `input[aria-label="Buscar mensagens em geral"]`;
  await ana.fill(busca, `from:@${ANA.user} has:link`);
  await ana.press(busca, "Enter");
  await ana.waitForSelector('aside[aria-label="Resultados da busca"]', { timeout: PRAZO });
  await ana.waitForTimeout(800);
  await shot(ana, "busca-com-filtros");

  // e o "ir para" a partir de um resultado
  await ana.locator('aside[aria-label="Resultados da busca"] button').last().click();
  await ana.waitForTimeout(1200);
  await shot(ana, "busca-ir-para-mensagem");

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
