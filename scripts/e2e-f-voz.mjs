/**
 * Passeio ponta a ponta da voz (agente f-voz), com screenshots.
 *
 * Cobre o que **não** depende de servidor de mídia — que é justamente o ponto
 * do recorte: sem LiveKit configurado a sala de voz continua tendo gente, a
 * chamada em DM continua tocando, e é isso que precisa estar de pé.
 *
 * Roteiro:
 *   1. Ana cria servidor + canal de voz e entra na sala.
 *   2. Beto entra pelo convite e **vê a Ana na barra lateral** (o `voice.state`).
 *   3. Beto entra na mesma sala; os dois se veem na grade do painel.
 *   4. Ana liga para o Beto na conversa direta; o modal toca no Beto.
 *   5. Beto recusa; Ana liga de novo e Beto aceita — barra "Chamada em andamento".
 *
 *   node scripts/e2e-f-voz.mjs --out C:/tmp/shots-voz
 *
 * Pré-requisitos: API e web no ar (WEB_URL aponta para a web; padrão :3106).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "./e2e-shots-voz",
);
mkdirSync(outDir, { recursive: true });
const WEB = process.env.WEB_URL ?? "http://localhost:3106";

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

// E2E_SUFIXO fixa as contas do passeio: com ele a rodada seguinte reaproveita
// os mesmos usuarios (o registro so aceita 5 contas por hora).
const sufixo = process.env.E2E_SUFIXO ?? Date.now().toString(36).slice(-5);
const ANA = { user: `ana${sufixo}`, pass: "Xk9#vWq2pLm7!" };
const BETO = { user: `beto${sufixo}`, pass: "Xk9#vWq2pLm7!" };

let n = 0;
const shot = async (page, nome) => {
  n += 1;
  const file = resolve(outDir, `${String(n).padStart(2, "0")}-${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

const falhas = [];
/** Uma verificação do roteiro; o script segue mesmo falhando, para render o passeio inteiro. */
async function conferir(nome, fn) {
  try {
    await fn();
    console.log("✅", nome);
  } catch (e) {
    falhas.push(nome);
    console.log("❌", nome, "—", e.message.split("\n")[0]);
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const viewport = { width: 1440, height: 900 };

function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
  page.on("response", (r) => r.status() >= 400 && console.log(`[${nome} http ${r.status()}]`, r.url()));
}

/**
 * Registra (ou entra, quando o registro bate no teto de 5/hora do throttler).
 * Rodar o passeio varias vezes seguidas e o caso normal ao desenvolver.
 */
async function registrar(ctx, { user, pass }) {
  const page = await ctx.newPage();
  observar(page, user);
  await page.goto(`${WEB}/register`);
  await preencherCredenciais(page, user, pass);
  await page.click('button[type="submit"]');
  try {
    await esperarApp(page, { timeout: 15_000 });
  } catch {
    await page.goto(`${WEB}/login`);
    await preencherCredenciais(page, user, pass);
    await page.click('button[type="submit"]');
    await esperarApp(page, { timeout: 20_000 });
  }
  await page.waitForTimeout(1500);
  return page;
}

try {
  // o browser precisa "conceder" microfone/câmera: sem isso o getUserMedia do
  // enumerateDevices trava o passeio pedindo permissão
  const opts = { viewport, locale: "pt-BR", permissions: ["microphone", "camera"] };
  const ctxA = await browser.newContext(opts);
  const ctxB = await browser.newContext(opts);

  const ana = await registrar(ctxA, ANA);

  // ── 1. servidor + canal de voz ──────────────────────────────
  await ana.click('button[aria-label="Adicionar um servidor"]');
  await ana.fill('input[aria-label="Criar um servidor"]', "Time de Voz");
  await ana.getByRole("button", { name: "Criar", exact: true }).click();
  await ana.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });

  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: /Criar canal/ }).click();
  await ana.fill('input[aria-label="Nome do canal"]', "sala-de-voz");
  await ana.getByRole("group", { name: "Tipo do canal" }).getByRole("button", { name: "Voz" }).click();
  await ana.getByRole("button", { name: "Criar canal", exact: true }).click();
  await ana.waitForTimeout(1200);
  await shot(ana, "canal-de-voz-criado");

  await ana.getByRole("button", { name: "sala-de-voz" }).click();
  await ana.waitForTimeout(2000);
  await shot(ana, "ana-na-sala");

  await conferir("Ana entra na sala e o painel mostra 'Voz não configurada'", async () => {
    await ana.waitForSelector("text=/Voz não configurada/", { timeout: 10_000 });
  });
  await conferir("a barra da call aparece no rodapé da coluna 2", async () => {
    await ana.waitForSelector("[data-voice-bar]", { timeout: 5_000 });
  });
  await conferir("Ana aparece na lista da sala, na barra lateral", async () => {
    await ana.waitForSelector("[data-voice-member]", { timeout: 5_000 });
  });

  // os ajustes de voz (a mesma aba "Voz e vídeo") abrem de dentro da call
  await ana.click('button[aria-label="Ajustes de voz"]');
  await ana.waitForTimeout(800);
  await shot(ana, "ajustes-de-voz");
  await conferir("os ajustes de voz listam dispositivos e push-to-talk", async () => {
    await ana.waitForSelector('[role="dialog"] select[disabled], [role="dialog"] select', { timeout: 5_000 });
    await ana.waitForSelector('[aria-label="Definir a tecla de push-to-talk"]', { timeout: 5_000 });
  });
  await ana.keyboard.press("Escape");
  await ana.waitForTimeout(400);

  // convite para o Beto
  await ana.click('button[aria-haspopup="menu"]');
  await ana.getByRole("menuitem", { name: /Convidar pessoas/ }).click();
  await ana.waitForSelector('[role="dialog"] code');
  const code = (await ana.textContent('[role="dialog"] code'))?.trim();
  await ana.keyboard.press("Escape");

  // ── 2. Beto vê o estado de voz da Ana ───────────────────────
  const beto = await registrar(ctxB, BETO);
  await beto.click('button[aria-label="Entrar com convite"]');
  await beto.fill('input[aria-label="Entrar em um servidor"]', code);
  await beto.getByRole("button", { name: "Entrar", exact: true }).click();
  await beto.waitForSelector("text=Bem-vindo a #geral!", { timeout: 15_000 });
  await beto.waitForTimeout(2000);
  await shot(beto, "beto-ve-ana-na-voz");

  await conferir("Beto vê a Ana na sala de voz sem estar nela", async () => {
    await beto.waitForSelector("[data-voice-member]", { timeout: 10_000 });
  });

  // ── 3. Beto entra na mesma sala ─────────────────────────────
  await beto.getByRole("button", { name: "sala-de-voz" }).click();
  await beto.waitForTimeout(2500);
  await shot(beto, "beto-na-sala");
  await ana.waitForTimeout(1000);
  await shot(ana, "ana-ve-beto-chegar");

  await conferir("os dois aparecem na grade do painel", async () => {
    const tiles = await beto.locator("[data-voice-tile]").count();
    if (tiles < 2) throw new Error(`esperava 2 tiles na grade, veio ${tiles}`);
  });
  await conferir("a sala da Ana passa a mostrar dois participantes", async () => {
    const membros = await ana.locator("[data-voice-member]").count();
    if (membros < 2) throw new Error(`esperava 2 na barra lateral, veio ${membros}`);
  });

  // mudo pelo rodapé: o outro lado tem de ver o ícone vermelho
  await beto.click('button[aria-label="Silenciar"]');
  await ana.waitForTimeout(1200);
  await shot(ana, "ana-ve-beto-mudo");
  await conferir("mudo do Beto chega na barra lateral da Ana", async () => {
    await ana.waitForSelector('[aria-label="Mudo"]', { timeout: 5_000 });
  });

  // sair da voz antes da chamada: uma conexão de voz por usuário
  await beto.click('[data-voice-bar] button[aria-label="Desconectar"]');
  await ana.click('[data-voice-bar] button[aria-label="Desconectar"]');
  await ana.waitForTimeout(1000);

  // ── 4. chamada em conversa direta ───────────────────────────
  await ana.click('button[aria-label="Mensagens diretas"]').catch(() => {});
  await ana.fill('input[aria-label="Encontrar ou começar uma conversa"]', BETO.user);
  await ana.waitForTimeout(1200);
  await ana.getByRole("listitem").filter({ hasText: BETO.user }).first().click();
  await ana.waitForTimeout(1500);

  await ana.click('button[aria-label="Iniciar chamada de voz"]');
  await ana.waitForTimeout(1500);
  await shot(ana, "ana-ligou");
  await beto.waitForTimeout(1000);
  await shot(beto, "beto-recebe-chamada");

  await conferir("o modal de chamada recebida toca no Beto", async () => {
    await beto.waitForSelector('[role="dialog"]:has-text("Chamada recebida")', { timeout: 10_000 });
  });

  // ── 5. recusar e, depois, aceitar ───────────────────────────
  await beto.click('button[aria-label="Recusar chamada"]');
  await beto.waitForTimeout(1200);
  await shot(ana, "ana-viu-recusa");
  await conferir("recusar fecha o modal do Beto", async () => {
    const abertos = await beto.locator('[role="dialog"]:has-text("Chamada recebida")').count();
    if (abertos > 0) throw new Error("o modal continuou aberto depois de recusar");
  });

  await ana.waitForTimeout(1500);
  await ana.click('button[aria-label="Iniciar chamada de voz"]');
  await beto.waitForSelector('[role="dialog"]:has-text("Chamada recebida")', { timeout: 10_000 });
  await beto.click('button[aria-label="Atender chamada"]');
  await beto.waitForTimeout(2500);
  await shot(beto, "beto-atendeu");
  await ana.waitForTimeout(1000);
  await shot(ana, "ana-em-chamada");

  await conferir("a barra 'Chamada em andamento' aparece nos dois lados", async () => {
    await beto.waitForSelector("[data-call-banner]", { timeout: 10_000 });
    await ana.waitForSelector("[data-call-banner]", { timeout: 10_000 });
  });
  await conferir("a conversa ganha o ícone verde de chamada na lista de DMs", async () => {
    await beto.waitForSelector("[data-dm-call]", { timeout: 10_000 });
  });

  await beto.click('[data-call-banner] button:has-text("Desligar")');
  await beto.waitForTimeout(1500);
  await shot(beto, "beto-desligou");
} catch (e) {
  // um passo do roteiro que estourou não pode virar "passeio completo": é uma
  // falha como outra qualquer, só que interrompe o resto
  falhas.push(`o roteiro parou: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  console.log(falhas.length === 0 ? "\n✅ passeio completo" : `\n❌ falhas: ${falhas.join(" · ")}`);
  process.exitCode = falhas.length === 0 ? 0 : 1;
}
