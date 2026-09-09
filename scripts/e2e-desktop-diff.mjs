/**
 * Prova de que o desktop não mudou: a mesma conta, a mesma tela, dois builds.
 *
 *   node scripts/e2e-desktop-diff.mjs --usuario ana123 \
 *     --antes http://localhost:3002 --depois http://localhost:3001 --out /tmp/shots
 *
 * `--senha`, `--servidor` e `--canal` existem para bancadas com semente própria
 * (a da F4 é uma); sem eles valem os da bancada do leiaute móvel.
 *
 * Fotografa `--antes` e `--depois` em 1300×900 e escreve o par
 * `00-desktop-antes.png` / `00-desktop-depois.png`. A comparação em si é feita
 * com Pillow (o host não tem outra coisa) — ver o `comparar.py` do PR.
 *
 * O tamanho é 1300×900 de propósito: acima do piso de 940px do shell e abaixo
 * da largura em que a lista de membros ganha folga, ou seja, o pior caso para
 * uma diferença de leiaute passar despercebida.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
};

const outDir = resolve(arg("--out", "./e2e-shots-desktop"));
mkdirSync(outDir, { recursive: true });
const USUARIO = arg("--usuario", null);
// `--senha` e `--servidor` entraram na integração da F4: a bancada dela tem
// semente própria (`semear-f4.mjs`), com outra senha e outro nome de servidor.
// Os padrões são os de antes, então quem já chamava o script continua igual.
const SENHA = arg("--senha", "Xk9#vWq2pLm7!");
const SERVIDOR = arg("--servidor", "Time de Produto");
const CANAL = arg("--canal", "geral");
const ALVOS = [
  { nome: "00-desktop-antes", web: arg("--antes", "http://localhost:3002") },
  { nome: "00-desktop-depois", web: arg("--depois", "http://localhost:3001") },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--font-render-hinting=none", "--disable-lcd-text"],
});

try {
  for (const alvo of ALVOS) {
    const ctx = await browser.newContext({
      viewport: { width: 1300, height: 900 },
      deviceScaleFactor: 1,
      locale: "pt-BR",
    });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text().slice(0, 200)));
    page.on("response", (r) => r.status() >= 400 && console.log(`[http ${r.status()}]`, r.url()));
    await page.goto(`${alvo.web}/login`);
    await page.fill("#identificador", USUARIO);
    await page.fill("#password", SENHA);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(app|verify-email)(\/|\?|#|$)/, { timeout: 45_000 });
    if (page.url().includes("/verify-email")) {
      await page.goto(new URL("/app", page.url()).toString());
      await page.waitForURL("**/app", { timeout: 45_000 });
    }
    // o servidor, o canal e a conversa: a tela com as quatro colunas de pé
    await page.click(
      `nav[aria-label="Servidores"] button[aria-label^="${SERVIDOR}"]`,
      { timeout: 30_000 },
    );
    await page.waitForSelector(`textarea[aria-label="Mensagem para #${CANAL}"]`, {
      timeout: 30_000,
    });
    // o embed do link e as fontes precisam ter assentado antes da foto
    await page.waitForTimeout(6000);
    const file = resolve(outDir, `${alvo.nome}.png`);
    await page.screenshot({ path: file });
    console.log("📸", file);
    await ctx.close();
  }
  console.log("OK");
} catch (e) {
  console.log("FALHOU:", String(e?.message ?? e).split("\n")[0]);
  for (const ctx of browser.contexts())
    for (const p of ctx.pages()) await p.screenshot({ path: resolve(outDir, "erro-desktop.png") });
  process.exitCode = 1;
} finally {
  await browser.close();
}
