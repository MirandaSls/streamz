// Abre cada categoria do blog, clica em "Load More" até acabar e lista os slugs.
import { chromium } from "playwright-core";
import fs from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const cats = process.argv.slice(2);
const out = process.env.OUT;
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const result = {};
for (const c of cats) {
  const url = c === "blog" ? "https://discord.com/blog" : `https://discord.com/category/${c}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  let prev = -1;
  for (let i = 0; i < 60; i++) {
    const n = await page.$$eval('a[href*="/blog/"]', (as) => as.length);
    const btn = await page.$('[data-btn="load-more"]:visible');
    if (!btn || n === prev) {
      if (!btn) break;
    }
    prev = n;
    try {
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ timeout: 5000 });
    } catch {
      break;
    }
    await page.waitForTimeout(2500);
    const n2 = await page.$$eval('a[href*="/blog/"]', (as) => as.length);
    if (n2 === n) break;
  }
  const items = await page.$$eval('a[href*="/blog/"]', (as) =>
    as.map((a) => ({ href: a.getAttribute("href"), text: a.innerText.trim().slice(0, 200) })),
  );
  result[c] = items;
  console.log(c, new Set(items.map((i) => i.href)).size);
}
fs.writeFileSync(out, JSON.stringify(result, null, 1));
await browser.close();
