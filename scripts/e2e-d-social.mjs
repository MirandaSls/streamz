/**
 * Passeio ponta a ponta do social (d-social), com screenshots.
 *
 * Cobre o que o briefing pede: pedir amizade entre dois usuários, aceitar, ver
 * o amigo na aba Online, definir status personalizado e vê-lo do outro lado,
 * bloquear e conferir que a DM é recusada.
 *
 *   node scripts/e2e-d-social.mjs --out ./e2e-shots-social
 *
 * Pré-requisitos: API e web do agente D no ar (WEB_URL aponta para a web).
 *
 * O registro tem teto de 5 contas por hora por IP (AUTH_REGISTER_THROTTLE) e o
 * passeio cria 3: em execuções seguidas, reinicie a API para zerar o contador
 * (o throttler é em memória quando não há REDIS_URL).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "./e2e-shots-social",
);
mkdirSync(outDir, { recursive: true });
const WEB = process.env.WEB_URL ?? "http://localhost:3104";
const sufixo = Date.now().toString(36).slice(-5);
const ANA = { user: `ana${sufixo}`, pass: "senha123" };
const BETO = { user: `beto${sufixo}`, pass: "senha123" };
const CAIO = { user: `caio${sufixo}`, pass: "senha123" };

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
  page.on("response", (r) => r.status() >= 500 && console.log(`[${nome} http ${r.status()}]`, r.url()));
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

/** Abre a página Amigos (a home do modo DM) e a aba pedida. */
async function abrirAmigos(page, aba) {
  await page.click('button[aria-label="Mensagens diretas"]').catch(() => {});
  await page.waitForTimeout(600);
  // o item da barra lateral leva o badge de pedidos ("Amigos 1 pedido…"),
  // então casamos pelo começo do nome acessível, não pelo nome exato.
  await page.getByRole("button", { name: /^Amigos/ }).first().click();
  await page.waitForTimeout(600);
  if (aba) {
    // a aba "Pendentes" carrega o badge de contagem dentro do botão, então o
    // nome acessível é "Pendentes 1" — casamos pelo começo, não exato.
    await page.getByRole("button", { name: new RegExp(`^${aba}`) }).first().click();
    await page.waitForTimeout(600);
  }
}

/** Confere uma condição e falha o passeio com um erro legível. */
function conferir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
  console.log("✓", mensagem);
}

try {
  const ctxA = await browser.newContext({ viewport, locale: "pt-BR" });
  const ctxB = await browser.newContext({ viewport, locale: "pt-BR" });
  const ctxC = await browser.newContext({ viewport, locale: "pt-BR" });

  const ana = await registrar(ctxA, ANA);
  const beto = await registrar(ctxB, BETO);
  const caio = await registrar(ctxC, CAIO);

  // ── 1. Ana pede amizade ao Beto pelo nome de usuário ──
  await abrirAmigos(ana, "Adicionar amigo");
  await shot(ana, "adicionar-amigo");
  await ana.fill('input[aria-label="Nome de usuário"]', BETO.user);
  await ana.getByRole("button", { name: "Enviar pedido de amizade" }).click();
  await ana.waitForTimeout(1200);
  await shot(ana, "pedido-enviado");

  // ── 2. Beto vê o pedido e aceita ──
  await abrirAmigos(beto, "Pendentes");
  await beto.waitForSelector("text=Pedido de amizade recebido", { timeout: 15_000 });
  await shot(beto, "pedido-recebido");
  await beto.click(`button[aria-label="Aceitar"]`);
  await beto.waitForTimeout(1500);

  // ── 3. Os dois se veem na aba Online ──
  await abrirAmigos(beto, "Online");
  await beto.waitForTimeout(800);
  await shot(beto, "beto-aba-online");
  conferir(
    await beto.getByText(`@${ANA.user}`, { exact: false }).first().isVisible(),
    "Beto vê Ana na aba Online",
  );

  await abrirAmigos(ana, "Online");
  await ana.waitForTimeout(800);
  await shot(ana, "ana-aba-online");
  conferir(
    await ana.getByText(`@${BETO.user}`, { exact: false }).first().isVisible(),
    "Ana vê Beto na aba Online",
  );

  // ── 4. Ana define um status personalizado; Beto o enxerga ──
  await ana.click('button[aria-label="Meu perfil"]');
  await ana.waitForTimeout(500);
  await ana.getByRole("button", { name: /status personalizado/ }).click();
  await ana.waitForSelector("#statusText", { timeout: 15_000 });
  await ana.fill("#statusText", "escrevendo o MVP");
  await shot(ana, "status-personalizado-modal");
  await ana.getByRole("button", { name: "Salvar", exact: true }).click();
  await ana.waitForTimeout(1500);
  await shot(ana, "status-personalizado-aplicado");

  await beto.reload();
  await beto.waitForTimeout(2500);
  await abrirAmigos(beto, "Todos");
  await beto.waitForTimeout(1000);
  await shot(beto, "beto-ve-status");
  conferir(
    await beto.getByText("escrevendo o MVP").first().isVisible(),
    "Beto vê o status personalizado da Ana",
  );

  // ── 5. Ana abre uma DM com o Beto e conversa ──
  await abrirAmigos(ana, "Todos");
  await ana.click(`button[aria-label="Conversar com ${BETO.user}"]`);
  await ana.waitForSelector(`textarea[aria-label="Mensagem para ${BETO.user}"]`, { timeout: 15_000 });
  await ana.fill(`textarea[aria-label="Mensagem para ${BETO.user}"]`, "Oi! Somos amigos agora.");
  await ana.press(`textarea[aria-label="Mensagem para ${BETO.user}"]`, "Enter");
  await ana.waitForTimeout(1500);
  await shot(ana, "dm-entre-amigos");

  // ── 6. Ana abre o perfil completo do Beto pelo popover ──
  await abrirAmigos(ana, "Todos");
  await ana.click(`button[aria-label="Perfil de ${BETO.user}"]`);
  await ana.waitForTimeout(600);
  await ana.getByRole("button", { name: "Ver perfil completo" }).click();
  await ana.waitForTimeout(900);
  await shot(ana, "perfil-completo");
  conferir(
    await ana.getByText("Membro desde", { exact: false }).first().isVisible(),
    "o modal de perfil mostra “Membro desde”",
  );
  await ana.keyboard.press("Escape");
  await ana.waitForTimeout(400);

  // ── 7. Ana cria um grupo com Beto e Caio, renomeia e vê a mensagem de sistema ──
  await ana.click('button[aria-label="Criar grupo"]');
  await ana.waitForSelector('input[aria-label="Buscar usuário"]', { timeout: 15_000 });
  for (const alvo of [BETO.user, CAIO.user]) {
    await ana.fill('input[aria-label="Buscar usuário"]', alvo);
    await ana.waitForTimeout(1200);
    // escopo no diálogo: o mesmo "@usuário" existe na lista de amigos atrás dele
    await ana.getByRole("dialog").getByText(`@${alvo}`, { exact: true }).first().click();
  }
  await shot(ana, "criar-grupo");
  await ana.getByRole("dialog").getByRole("button", { name: "Criar grupo" }).click();
  await ana.waitForSelector('button[aria-label="Configurações do grupo"]', { timeout: 20_000 });
  await ana.waitForTimeout(1000);

  // a coluna de participantes já vem aberta; o botão é um interruptor
  if ((await ana.locator('aside[aria-label="Participantes da conversa"]').count()) === 0) {
    await ana.click('button[aria-label="Mostrar participantes"]');
    await ana.waitForTimeout(600);
  }
  await shot(ana, "grupo-participantes");
  conferir(
    (await ana.locator('aside[aria-label="Participantes da conversa"] [role="listitem"]').count()) === 3,
    "a coluna de participantes do grupo lista os 3",
  );

  await ana.click('button[aria-label="Configurações do grupo"]');
  await ana.waitForSelector("#groupName", { timeout: 15_000 });
  await ana.fill("#groupName", "Time do MVP");
  await ana.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await ana.waitForTimeout(1500);
  await shot(ana, "grupo-renomeado");
  conferir(
    await ana.getByText("mudou o nome do grupo para Time do MVP", { exact: false }).first().isVisible(),
    "a mensagem de sistema do rename aparece na conversa",
  );

  // Caio vê o grupo e o fecha: some da lista dele (DMHidden)
  await caio.reload();
  await caio.waitForTimeout(3000);
  // quem não está em servidor nenhum abre no modo servidor: entra no modo DM
  await abrirAmigos(caio);
  conferir(
    await caio.getByRole("list", { name: "Conversas" }).getByText("Time do MVP").first().isVisible(),
    "Caio vê o grupo na lista de conversas",
  );
  await caio.click('button[aria-label="Sair do grupo Time do MVP"]');
  await caio.waitForSelector("text=Sair do grupo?", { timeout: 15_000 });
  await caio.getByRole("button", { name: "Sair", exact: true }).click();
  await caio.waitForTimeout(1500);
  await shot(caio, "caio-saiu-do-grupo");
  conferir(
    (await caio.getByRole("list", { name: "Conversas" }).getByText("Time do MVP").count()) === 0,
    "o grupo some da lista do Caio depois de sair",
  );

  // Ana fecha a conversa 1-a-1 com o Beto: some da lista até chegar algo novo
  await ana.click(`button[aria-label="Fechar conversa com ${BETO.user}"]`);
  await ana.waitForTimeout(1500);
  await shot(ana, "ana-fechou-a-dm");
  conferir(
    (await ana.getByRole("list", { name: "Conversas" }).getByText(BETO.user, { exact: false }).count()) === 0,
    "a conversa fechada some da lista da Ana",
  );

  // ── 8. Beto bloqueia a Ana: a relação some e a DM dela é recusada ──
  await abrirAmigos(beto, "Todos");
  await beto.click(`button[aria-label="Mais opções para ${ANA.user}"]`);
  await beto.waitForTimeout(400);
  await shot(beto, "menu-do-amigo");
  await beto.getByRole("menuitem", { name: "Bloquear" }).click();
  await beto.waitForTimeout(400);
  await beto.getByRole("button", { name: "Bloquear", exact: true }).click();
  await beto.waitForTimeout(1500);
  await abrirAmigos(beto, "Bloqueados");
  await beto.waitForTimeout(800);
  await shot(beto, "beto-bloqueados");
  conferir(
    await beto.getByText(`@${ANA.user}`, { exact: false }).first().isVisible(),
    "Ana aparece na aba Bloqueados do Beto",
  );

  // a Ana tenta reabrir a conversa: a API recusa e a UI avisa
  await ana.reload();
  await ana.waitForTimeout(2500);
  await abrirAmigos(ana, "Todos");
  await ana.waitForTimeout(800);
  await shot(ana, "ana-perdeu-o-amigo");

  const recusa = ana.waitForResponse(
    (r) => r.url().includes("/api/dms") && r.request().method() === "POST" && r.status() === 403,
    { timeout: 15_000 },
  );
  await ana.evaluate(async (betoUser) => {
    // busca o id do Beto e tenta abrir a DM direto pela API, como faz a UI
    const token = localStorage.getItem("accessToken");
    const base = window.location.origin.replace("3104", "3404");
    const achados = await fetch(`${base}/api/users/search?q=${betoUser}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    const alvo = achados[0];
    if (!alvo) return;
    await fetch(`${base}/api/dms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: alvo.id }),
    });
  }, BETO.user);
  await recusa;
  conferir(true, "abrir DM com quem bloqueou responde 403");
  await shot(ana, "dm-recusada");

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
