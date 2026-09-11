// Copia as imagens triadas (decisoes.tsv) da área de triagem para blog/imagens
// e grava blog/manifesto.json. Idempotente: pode rodar de novo após novas decisões.
// Uso: node blog-publicar.mjs <dir-scratch> <dir-blog>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [, , dir, blog] = process.argv;
const indice = JSON.parse(fs.readFileSync(path.join(dir, "indice-staging.json"), "utf8"));
const porChave = new Map(indice.map((i) => [`${String(i.pi).padStart(3, "0")}/${String(i.ii).padStart(2, "0")}`, i]));
const linhas = fs.readFileSync(path.join(dir, "decisoes.tsv"), "utf8").trim().split("\n");

const MESES = { January: "01", February: "02", March: "03", April: "04", May: "05", June: "06", July: "07", August: "08", September: "09", October: "10", November: "11", December: "12" };
function iso(data) {
  const m = (data || "").match(/(\w+) (\d{1,2}), (\d{4})/);
  return m ? `${m[3]}-${MESES[m[1]]}-${m[2].padStart(2, "0")}` : null;
}
function slugCurto(slug) {
  let s = slug.replace("https://discord.com/", "").replace(/^safety\//, "safety-").replace(/^\d+-/, "");
  s = s.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (s.length > 48) s = s.slice(0, 48).replace(/-[^-]*$/, "");
  return s;
}
const limpar = (t) => (t || "").replace(/\s+/g, " ").trim();

const vistos = new Map();
const manifesto = [];
const duplicadas = [];
const contPorPasta = new Map();
for (const l of linhas) {
  const [chave, plataforma, tela, tema, desc] = l.split("\t");
  const it = porChave.get(chave);
  if (!it || !fs.existsSync(it.local)) {
    console.log("sem arquivo:", chave);
    continue;
  }
  const buf = fs.readFileSync(it.local);
  const md5 = crypto.createHash("md5").update(buf).digest("hex");
  if (vistos.has(md5)) {
    duplicadas.push(`${chave} = ${vistos.get(md5)}`);
    continue;
  }
  const dataIso = iso(it.data);
  const pasta = `${(dataIso || "0000-00").slice(0, 7)}-${slugCurto(it.slug)}`;
  const n = (contPorPasta.get(pasta) || 0) + 1;
  contPorPasta.set(pasta, n);
  const ext = path.extname(it.local).slice(1);
  const rel = `imagens/${pasta}/${String(n).padStart(2, "0")}-${desc}.${ext}`;
  vistos.set(md5, chave);
  fs.mkdirSync(path.join(blog, path.dirname(rel)), { recursive: true });
  fs.copyFileSync(it.local, path.join(blog, rel));
  const partes = [];
  if (it.secao) partes.push(`Seção: ${limpar(it.secao)}`);
  if (it.alt && it.alt !== "Image") partes.push(`Alt: ${limpar(it.alt)}`);
  if (it.legenda) partes.push(`Legenda: ${limpar(it.legenda)}`);
  if (partes.length < 2) partes.push(`Texto: ${limpar(it.textoAntes || it.textoDepois).slice(-220)}`);
  manifesto.push({
    arquivo: rel,
    url_origem: it.src,
    pagina_origem: it.url,
    titulo_pagina: it.titulo,
    data_publicacao: dataIso,
    contexto: partes.join(" | ").slice(0, 600),
    plataforma,
    tela,
    tema,
  });
}
fs.writeFileSync(path.join(blog, "manifesto.json"), JSON.stringify(manifesto, null, 2));
console.log("imagens", manifesto.length, "duplicadas puladas", duplicadas.length);
if (duplicadas.length) console.log(duplicadas.join("\n"));
