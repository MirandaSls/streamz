/**
 * Passeio ponta a ponta de **cargos e permissões**, com screenshots.
 *
 * Cobre o que a frente c-cargos entregou, na ordem em que um dono usaria:
 * criar cargo com cor → atribuir a alguém → ver o nome colorido na lista, na
 * mensagem e no perfil → negar SEND_MESSAGES num canal e ver o composer
 * bloqueado → devolver a permissão pelo cargo → transferir a posse.
 *
 *   node scripts/e2e-cargos.mjs --out ./e2e-cargos
 *
 * Pré-requisitos: API e web no ar. Aponte com WEB_URL/API_URL (o padrão é o
 * ambiente do agente C: web em :3103, API em :3403).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "./e2e-cargos",
);
mkdirSync(outDir, { recursive: true });
const WEB = process.env.WEB_URL ?? "http://localhost:3103";

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

const API = process.env.API_URL ?? "http://localhost:3403";
const sufixo = Date.now().toString(36).slice(-5);
const DONA = { user: `dona${sufixo}`, pass: "Xk9#vWq2pLm7!" };
const MEMBRO = { user: `membro${sufixo}`, pass: "Xk9#vWq2pLm7!" };

let n = 0;
const shot = async (page, nome) => {
  n += 1;
  const file = resolve(outDir, `${String(n).padStart(2, "0")}-${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

/** Falha alto: um passo que não aconteceu não pode passar por "ok". */
function checar(condicao, mensagem) {
  if (condicao) {
    console.log("  ✓", mensagem);
    return;
  }
  throw new Error(`FALHOU: ${mensagem}`);
}

function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
  page.on(
    "response",
    (r) => r.status() >= 400 && console.log(`[${nome} http ${r.status()}]`, r.url()),
  );
}

async function registrar(ctx, { user, pass }) {
  const page = await ctx.newPage();
  observar(page, user);
  await page.goto(`${WEB}/register`);
  await preencherCredenciais(page, user, pass);
  await page.click('button[type="submit"]');
  await esperarApp(page, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  return page;
}

/** O chevron do cabeçalho do servidor (coluna 2) abre o menu do servidor. */
const MENU_DO_SERVIDOR = 'aside button[aria-haspopup="menu"]';

/** Abre as configurações do servidor numa aba específica. */
async function abrirConfiguracoes(page, aba) {
  await page.click(MENU_DO_SERVIDOR);
  await page.getByRole("menuitem", { name: "Configurações do servidor" }).click();
  await page.getByRole("button", { name: aba, exact: true }).click();
  await page.waitForTimeout(600);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const viewport = { width: 1440, height: 900 };

try {
  console.log(`web: ${WEB} · api: ${API}`);
  const ctxA = await browser.newContext({ viewport, locale: "pt-BR" });
  const ctxB = await browser.newContext({ viewport, locale: "pt-BR" });

  const dona = await registrar(ctxA, DONA);

  // ── 1. servidor novo já nasce com @everyone e Administrador ──
  await dona.click('button[aria-label="Adicionar um servidor"]');
  await dona.fill('input[aria-label="Criar um servidor"]', "Servidor de Cargos");
  await dona.getByRole("button", { name: "Criar", exact: true }).click();
  await dona.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await dona.waitForTimeout(800);
  await shot(dona, "servidor-criado");

  // convida o segundo usuário
  await dona.click(MENU_DO_SERVIDOR);
  await dona.getByRole("menuitem", { name: "Convidar pessoas" }).click();
  await dona.waitForTimeout(1500);
  const codigo = await dona.locator("code").first().innerText();
  checar(!!codigo, `convite criado (${codigo})`);
  await dona.keyboard.press("Escape");

  const membro = await registrar(ctxB, MEMBRO);
  await membro.click('button[aria-label="Entrar com convite"]');
  await membro.fill('input[aria-label="Entrar em um servidor"]', codigo.trim());
  await membro.getByRole("button", { name: "Entrar", exact: true }).click();
  await membro.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await membro.waitForTimeout(1000);
  await shot(membro, "membro-entrou");

  // o membro manda uma mensagem — o nome dele ainda está sem cor
  const composer = 'textarea[aria-label="Mensagem para #geral"]';
  await membro.fill(composer, "Cheguei! Ainda sem cargo nenhum.");
  await membro.press(composer, "Enter");
  await membro.waitForTimeout(800);

  // ── 2. criar cargo com cor ──
  await abrirConfiguracoes(dona, "Cargos");
  await shot(dona, "configuracoes-cargos");
  await dona.getByRole("button", { name: "Criar cargo" }).click();
  await dona.waitForTimeout(800);
  await dona.fill("#roleName", "Moderação");
  await dona.getByRole("button", { name: "Cor #e91e63" }).click();
  await dona.getByRole("switch", { name: "Exibir membros separadamente" }).click();
  await dona.getByRole("switch", { name: "Gerenciar mensagens" }).click();
  await dona.getByRole("button", { name: "Salvar alterações" }).click();
  await dona.waitForTimeout(1000);
  await shot(dona, "cargo-criado");
  checar(
    await dona.getByRole("switch", { name: "Gerenciar mensagens" }).getAttribute("aria-checked") ===
      "true",
    "cargo Moderação salvo com cor, hoist e MANAGE_MESSAGES",
  );

  // ── 3. atribuir o cargo ao membro ──
  await dona.getByRole("button", { name: "Membros", exact: true }).click();
  await dona.waitForTimeout(600);
  await dona.getByRole("button", { name: `Adicionar cargo a ${MEMBRO.user}` }).click();
  await dona.waitForTimeout(300);
  await dona.getByText("Moderação", { exact: true }).last().click();
  await dona.waitForTimeout(1000);
  await shot(dona, "cargo-atribuido");
  await dona.getByRole("button", { name: "Fechar configurações" }).click();
  await dona.waitForTimeout(800);

  // ── 4. nome colorido na lista de membros e no autor da mensagem ──
  await shot(dona, "nome-colorido");
  const corDoNome = await dona
    .locator(`aside[aria-label="Membros"] span:text-is("${MEMBRO.user}")`)
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  checar(
    corDoNome === "rgb(233, 30, 99)",
    `nome do membro na cor do cargo (${corDoNome})`,
  );
  const secao = await dona
    .locator('aside[aria-label="Membros"] h3', { hasText: "MODERAÇÃO" })
    .count();
  checar(secao > 0, "lista de membros tem seção do cargo com hoist");

  // ── 5. negar SEND_MESSAGES no @everyone e ver o composer bloqueado ──
  await abrirConfiguracoes(dona, "Cargos");
  await dona.getByRole("button", { name: /@everyone/ }).click();
  await dona.waitForTimeout(500);
  await dona.getByRole("switch", { name: "Enviar mensagens" }).click();
  await dona.getByRole("button", { name: "Salvar alterações" }).click();
  await dona.waitForTimeout(1200);
  await dona.getByRole("button", { name: "Fechar configurações" }).click();
  await membro.waitForTimeout(2500);
  await membro.reload();
  await membro.waitForTimeout(2500);
  await shot(membro, "composer-bloqueado");
  const bloqueado = await membro
    .getByText("Você não tem permissão para enviar mensagens neste canal.")
    .count();
  checar(bloqueado > 0, "membro sem SEND_MESSAGES vê o composer bloqueado");

  // devolve a permissão para não deixar o servidor mudo
  await abrirConfiguracoes(dona, "Cargos");
  await dona.getByRole("button", { name: /@everyone/ }).click();
  await dona.waitForTimeout(500);
  await dona.getByRole("switch", { name: "Enviar mensagens" }).click();
  await dona.getByRole("button", { name: "Salvar alterações" }).click();
  await dona.waitForTimeout(1200);

  // ── 6. transferir a posse ──
  await dona.getByRole("button", { name: "Membros", exact: true }).click();
  await dona.waitForTimeout(600);
  await dona.getByRole("button", { name: `Transferir posse para ${MEMBRO.user}` }).click();
  await dona.waitForTimeout(600);
  await shot(dona, "transferir-posse-confirmacao");
  await dona.fill('input[aria-label="Transferir a posse do servidor"]', "Servidor de Cargos");
  await dona.getByRole("button", { name: "Transferir posse" }).last().click();
  await dona.waitForTimeout(2000);
  await shot(dona, "posse-transferida");
  await membro.waitForTimeout(1500);
  await shot(membro, "membro-virou-dono");
  const coroa = await membro
    .locator(`aside[aria-label="Membros"] [aria-label="Dono do servidor"]`)
    .count();
  checar(coroa > 0, "a coroa passou para o novo dono");

  console.log("\n✅ passeio de cargos concluído. Capturas em", outDir);
} catch (e) {
  console.error("\n❌", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
