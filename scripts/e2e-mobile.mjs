/**
 * Passeio pelo leiaute de CELULAR, com capturas — o par móvel do
 * `e2e-visual.mjs`.
 *
 * Sobe dois usuários, cria servidor, canal e conversa (o mesmo enredo do
 * passeio de desktop) e depois reabre o app num contexto **emulado de
 * telefone** (`isMobile`, `hasTouch`, escala de tela real) para fotografar cada
 * tela do shell de abas.
 *
 *   node scripts/e2e-mobile.mjs --out /tmp/shots --web http://localhost:3001
 *
 * Opções:
 *   --perfil iphone|android   aparelho emulado (padrão: iphone)
 *   --semente                 só semeia os dados e sai (para reaproveitar depois)
 *   --usuario <nome>          reaproveita uma conta já semeada, sem criar nada
 *
 * Pré-requisitos: API e web no ar (ver o cabeçalho do `e2e-visual.mjs`).
 *
 * Por que emular e não só encolher a janela: o `viewport` sozinho não liga
 * `pointer: coarse`, não aplica o `<meta viewport>` da página e não entrega
 * eventos de toque — e é justamente disso que dependem o toque longo da
 * mensagem, o alvo de 44px e o `env(safe-area-inset-*)`.
 */
import { chromium, devices } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
};
const tem = (nome) => process.argv.includes(nome);

const outDir = resolve(arg("--out", "./e2e-shots-mobile"));
mkdirSync(outDir, { recursive: true });
const WEB = arg("--web", process.env.WEB_URL ?? "http://localhost:3000");

/**
 * Os dois aparelhos do enunciado. As escalas são as reais: o iPhone 14/15 tem
 * 390×844 pontos a 3×, e um Android grande fica em 412×915 a ~2,6× — as duas
 * densidades em que um erro de meio pixel aparece.
 */
const PERFIS = {
  iphone: {
    ...devices["iPhone 14"],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  },
  android: {
    ...devices["Pixel 7"],
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.6,
  },
};
const perfil = PERFIS[arg("--perfil", "iphone")] ?? PERFIS.iphone;

const E2E_EMAIL_DOMINIO = "e2e.streamz.test";
const SENHA = "Xk9#vWq2pLm7!";
const sufixo = arg("--usuario", null) ?? Date.now().toString(36).slice(-5);
const ANA = { user: `ana${sufixo}`, pass: SENHA };
const BETO = { user: `beto${sufixo}`, pass: SENHA };

const composer = 'textarea[aria-label="Mensagem para #geral"]';

const foto = async (page, nome) => {
  const file = resolve(outDir, `${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
}

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

async function entrar(ctx, { user, pass }, registrar) {
  const page = await ctx.newPage();
  observar(page, user);
  await page.goto(`${WEB}/${registrar ? "register" : "login"}`);
  await preencherCredenciais(page, user, pass);
  await page.click('button[type="submit"]');
  await esperarApp(page, { timeout: 45_000 });
  await page.waitForTimeout(1500);
  return page;
}

/** Toque longo de verdade: o `pointerdown` do dedo, não o do mouse. */
async function toqueLongo(page, ctx, locator, ms = 700) {
  const caixa = await locator.boundingBox();
  if (!caixa) throw new Error("elemento sem caixa para o toque longo");
  const x = caixa.x + caixa.width / 2;
  const y = caixa.y + caixa.height / 2;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }],
  });
  await page.waitForTimeout(ms);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--font-render-hinting=none", "--disable-lcd-text"],
});

try {
  // ── semear: o enredo do passeio de desktop, com dois usuários ────────────
  const seed = arg("--usuario", null) === null;
  if (seed) {
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
    const ana = await entrar(ctxA, ANA, true);

    await ana.click('button[aria-label="Adicionar um servidor"]');
    const criar = ana.getByRole("menuitem", { name: /Criar um servidor/ });
    if (await criar.count()) await criar.click();
    await ana.fill('[role="dialog"] input', "Time de Produto");
    await ana.getByRole("button", { name: "Criar", exact: true }).click();
    await ana.waitForSelector("text=Bem-vindo", { timeout: 20_000 });
    await ana.waitForTimeout(800);

    for (const texto of [
      "Bom dia, **time**! Hoje sai a versão nova.",
      "Documentação aqui: https://nextjs.org",
      "> alguém revisa o PR do leiaute?\nEu olho depois do almoço 👀",
    ]) {
      await ana.fill(composer, texto);
      await ana.press(composer, "Enter");
      await ana.waitForTimeout(400);
    }

    await ana.click('button[aria-haspopup="menu"]');
    await ana.getByRole("menuitem", { name: /Convidar pessoas/ }).click();
    // o convite sai como link num campo ("http://.../invite/<código>")
    let link = "";
    for (let i = 0; i < 40 && !link.includes("/invite/"); i++) {
      for (const campo of await ana.locator('[role="dialog"] input').all()) {
        const v = (await campo.inputValue()).trim();
        if (v.includes("/invite/")) link = v;
      }
      if (!link) await ana.waitForTimeout(500);
    }
    const code = link.split("/").pop();
    console.log("convite:", code);
    await ana.keyboard.press("Escape");

    const beto = await entrar(ctxB, BETO, true);
    // entrar pelo link, que é o caminho real de um convite
    await beto.goto(`${WEB}/invite/${code}`);
    await beto.getByRole("button", { name: /Aceitar convite|Entrar/ }).first().click();
    await esperarApp(beto, { timeout: 30_000 });
    // aceitar o convite cai na home; o servidor é escolhido no rail
    await beto.click('nav[aria-label="Servidores"] button[aria-label^="Time de Produto"]', { timeout: 30_000 });
    await beto.waitForSelector(composer, { timeout: 30_000 });
    await beto.waitForTimeout(1200);
    await beto.fill(composer, `Oi @${ANA.user}, cheguei! 🎉`);
    await beto.press(composer, "Enter");
    await beto.waitForTimeout(1200);

    // uma conversa direta, para a aba Mensagens não nascer vazia
    // o botão de conversa da linha do membro (aparece ao passar o mouse)
    await ana.hover(`aside[aria-label="Membros"] button[aria-label="Perfil de ${BETO.user}"]`);
    await ana.click(`aside[aria-label="Membros"] button[aria-label="Abrir conversa com ${BETO.user}"]`, {
      timeout: 20_000,
    });
    const dm = `textarea[aria-label="Mensagem para ${BETO.user}"]`;
    await ana.waitForSelector(dm, { timeout: 20_000 });
    await ana.fill(dm, "Bem-vindo! Qualquer coisa me chama por aqui.");
    await ana.press(dm, "Enter");
    await ana.waitForTimeout(800);
    await beto.waitForTimeout(500);
    await beto.click('button[aria-label^="Mensagens diretas"]').catch(() => undefined);
    await beto.waitForTimeout(800);
    const dmDoBeto = `textarea[aria-label="Mensagem para ${ANA.user}"]`;
    if (await beto.$(dmDoBeto)) {
      await beto.fill(dmDoBeto, "Valeu! Já entrei no servidor 🙌");
      await beto.press(dmDoBeto, "Enter");
      await beto.waitForTimeout(800);
    }

    console.log("semente pronta:", sufixo);
    await ctxA.close();
    await ctxB.close();
    if (tem("--semente")) {
      await browser.close();
      process.exit(0);
    }
  }

  // ── as capturas, num aparelho emulado ────────────────────────────────────
  const ctx = await browser.newContext({ ...perfil, locale: "pt-BR" });
  const page = await entrar(ctx, ANA, false);
  await page.waitForTimeout(2500);

  const aba = (nome) => page.locator(`nav[aria-label="Seções"] button`).filter({ hasText: nome });

  /**
   * A barra de abas some quando há tela empilhada (é o que o Discord faz).
   * Voltar até a base é, portanto, pré-requisito de trocar de aba.
   */
  async function irParaAba(nome) {
    for (let i = 0; i < 4; i++) {
      if (await page.locator('nav[aria-label="Seções"]').count()) break;
      await page.locator('button[aria-label="Voltar"]').first().click();
      await page.waitForTimeout(400);
    }
    await aba(nome).click();
  }

  // 01 — servidores: rail + lista de canais
  await irParaAba("Servidores");
  await page.waitForTimeout(1200);
  await foto(page, "01-servidores");

  // 02 — conversa do canal
  await page.locator("[data-channel-button]", { hasText: "geral" }).first().click();
  await page.waitForTimeout(1800);
  await foto(page, "02-chat-canal");

  // 03 — lista de membros (painel deslizante)
  await page.locator('button[aria-label="Membros"]').click();
  await page.waitForTimeout(700);
  await foto(page, "03-membros");
  await page.locator('button[aria-label="Fechar"]').click();
  await page.waitForTimeout(500);

  // 09 — menu da mensagem por toque longo
  const mensagem = page.locator("text=Hoje sai a versão nova").first();
  await toqueLongo(page, ctx, mensagem);
  await foto(page, "09-menu-mensagem");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 10 — composer com o teclado na tela (o teclado encolhe a janela)
  await page.locator("textarea").first().click();
  await page.locator("textarea").first().fill("Escrevendo com o teclado aberto");
  await page.setViewportSize({ width: perfil.viewport.width, height: 460 });
  await page.waitForTimeout(900);
  await foto(page, "10-composer-teclado");
  await page.setViewportSize(perfil.viewport);
  await page.waitForTimeout(600);
  await page.locator("textarea").first().fill("");

  // 04 — conversas
  await irParaAba("Mensagens");
  await page.waitForTimeout(1000);
  await foto(page, "04-dms");

  // 05 — conversa aberta
  await page.locator("[data-dm-button]").first().click();
  await page.waitForTimeout(1800);
  await foto(page, "05-dm-aberta");

  // 06 — notificações
  await irParaAba("Notificações");
  await page.waitForTimeout(1500);
  await foto(page, "06-notificacoes");

  // 07 — você
  await irParaAba("Você");
  await page.waitForTimeout(900);
  await foto(page, "07-voce");

  console.log("OK");
} catch (e) {
  console.log("FALHOU:", String(e?.stack ?? e).split("\n").slice(0, 6).join("\n"));
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) await foto(p, `erro-${Math.random().toString(36).slice(2, 6)}`);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
