// Coleta as URLs de screenshot do Google Play por dispositivo (chips Phone/Tablet/Chromebook).
import { chromium } from "playwright-core";
const hl = process.argv[2] || "en";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", viewport: { width: 1400, height: 1000 }, locale: hl.replace("_", "-") });
await p.goto(`https://play.google.com/store/apps/details?id=com.discord&hl=${hl}&gl=US`, { waitUntil: "networkidle" });
const coleta = () => p.$$eval('img[alt="Screenshot image"], img[alt="Imagem de captura de tela"], img[data-screenshot-index]', (els) => els.map((e) => e.getAttribute("src")));
const res = {};
const chips = await p.$$eval('[id^="formFactor_"]', (els) => els.map((e) => [e.id, e.getAttribute("aria-label")]));
console.error("chips:", JSON.stringify(chips));
res.padrao = await coleta();
for (const [id, nome] of chips) {
  await p.click(`#${id}`); await p.waitForTimeout(2500);
  res[nome] = await coleta();
}
res.titulo = await p.title();
console.log(JSON.stringify(res, null, 1));
await b.close();
