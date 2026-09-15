// Monta folhas de contato (grade de miniaturas com rótulo) a partir da área de
// triagem e tira screenshot de cada uma, para classificar as imagens a olho.
// Uso: node blog-folhas.mjs <dir-scratch> [porFolha]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const porFolha = Number(process.argv[3] || 24);
const indice = JSON.parse(fs.readFileSync(path.join(dir, "indice-staging.json"), "utf8"));
const dims = new Map(
  fs.readFileSync(path.join(dir, "dims.txt"), "utf8").trim().split("\n").map((l) => {
    const [f, w, h] = l.split(" ");
    return [f, `${w}x${h}`];
  }),
);
const itens = indice.filter((i) => !i.local.endsWith(".webm") && fs.existsSync(i.local));
const saida = path.join(dir, "folhas");
fs.mkdirSync(saida, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
for (let f = 0; f * porFolha < itens.length; f++) {
  const lote = itens.slice(f * porFolha, (f + 1) * porFolha);
  const cells = lote
    .map((i) => {
      const rel = path.relative(path.join(dir, "staging"), i.local);
      return `<div class=c><img src="file://${i.local}"><div class=l>${rel} · ${dims.get(rel) || ""}<br>${(i.alt || i.legenda || "").slice(0, 70)}</div></div>`;
    })
    .join("");
  const html = `<style>body{margin:0;background:#888;font:13px sans-serif}.g{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:6px}.c{background:#fff;padding:3px}.c img{width:100%;height:240px;object-fit:contain;background:#ccc}.l{height:34px;overflow:hidden}</style><div class=g>${cells}</div>`;
  const arq = path.join(saida, `f${String(f).padStart(2, "0")}.html`);
  fs.writeFileSync(arq, html);
  await page.goto("file://" + arq);
  await page.waitForTimeout(800);
  await page.screenshot({ path: arq.replace(".html", ".png"), fullPage: true });
}
await browser.close();
console.log("folhas", Math.ceil(itens.length / porFolha));
