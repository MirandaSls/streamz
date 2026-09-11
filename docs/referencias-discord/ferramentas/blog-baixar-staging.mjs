// Baixa as mídias dos posts selecionados para uma área de triagem (fora de blog/),
// para montar folhas de contato e classificar antes de copiar o que presta.
// Uso: node blog-baixar-staging.mjs <dir-scratch>
import fs from "node:fs";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const dir = process.argv[2];
const posts = ["posts.json", "posts-extra.json", "posts-safety.json"].flatMap((f) =>
  JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")),
);
const porSlug = new Map(posts.map((p) => [p.slug, p]));
const sel = fs.readFileSync(path.join(dir, "selecao.txt"), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const staging = path.join(dir, "staging");
fs.mkdirSync(staging, { recursive: true });

const tarefas = [];
const indice = [];
sel.forEach((slug, pi) => {
  const p = porSlug.get(slug);
  if (!p || p.erro) {
    console.log("sem dados:", slug);
    return;
  }
  const vistos = new Set();
  (p.itens || []).forEach((it, ii) => {
    if (it.tipo === "iframe" || !it.src || vistos.has(it.src)) return;
    vistos.add(it.src);
    const ext = (decodeURIComponent(it.src).split("?")[0].match(/\.(png|jpe?g|gif|webp|avif|mp4|webm|mov)$/i) || [, "bin"])[1].toLowerCase();
    const local = path.join(staging, `${String(pi).padStart(3, "0")}`, `${String(ii).padStart(2, "0")}.${ext}`);
    const reg = { pi, ii, slug, local, ...it, titulo: p.titulo, data: p.data, url: p.url };
    indice.push(reg);
    tarefas.push(reg);
  });
});

async function baixar(reg) {
  if (fs.existsSync(reg.local)) return;
  fs.mkdirSync(path.dirname(reg.local), { recursive: true });
  const r = await fetch(reg.src, { headers: { "user-agent": UA } });
  if (!r.ok) {
    reg.erro = r.status;
    return;
  }
  const len = Number(r.headers.get("content-length") || 0);
  reg.bytes = len;
  if (len > 20 * 1024 * 1024) {
    reg.erro = "grande";
    await r.body?.cancel();
    return;
  }
  fs.writeFileSync(reg.local, Buffer.from(await r.arrayBuffer()));
}
const fila = [...tarefas];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (fila.length) {
      const t = fila.shift();
      try {
        await baixar(t);
      } catch (e) {
        t.erro = String(e);
      }
    }
  }),
);
fs.writeFileSync(path.join(dir, "indice-staging.json"), JSON.stringify(indice, null, 1));
console.log("itens", indice.length, "erros", indice.filter((i) => i.erro).length);
