// Clica nos chips de formato do Google Play e registra respostas de rede + estado da galeria.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
const hl = process.argv[2] || "en";
const out = process.argv[3];
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", viewport: { width: 1400, height: 1000 } });
const respostas = [];
p.on("response", async (r) => { const u = r.url(); if (/batchexecute|formFactor|details/.test(u) && r.request().method() === "POST") { try { respostas.push({ u, body: await r.text() }); } catch {} } });
await p.goto(`https://play.google.com/store/apps/details?id=com.discord&hl=${hl}&gl=US`, { waitUntil: "networkidle" });
const estado = {};
for (const id of ["formFactor_3", "formFactor_5", "formFactor_2"]) {
  const n0 = respostas.length;
  await p.locator(`#${id}`).scrollIntoViewIfNeeded();
  await p.locator(`#${id}`).click();
  await p.waitForTimeout(3000);
  estado[id] = {
    pressed: await p.getAttribute(`#${id}`, "aria-pressed"),
    imgs: await p.$$eval("img", (els) => els.filter((e) => e.offsetParent && /play-lh/.test(e.src) && e.naturalWidth > 150).map((e) => e.src.split("=")[0].slice(-20) + " " + e.getAttribute("alt"))),
    novasRespostas: respostas.length - n0,
  };
  await p.screenshot({ path: `${out}-${id}.png` });
}
writeFileSync(`${out}-rede.json`, JSON.stringify(respostas, null, 1));
console.log(JSON.stringify(estado, null, 1));
await b.close();
