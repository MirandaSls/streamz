// Baixa o HTML de cada post do blog do Discord e extrai as mídias do corpo
// (imagens, vídeos, iframes) com contexto: título da seção, alt, legenda e o
// parágrafo seguinte. Uso: node blog-extrair.mjs slugs.txt saida.json
import fs from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const [, , entrada, saida] = process.argv;
const slugs = fs.readFileSync(entrada, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);

const limpar = (s) =>
  (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const attr = (tag, nome) => {
  const m = tag.match(new RegExp(`\\s${nome}="([^"]*)"`));
  return m ? m[1] : null;
};

function maiorDoSrcset(tag) {
  const ss = attr(tag, "srcset");
  const src = attr(tag, "src");
  if (!ss) return src;
  let best = src,
    bw = 0;
  for (const part of ss.split(",")) {
    const [u, w] = part.trim().split(/\s+/);
    const n = parseInt(w || "0");
    if (n > bw) {
      bw = n;
      best = u;
    }
  }
  return best;
}

async function extrair(slug) {
  const url = slug.startsWith("http") ? slug : `https://discord.com/blog/${slug}`;
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) return { slug, url, erro: r.status };
  const html = await r.text();
  const titulo = limpar((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
  const data = (html.match(
    /<div>((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d)<\/div>/,
  ) || [])[1];
  const categoria = limpar((html.match(/class="blog_category-text"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
  const ogImage = attr((html.match(/<meta[^>]*property="og:image"[^>]*>/) || [""])[0], "content");
  // Corpo: do primeiro article_rich-text até o bloco de "posts relacionados".
  const ini = html.indexOf("article_rich-text");
  let fim = html.indexOf("cms_article", ini);
  if (fim < 0) fim = html.length;
  const corpo = ini >= 0 ? html.slice(ini, fim) : "";
  const itens = [];
  // Tokeniza em ordem: headings, parágrafos, figuras/imagens, vídeos, iframes.
  const re =
    /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>|<p[^>]*>([\s\S]*?)<\/p>|<figcaption[^>]*>([\s\S]*?)<\/figcaption>|(<img[^>]*>)|(<video[^>]*>)|(<source[^>]*>)|(<iframe[^>]*>)/g;
  let m,
    secao = "",
    ultimoTexto = "";
  while ((m = re.exec(corpo))) {
    if (m[1] !== undefined) {
      secao = limpar(m[1]);
    } else if (m[2] !== undefined) {
      const t = limpar(m[2]);
      if (t) {
        ultimoTexto = t;
        for (const it of itens) if (it.textoDepois === null) it.textoDepois = t.slice(0, 300);
      }
    } else if (m[3] !== undefined) {
      if (itens.length) itens[itens.length - 1].legenda = limpar(m[3]);
    } else if (m[4]) {
      const src = maiorDoSrcset(m[4]);
      if (!src || /\.svg(\?|$)/i.test(src) || /author|Blog%20Icon|avatar_img/i.test(m[4])) continue;
      itens.push({ tipo: "img", src, alt: limpar(attr(m[4], "alt")), secao, textoAntes: ultimoTexto.slice(-300), textoDepois: null });
    } else if (m[5] || m[6]) {
      const tag = m[5] || m[6];
      const src = attr(tag, "src");
      if (!src) continue;
      itens.push({ tipo: "video", src, poster: attr(tag, "poster"), secao, textoAntes: ultimoTexto.slice(-300), textoDepois: null });
    } else if (m[7]) {
      itens.push({ tipo: "iframe", src: attr(m[7], "src"), secao, textoAntes: ultimoTexto.slice(-300), textoDepois: null });
    }
  }
  return { slug, url, titulo, data, categoria, ogImage, itens };
}

const res = [];
const fila = [...slugs];
async function worker() {
  while (fila.length) {
    const s = fila.shift();
    try {
      res.push(await extrair(s));
    } catch (e) {
      res.push({ slug: s, erro: String(e) });
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
fs.writeFileSync(saida, JSON.stringify(res, null, 1));
console.log("posts", res.length, "itens", res.reduce((a, p) => a + (p.itens?.length || 0), 0));
