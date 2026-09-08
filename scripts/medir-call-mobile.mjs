/**
 * Régua da chamada no celular: mede o que está **na tela**, não a classe.
 *
 *   node scripts/medir-call-mobile.mjs --web http://localhost:3006 --usuario xipwp
 *
 * A raiz do app é `font-size: 15.5px` (`globals.css`) e toda classe de tamanho
 * do Tailwind é `rem`: `h-11` desenha **42,6** e `h-12` desenha **46,5**. Ler a
 * classe não é medir — quem responde é o `getBoundingClientRect`, e é por isso
 * que este arquivo existe em vez de um `grep`.
 *
 * O que ele confere contra `docs/Reference/mobile/MEDIDAS.md` §12, num iPhone
 * 14 emulado (390×844 @3x), com a câmera ligada para o botão de expandir
 * existir:
 *
 * | o quê | esperado | medido em 2026-09-08 |
 * |---|---|---|
 * | cápsula de controles | 68 de altura, 13 de margem | 68, 13 (364 de largura) |
 * | base da cápsula → base da tela | 8 + área segura | 8 (a área segura é 0 no emulador) |
 * | botão da barra e desligar | 48 desenhado, piso de 44 | 48×48 |
 * | expandir / virar câmera | 44 (piso de toque) | 44×44 |
 * | raio do destaque | ≈16 | 16 |
 * | folga lateral do palco | 12 | 12 |
 *
 * Exige a mesma bancada do `e2e-mobile-call.mjs` (API, web e conta semeada).
 */
import { chromium, devices } from "playwright-core";

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const WEB = arg("--web", "http://localhost:3006");
const sufixo = arg("--usuario", "xipwp");

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ],
});

const ctx = await browser.newContext({
  ...devices["iPhone 14"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  locale: "pt-BR",
  permissions: ["microphone", "camera"],
});
const page = await ctx.newPage();
await page.goto(`${WEB}/login`);
await page.fill("#identificador", `ana${sufixo}`);
await page.fill("#password", "Xk9#vWq2pLm7!");
await page.click('button[type="submit"]');
await page.waitForURL(/\/app/, { timeout: 45_000 });
await page.waitForTimeout(2500);

await page.locator('nav[aria-label="Seções"] button').filter({ hasText: "Início" }).click();
await page.waitForTimeout(900);
await page.click('nav[aria-label="Servidores"] button[aria-label^="Time de Produto"]');
await page.waitForTimeout(1200);
await page.getByText("Geral", { exact: true }).first().click();
await page.waitForTimeout(4500);
// a câmera revela o botão de expandir (só existe com imagem no destaque)
await page
  .locator('button[aria-label="Ligar câmera"]')
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(3500);

const medida = await page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { w: +b.width.toFixed(2), h: +b.height.toFixed(2), x: +b.x.toFixed(2), y: +b.y.toFixed(2) };
  };
  const barra = document.querySelector('button[aria-label="Silenciar"], button[aria-label="Desativar mudo"]')
    ?.parentElement;
  const cx = barra?.getBoundingClientRect();
  const palco = document.querySelector("[data-palco-mobile]");
  const px = palco?.getBoundingClientRect();
  const tile = document.querySelector("[data-palco-mobile] [data-voice-tile]");
  const tx = tile?.getBoundingClientRect();
  return {
    raiz: getComputedStyle(document.documentElement).fontSize,
    viewport: { w: innerWidth, h: innerHeight },
    barra: cx && { w: +cx.width.toFixed(2), h: +cx.height.toFixed(2), esq: +cx.x.toFixed(2), baseAteFim: +(innerHeight - cx.bottom).toFixed(2) },
    botaoDaBarra: r('button[aria-label="Silenciar"]') ?? r('button[aria-label="Desativar mudo"]'),
    botaoDeDesligar: r('button[aria-label="Desconectar"]'),
    botaoDeExpandir: r('button[aria-label^="Ver "]'),
    palco: px && { w: +px.width.toFixed(2), h: +px.height.toFixed(2), esq: +px.x.toFixed(2) },
    destaque: tx && { w: +tx.width.toFixed(2), h: +tx.height.toFixed(2), esq: +tx.x.toFixed(2), raio: getComputedStyle(tile).borderTopLeftRadius },
    cabecalho: r("header"),
  };
});

console.log(JSON.stringify(medida, null, 2));
await browser.close();
