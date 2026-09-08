/**
 * Capturas das telas desta sessão (modais, configurações e folhas) no perfil
 * iPhone 14 (390×844 @3x), reaproveitando a conta semeada do harness.
 */
import { chromium, devices } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const WEB = arg("--web", "http://localhost:3005");
const outDir = resolve(arg("--out", "/out/mobile"));
mkdirSync(outDir, { recursive: true });
const SENHA = "Xk9#vWq2pLm7!";
const ANA = { user: "anaxipwp", pass: SENHA };

const foto = async (page, nome) => {
  const file = resolve(outDir, `${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

const browser = await chromium.launch({
  headless: true,
  args: ["--font-render-hinting=none", "--disable-lcd-text"],
});
const perfil = {
  ...devices["iPhone 14"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
};
const ctx = await browser.newContext({ ...perfil, locale: "pt-BR" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));

await page.goto(`${WEB}/login`);
await page.fill((await page.$("#identificador")) ? "#identificador" : "#username", ANA.user);
await page.fill("#password", ANA.pass);
await page.click('button[type="submit"]');
await page.waitForURL(/\/(app|verify-email)(\/|\?|#|$)/, { timeout: 60_000 });
if (page.url().includes("/verify-email")) {
  await page.goto(new URL("/app", page.url()).toString());
  await page.waitForURL("**/app", { timeout: 30_000 });
}
await page.waitForTimeout(3000);
await foto(page, "00-base");

const aba = (nome) => page.locator(`nav[aria-label="Seções"] button`).filter({ hasText: nome });

// ── 13 — configurações do usuário ─────────────────────────────────────────
await aba("Você").click();
await page.waitForTimeout(1200);
await foto(page, "12-voce");
await page.getByText("Configurações", { exact: true }).first().click();
await page.waitForTimeout(1500);
await foto(page, "13-config-usuario");

// uma seção aberta
await page.locator('[role="dialog"] button', { hasText: "Aparência" }).first().click();
await page.waitForTimeout(1200);
await foto(page, "13b-config-usuario-secao");
// voltar uma camada e fechar
await page.locator('[role="dialog"] button[aria-label="Voltar"]').first().click();
await page.waitForTimeout(600);
await page.locator('[role="dialog"] button[aria-label="Fechar"]').first().click();
await page.waitForTimeout(800);

// ── 14 — configurações do servidor ────────────────────────────────────────
await aba("Servidores").click();
await page.waitForTimeout(1200);
await foto(page, "14a-servidores");
// o cabeçalho do servidor abre a folha com as opções
await page.getByText("Time de Produto").first().click().catch(() => undefined);
await page.waitForTimeout(900);
await foto(page, "14b-folha-servidor");
const opcao = page.getByText(/Configurações do servidor|Configurações/).first();
if (await opcao.count()) {
  await opcao.click();
  await page.waitForTimeout(1500);
  await foto(page, "14-config-servidor");
  const secao = page.locator('[role="dialog"] button', { hasText: /Cargos|Membros/ }).first();
  if (await secao.count()) {
    await secao.click();
    await page.waitForTimeout(1200);
    await foto(page, "14b-config-servidor-secao");
    await page.locator('[role="dialog"] button[aria-label="Voltar"]').first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('[role="dialog"] button[aria-label="Fechar"]').first().click();
  await page.waitForTimeout(800);
}

await browser.close();
console.log("fim");
