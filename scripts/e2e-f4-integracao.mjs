/**
 * As capturas da **integração** da F4 — as seis vistas que o §12 do
 * `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` pede como prova da fase, nos dois
 * leiautes: desktop 1300×900 e celular 390×844 @3×.
 *
 *   node scripts/e2e-f4-integracao.mjs --web http://localhost:3004 \
 *     --prep /out/prep-prints.json --out /out/apps/integracao
 *
 * Ao contrário dos passeios dos lotes (`e2e-portal-apps.mjs` do A e as fotos do
 * B), este roda sobre a árvore **integrada** — portal, diretório e a pílula BOT
 * na mesma bancada, com um aplicativo de verdade já instalado no servidor pela
 * rota. O `--prep` é a saída de `preparar-prints.mjs`, que deixa a bancada
 * nesse estado.
 *
 * Ele **mede** além de fotografar (§6.3 do processo: medir o que o código
 * entrega, com `getBoundingClientRect`, e não ler a classe). A medida que mais
 * importa aqui é a da pílula BOT, porque é a única peça que aparece em seis
 * telas e tem que ter o mesmo tamanho nas seis.
 */
import { chromium, devices } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
};

const WEB = arg("--web", "http://localhost:3004");
const outDir = resolve(arg("--out", "./f4-integracao"));
mkdirSync(outDir, { recursive: true });
const prep = JSON.parse(readFileSync(arg("--prep", "/out/prep-prints.json"), "utf8"));

const IPHONE = {
  ...devices["iPhone 14"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
};

const medidas = [];
const falhas = [];

async function foto(page, nome) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(350);
  const file = resolve(outDir, `${nome}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  console.log("📸", nome);
  return file;
}

/** Tenta um passo; registra a falha e segue, para uma tela ruim não levar as outras. */
async function passo(nome, fn) {
  try {
    await fn();
  } catch (e) {
    falhas.push(`${nome}: ${e.message.split("\n")[0]}`);
    console.log("⚠️ ", nome, "—", e.message.split("\n")[0]);
  }
}

/** A caixa que o navegador entregou. Nunca a classe. */
async function medir(page, rotulo, seletor, indice = 0) {
  const r = await page.evaluate(
    ({ s, i }) => {
      const todos = [...document.querySelectorAll(s)];
      const el = i < 0 ? todos[todos.length + i] : todos[i];
      if (!el) return null;
      const c = el.getBoundingClientRect();
      return {
        w: Math.round(c.width * 10) / 10,
        h: Math.round(c.height * 10) / 10,
        texto: (el.textContent ?? "").trim().slice(0, 20),
      };
    },
    { s: seletor, i: indice },
  );
  medidas.push({ rotulo, seletor, ...(r ?? { w: null, h: null }) });
  console.log(`   ↳ ${rotulo}: ${r ? `${r.w} × ${r.h}` : "NÃO ACHOU"}`);
  return r;
}

/** Recorta a pílula BOT ampliada, para dar para olhar em vez de acreditar. */
async function recortarPilula(page, nome, escala = 6) {
  const caixa = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Conta de bot"]');
    if (!el) return null;
    const c = el.getBoundingClientRect();
    return { x: c.x - 6, y: c.y - 6, width: c.width + 12, height: c.height + 12 };
  });
  if (!caixa) throw new Error("nenhuma pílula BOT na tela");
  const file = resolve(outDir, `${nome}.png`);
  await page.screenshot({ path: file, clip: caixa, scale: "css", animations: "disabled" });
  // a ampliação, para o raio e a centragem do texto darem para conferir a olho
  const grande = resolve(outDir, `${nome}-${escala}x.png`);
  await page.screenshot({
    path: grande,
    clip: { x: caixa.x, y: caixa.y, width: caixa.width, height: caixa.height },
    animations: "disabled",
  });
  console.log("🔍", nome, `(+${escala}×)`);
  return caixa;
}

async function entrar(ctx, usuario, senha) {
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));
  await page.goto(`${WEB}/login`);
  await page.fill((await page.$("#identificador")) ? "#identificador" : "#username", usuario);
  await page.fill("#password", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(app|verify-email)(\/|\?|#|$)/, { timeout: 60_000 });
  if (page.url().includes("/verify-email")) {
    await page.goto(`${WEB}/app`);
    await page.waitForURL("**/app*", { timeout: 60_000 });
  }
  await page.waitForTimeout(2000);
  return page;
}

const janela = (page) => page.locator('[role="dialog"]').last();

/**
 * Entra no servidor e no canal **clicando**, e não por URL.
 *
 * `apps/web/app/app/channels/[guildId]/[channelId]/` não tem `page.tsx` — só o
 * `[messageId]` abaixo dele tem. Quer dizer que o caminho do canal **não é uma
 * rota**: é estado de cliente, e um `goto` nele cai no 404 do Next. Os
 * seletores são os estáveis que o §6.1 do contrato manda usar.
 */
async function irParaOCanal(page, servidor, canal) {
  await page.goto(`${WEB}/app`);
  await page.waitForTimeout(2500);
  await page.click(`nav[aria-label="Servidores"] button[aria-label^="${servidor}"]`, {
    timeout: 45_000,
  });
  await page.waitForTimeout(1500);
  await page.locator("[data-channel-button]", { hasText: canal }).first().click();
  await page.waitForTimeout(3000);
}

const browser = await chromium.launch({
  headless: true,
  // `--disable-dev-shm-usage`: `/dev/shm` de 64 MB num contêiner sem
  // `--shm-size` derruba o Chromium com "page crashed", que parece falta de RAM
  // da máquina e não é.
  args: ["--font-render-hinting=none", "--disable-lcd-text", "--disable-gpu", "--disable-dev-shm-usage"],
});

/** O passeio, igual nos dois leiautes; o que muda é o prefixo e como se navega. */
async function passeio(page, p, celular) {
  // ── 1. o servidor: a pílula BOT na lista de membros e no autor ──────────
  await passo(`${p} servidor`, async () => {
    await irParaOCanal(page, prep.servidor.name, prep.canal.name);
    if (celular) {
      // no celular a lista de membros é uma tela empilhada
      await foto(page, `${p}-05-autor-da-mensagem`);
      await medir(page, `${p} pílula BOT (autor da mensagem)`, '[aria-label="Conta de bot"]');
      await recortarPilula(page, `${p}-05b-pilula-autor`);
      const membros = page.getByRole("button", { name: /membros/i }).first();
      if (await membros.count()) {
        await membros.click();
        await page.waitForTimeout(1200);
      }
      await foto(page, `${p}-06-lista-de-membros`);
    } else {
      await foto(page, `${p}-05-autor-e-lista-de-membros`);
      await medir(page, `${p} pílula BOT (autor da mensagem)`, '[aria-label="Conta de bot"]');
      await medir(page, `${p} pílula BOT (lista de membros)`, '[aria-label="Conta de bot"]', -1);
      await recortarPilula(page, `${p}-05b-pilula-autor`);
    }
  });

  // ── 2. o diretório ──────────────────────────────────────────────────────
  await passo(`${p} diretório`, async () => {
    await page.locator("[data-apps-button]").first().click();
    await page.waitForTimeout(2500);
    await foto(page, `${p}-01-diretorio`);
    await medir(page, `${p} card do diretório`, "[data-adicionar-app]");
  });

  // ── 3. a página de um app ───────────────────────────────────────────────
  await passo(`${p} página do app`, async () => {
    // o alvo é o botão-capa do card (`absolute inset-0`), não o texto: o
    // cabeçalho do card é `pointer-events-none` e um clique nele espera para
    // sempre. `CardDeApp.tsx` explica por que a capa existe.
    await page.getByRole("button", { name: `Ver ${prep.naoInstalado.name}` }).first().click();
    await page.waitForTimeout(1800);
    await foto(page, `${p}-02-pagina-do-app`);
  });

  // ── 4. o modal de permissões ────────────────────────────────────────────
  await passo(`${p} permissões`, async () => {
    await page.locator(`[data-adicionar-app="${prep.naoInstalado.id}"]`).first().click();
    await page.waitForTimeout(1800);
    await foto(page, `${p}-03-adicionar-escolher-servidor`);
    await medir(page, `${p} modal "Adicionar ao servidor"`, '[role="dialog"]', -1);
    const perms = janela(page).getByText("Permissões", { exact: false }).first();
    if (await perms.count()) await perms.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await foto(page, `${p}-04-adicionar-permissoes`);
  });

  // ── 5. o portal do desenvolvedor, com o token à vista uma vez ───────────
  await passo(`${p} portal`, async () => {
    await page.goto(`${WEB}/app?settings=aplicativos`);
    await page.waitForTimeout(3000);
    await foto(page, `${p}-07-portal-lista`);
    await janela(page).getByRole("button", { name: "Criar aplicativo" }).first().click();
    await page.waitForTimeout(800);
    // o campo pelo `placeholder`, e não `input` solto: a aba tem a busca das
    // configurações acima dela, e `.first()` cairia nela
    await janela(page).locator('input[placeholder="Música do Zé"]').first().fill("Bot da integração");
    await janela(page).getByRole("button", { name: "Criar", exact: true }).first().click();
    await page.waitForTimeout(2500);
    await foto(page, `${p}-08-portal-token-uma-vez`);
  });

  // ── 6. a aba "Aplicativos" das configurações do servidor (lote C) ───────
  await passo(`${p} aba do servidor`, async () => {
    await irParaOCanal(page, prep.servidor.name, prep.canal.name);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((e) =>
        /configurações do servidor/i.test(e.getAttribute("aria-label") ?? e.textContent ?? ""),
      );
      b?.click();
    });
    await page.waitForTimeout(1500);
    const aba = page.getByRole("button", { name: "Aplicativos", exact: true }).last();
    if (await aba.count()) {
      await aba.click();
      await page.waitForTimeout(1800);
    }
    await foto(page, `${p}-09-servidor-aba-aplicativos`);
    await medir(page, `${p} pílula BOT (aba do servidor)`, '[aria-label="Conta de bot"]');
  });
}

try {
  // ── desktop ─────────────────────────────────────────────────────────────
  const ctxD = await browser.newContext({ viewport: { width: 1300, height: 900 }, locale: "pt-BR" });
  const d = await entrar(ctxD, prep.dono.username, prep.dono.senha);
  await passeio(d, "d", false);

  // (c) sem MANAGE_GUILD: o servidor não aparece na lista de instalar
  await passo("d sem MANAGE_GUILD", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, locale: "pt-BR" });
    const s = await entrar(ctx, prep.membroSemPoder.username, prep.membroSemPoder.senha);
    await s.locator("[data-apps-button]").first().click();
    await s.waitForTimeout(2500);
    await s.getByRole("button", { name: `Ver ${prep.naoInstalado.name}` }).first().click();
    await s.waitForTimeout(1500);
    await s.locator(`[data-adicionar-app="${prep.naoInstalado.id}"]`).first().click();
    await s.waitForTimeout(1800);
    await foto(s, "d-10-sem-manage-guild-nenhum-servidor");
    const texto = await janela(s).innerText();
    console.log("   ↳ o modal diz:", JSON.stringify(texto.slice(0, 200)));
    medidas.push({ rotulo: "sem MANAGE_GUILD: texto do modal", texto: texto.slice(0, 200) });
    await ctx.close();
  });
  await ctxD.close();

  // ── celular ─────────────────────────────────────────────────────────────
  const ctxM = await browser.newContext({ ...IPHONE, locale: "pt-BR" });
  const m = await entrar(ctxM, prep.dono.username, prep.dono.senha);
  await passo("m rolagem horizontal", async () => {
    const r = await m.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    medidas.push({ rotulo: "celular: documento (scrollWidth × clientWidth)", ...r });
    console.log("   ↳ documento:", r.scrollWidth, "×", r.clientWidth);
  });
  await passeio(m, "m", true);
  await ctxM.close();
} finally {
  await browser.close();
  writeFileSync(resolve(outDir, "medidas.json"), JSON.stringify({ medidas, falhas }, null, 2));
  console.log("\n── medidas ──");
  for (const x of medidas) console.log(" ", x.rotulo, "→", x.w != null ? `${x.w} × ${x.h}` : JSON.stringify(x).slice(0, 120));
  if (falhas.length) {
    console.log("\n── passos que falharam ──");
    for (const f of falhas) console.log("  ⚠️ ", f);
  }
}
