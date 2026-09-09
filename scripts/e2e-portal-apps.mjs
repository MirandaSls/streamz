/**
 * Passeio pelo **portal do desenvolvedor** (F4, lote A), com capturas nos dois
 * leiautes: desktop 1300×900 e celular 390×844 @3×.
 *
 *   node scripts/e2e-portal-apps.mjs --web http://localhost:3005 --out /out/apps/lote-a
 *
 * Fotografa as cinco telas do §11 mais a seção "Como apontar seu bot", e mede
 * com `getBoundingClientRect` — não lendo a classe — o alvo de toque e a
 * largura do documento no aparelho emulado, que é o que prova que a aba cabe
 * em 390px sem rolagem horizontal.
 *
 * Pré-requisitos: API e web da worktree no ar (ver o `HARNESS.md`). O script
 * **registra uma conta** (o banco desta bancada é próprio e nasce vazio); o
 * teto de registro é 5/hora por IP, então rode-o poucas vezes.
 */
import { chromium, devices } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
};

const WEB = arg("--web", "http://localhost:3005");
const outDir = resolve(arg("--out", "./portal-shots"));
mkdirSync(outDir, { recursive: true });

const SENHA = "Xk9#vWq2pLm7!";
const USUARIO = arg("--usuario", "portalf4a");
const NOVA = process.argv.includes("--registrar");

const IPHONE = {
  ...devices["iPhone 14"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
};

const medidas = [];

async function foto(page, nome) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  const file = resolve(outDir, `${nome}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  console.log("📸", file);
}

async function entrar(ctx, registrar) {
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));
  await page.goto(`${WEB}/${registrar ? "register" : "login"}`);
  if (await page.$("#email")) await page.fill("#email", `${USUARIO}@e2e.streamz.test`);
  await page.fill((await page.$("#identificador")) ? "#identificador" : "#username", USUARIO);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(app|verify-email)(\/|\?|#|$)/, { timeout: 45_000 });
  if (page.url().includes("/verify-email")) {
    await page.goto(`${WEB}/app`);
    await page.waitForURL("**/app*", { timeout: 45_000 });
  }
  await page.waitForTimeout(1500);
  return page;
}

/**
 * Abre a aba pelo deep link `?settings=aplicativos`.
 *
 * **O `?settings=` empilha DOIS modais em dev** — o `StrictMode` do React roda
 * o efeito que lê a query duas vezes, e cada passagem empilha um. É
 * pré-existente e vale para qualquer aba (`?settings=idioma` faz igual, medido
 * na mesma bancada), então o passeio fala sempre com o modal de cima, e não
 * com "o" modal.
 */
async function abrirAba(page) {
  await page.goto(`${WEB}/app?settings=aplicativos`);
  await page.waitForTimeout(2500);
}

/** O modal de cima — o que está à vista. */
const janela = (page) => page.locator('[role="dialog"]').last();
const botao = (page, nome, exato = false) =>
  janela(page).getByRole("button", { name: nome, exact: exato }).first();

/** Mede a caixa de verdade, no aparelho emulado. Nunca a classe. */
async function medir(page, rotulo, seletor) {
  const r = await page.evaluate((s) => {
    // o ÚLTIMO casamento: é o do modal de cima (ver `abrirAba`)
    const todos = document.querySelectorAll(s);
    const el = todos[todos.length - 1];
    if (!el) return null;
    const c = el.getBoundingClientRect();
    return { w: Math.round(c.width * 10) / 10, h: Math.round(c.height * 10) / 10 };
  }, seletor);
  medidas.push({ rotulo, seletor, ...(r ?? { w: null, h: null }) });
  return r;
}

/** Como `medir`, mas achando o elemento pelo texto (o `:has-text` é do Playwright). */
async function medirTexto(page, rotulo, seletor, texto) {
  const r = await page.evaluate(
    ({ s, t }) => {
      const todos = [...document.querySelectorAll(s)].filter((e) =>
        t ? (e.textContent ?? "").includes(t) : true,
      );
      const el = todos[todos.length - 1];
      if (!el) return null;
      const c = el.getBoundingClientRect();
      return { w: Math.round(c.width * 10) / 10, h: Math.round(c.height * 10) / 10 };
    },
    { s: seletor, t: texto },
  );
  medidas.push({ rotulo, seletor: `${seletor} :: “${texto}”`, ...(r ?? { w: null, h: null }) });
  return r;
}

const browser = await chromium.launch({
  headless: true,
  // `--disable-dev-shm-usage`: o `/dev/shm` de um contêiner sem `--shm-size` é
  // de 64 MB, e o Chromium morre com "page crashed" que parece falta de RAM da
  // máquina e não é. Sem esta linha o passeio caiu duas vezes nesta bancada.
  args: [
    "--font-render-hinting=none",
    "--disable-lcd-text",
    "--disable-gpu",
    "--disable-dev-shm-usage",
  ],
});

try {
  // ── desktop 1300×900 ─────────────────────────────────────────────────────
  const ctxD = await browser.newContext({
    viewport: { width: 1300, height: 900 },
    locale: "pt-BR",
  });
  const d = await entrar(ctxD, NOVA);
  await abrirAba(d);
  await foto(d, "d-01-lista-vazia");

  // criar
  await botao(d, "Criar aplicativo").click();
  await d.waitForTimeout(500);
  await janela(d).locator('input[placeholder="Música do Zé"]').first().fill("Música do Zé");
  await foto(d, "d-02-criar");

  // o painel do token — a captura que prova que ele aparece uma vez
  await botao(d, "Criar", true).click();
  await d.waitForTimeout(1500);
  await foto(d, "d-03-token-uma-vez");

  // com o painel fechado, a lista mostra o aplicativo
  await botao(d, "Já copiei, fechar").click();
  await d.waitForTimeout(400);
  await foto(d, "d-04-lista");

  // editar, com o interruptor "Publicar no diretório"
  await botao(d, /Música do Zé/).click();
  await d.waitForTimeout(700);
  await foto(d, "d-05-editar");
  // rola até o interruptor para ele caber na captura
  await janela(d).getByText("Publicar no diretório").first().scrollIntoViewIfNeeded();
  await d.waitForTimeout(400);
  await foto(d, "d-06-editar-publicar-no-diretorio");

  // a confirmação DUPLA do regenerar — a peça que não pode sair errada
  await botao(d, "Regenerar token").scrollIntoViewIfNeeded();
  await botao(d, "Regenerar token").click();
  await d.waitForTimeout(600);
  await foto(d, "d-07-regenerar-confirmacao-1");
  await d.getByRole("button", { name: "Continuar" }).last().click();
  await d.waitForTimeout(600);
  await foto(d, "d-08-regenerar-confirmacao-2");
  // cancela: o passeio não derruba o token que as capturas anteriores mostram
  await d.keyboard.press("Escape");
  await d.waitForTimeout(500);

  // servidores
  await botao(d, /Ver onde este aplicativo/).scrollIntoViewIfNeeded();
  await botao(d, /Ver onde este aplicativo/).click();
  await d.waitForTimeout(800);
  await foto(d, "d-09-servidores");

  // "Como apontar seu bot" — volta para a lista e rola até a seção
  await botao(d, /Música do Zé/).click();
  await d.waitForTimeout(400);
  await botao(d, "Meus aplicativos").click();
  await d.waitForTimeout(600);
  await janela(d).getByText("Como apontar seu bot").first().scrollIntoViewIfNeeded();
  await d.waitForTimeout(400);
  await foto(d, "d-10-como-apontar-seu-bot");
  await janela(d).getByText("discord.py").first().scrollIntoViewIfNeeded();
  await d.waitForTimeout(400);
  await foto(d, "d-11-como-apontar-discord-py");

  // ── celular 390×844 ──────────────────────────────────────────────────────
  const ctxM = await browser.newContext({ ...IPHONE, locale: "pt-BR" });
  const m = await entrar(ctxM, false);
  await abrirAba(m);
  // no celular a janela é mestre-detalhe: a lista de seções vem primeiro
  await foto(m, "m-00-lista-de-secoes");
  await janela(m).getByText("Aplicativos", { exact: true }).first().click();
  await m.waitForTimeout(800);
  await foto(m, "m-01-lista");

  await medir(m, "documento (sem rolagem horizontal se ≤ 390)", "body");
  await medirTexto(m, "botão “Criar aplicativo” (alvo de toque)", "button", "Criar aplicativo");
  await medirTexto(m, "linha do aplicativo na lista", "li button", "");

  await botao(m, "Criar aplicativo").click();
  await m.waitForTimeout(500);
  await janela(m).locator('input[placeholder="Música do Zé"]').first().fill("Bot de Voz");
  await foto(m, "m-02-criar");
  await medir(m, "campo Nome", 'input[placeholder="Música do Zé"]');

  await botao(m, "Criar", true).click();
  await m.waitForTimeout(1500);
  await foto(m, "m-03-token-uma-vez");
  await medirTexto(m, "botão “Copiar” do painel do token", "button", "Copiar");
  await medir(m, "campo do token", 'input[aria-label="Token do bot"]');

  await botao(m, "Já copiei, fechar").click();
  await m.waitForTimeout(400);
  await botao(m, /Bot de Voz/).click();
  await m.waitForTimeout(700);
  await foto(m, "m-04-editar");

  await janela(m).getByText("Publicar no diretório").first().scrollIntoViewIfNeeded();
  await m.waitForTimeout(400);
  await foto(m, "m-05-editar-publicar-no-diretorio");

  await botao(m, /Ver onde este aplicativo/).scrollIntoViewIfNeeded();
  await botao(m, /Ver onde este aplicativo/).click();
  await m.waitForTimeout(800);
  await foto(m, "m-06-servidores");

  await botao(m, /Bot de Voz/).click();
  await m.waitForTimeout(400);
  await botao(m, "Meus aplicativos").click();
  await m.waitForTimeout(600);
  await janela(m).getByText("Como apontar seu bot").first().scrollIntoViewIfNeeded();
  await m.waitForTimeout(400);
  await foto(m, "m-07-como-apontar-seu-bot");
  await medir(m, "bloco de código (rola dentro de si)", "pre");
  await medir(m, "botão Copiar do trecho", 'button[aria-label^="Copiar o trecho"]');

  // a prova de que a página não rola na horizontal
  const rolagem = await m.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  medidas.push({ rotulo: "documento: scrollWidth × clientWidth", ...rolagem });

  console.log("\n── medidas (getBoundingClientRect, iPhone 14 emulado) ──");
  for (const x of medidas) console.log(JSON.stringify(x));
} catch (e) {
  console.log("FALHOU:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
