// Monta uma folha de contato (grade de imagens com legenda) para inspeção visual.
// Uso: node lojas-folha.mjs saida.png largura_col img1 img2 ...
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
const [saida, col, ...imgs] = process.argv.slice(2);
const mime = (f) => ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[extname(f).toLowerCase()] || "image/png");
const cells = imgs.map((f) => `<figure><img src="data:${mime(f)};base64,${readFileSync(f).toString("base64")}"><figcaption>${basename(f)}</figcaption></figure>`).join("");
const html = `<html><body style="margin:0;background:#888;font:14px sans-serif"><div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px">${cells}</div>
<style>figure{margin:0;width:${col}px}img{width:100%;display:block}figcaption{background:#fff;padding:2px}</style></body></html>`;
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1800, height: 800 } });
await p.setContent(html);
await p.screenshot({ path: saida, fullPage: true });
await b.close();
