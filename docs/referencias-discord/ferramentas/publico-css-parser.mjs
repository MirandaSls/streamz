// Parser mínimo de CSS (minificado) sem dependências: devolve regras com o contexto de
// at-rules em volta. Suficiente para os bundles do Discord; não é um parser completo.

export function parseCss(css) {
  const out = []; // { tipo: "regra"|"fontface"|"keyframes", seletor, decl, ctx: [] }
  let i = 0;
  const n = css.length;

  function skipComment() {
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      return true;
    }
    return false;
  }

  // lê até '{', ';' ou '}' no nível 0 (respeitando strings, parênteses e colchetes)
  function readPrelude() {
    let s = "";
    let depth = 0;
    while (i < n) {
      if (skipComment()) continue;
      const c = css[i];
      if (c === '"' || c === "'") {
        const q = c;
        s += c; i++;
        while (i < n && css[i] !== q) { if (css[i] === "\\") { s += css[i++]; } s += css[i++]; }
        s += css[i++] ?? "";
        continue;
      }
      if (c === "(" || c === "[") depth++;
      if (c === ")" || c === "]") depth--;
      if (depth <= 0 && (c === "{" || c === ";" || c === "}")) break;
      s += c; i++;
    }
    return s.trim();
  }

  // lê o corpo de um bloco de declarações até o '}' correspondente
  function readBlockBody() {
    let s = "";
    let depth = 0;
    while (i < n) {
      if (skipComment()) continue;
      const c = css[i];
      if (c === '"' || c === "'") {
        const q = c;
        s += c; i++;
        while (i < n && css[i] !== q) { if (css[i] === "\\") { s += css[i++]; } s += css[i++]; }
        s += css[i++] ?? "";
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") { if (depth === 0) { i++; break; } depth--; }
      s += c; i++;
    }
    return s;
  }

  function parseList(ctx) {
    while (i < n) {
      while (i < n && /\s/.test(css[i])) i++;
      if (skipComment()) continue;
      if (i >= n) return;
      if (css[i] === "}") { i++; return; }
      const prelude = readPrelude();
      const c = css[i];
      if (c === ";") { i++; continue; } // @import/@charset etc.
      if (c === "}") { i++; return; }
      if (c !== "{") return;
      i++; // consome '{'
      if (prelude.startsWith("@")) {
        const nome = prelude.slice(1).split(/[\s(]/)[0].toLowerCase();
        if (nome === "font-face") {
          out.push({ tipo: "fontface", seletor: "@font-face", decl: readBlockBody(), ctx });
        } else if (nome.endsWith("keyframes")) {
          out.push({ tipo: "keyframes", seletor: prelude, decl: readBlockBody(), ctx });
        } else if (["media", "supports", "layer", "container", "document", "scope", "starting-style"].includes(nome)) {
          parseList([...ctx, prelude]);
        } else {
          out.push({ tipo: "outro", seletor: prelude, decl: readBlockBody(), ctx });
        }
      } else {
        // regra com possível aninhamento: pegamos só as declarações de nível 0
        const body = readBlockBody();
        out.push({ tipo: "regra", seletor: prelude, decl: body, ctx });
      }
    }
  }
  parseList([]);
  return out;
}

// divide "a:b;c:d" respeitando parênteses e strings
export function splitDecls(body) {
  const res = [];
  let s = "", depth = 0, q = null;
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    if (q) { s += c; if (c === "\\") { s += body[++k] ?? ""; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; s += c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") depth--;
    if (c === ";" && depth === 0) { if (s.trim()) res.push(s.trim()); s = ""; continue; }
    s += c;
  }
  if (s.trim()) res.push(s.trim());
  return res.map((d) => {
    const p = d.indexOf(":");
    if (p === -1) return null;
    return { prop: d.slice(0, p).trim(), valor: d.slice(p + 1).trim() };
  }).filter(Boolean);
}
