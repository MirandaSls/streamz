#!/usr/bin/env node
/**
 * Folha lado a lado do passeio de paridade (onda 0.7): por tela, a nossa
 * captura à esquerda e até duas referências do Discord à direita, com o id, a
 * onda e a nota de cada referência na legenda. É o material do revisor visual
 * (§3 do plano): ele mede divergência olhando a folha, não abrindo três pastas.
 *
 *   node scripts/paridade/folha.mjs --saida .claude/paridade/saida \
 *     --refs /opt/stack/streamz/.claude/worktrees/referencias [--onda 2] [--so canal-texto]
 *
 * Opções:
 *   --saida <dir>         onde o capturar.mjs gravou (`<saída>/<plataforma>/<id>.png`)
 *   --refs <dir>          raiz do repositório de referências. Caminho relativo do
 *                         referencias.json é tentado contra `<dir>/` e contra
 *                         `<dir>/docs/referencias-discord/`; absoluto (os prints
 *                         1:1 de /opt/stack/streamz/docs/Reference) vale como
 *                         está. As worktrees de trabalho usam sparse-checkout
 *                         sem essa pasta, por isso ela vem de fora.
 *   --referencias <arq>   padrão: scripts/paridade/referencias.json desta
 *                         worktree; se não existir, o do repositório de --refs
 *   --telas <arq>         padrão: scripts/paridade/telas.json
 *   --onda <n>            só as telas desta onda
 *   --so <id,id>          só estas telas
 *   --escala-desktop <n>  largura da coluna desktop em fração de 1920 (padrão 0.5)
 *
 * Saída: `<saída>/folha/<plataforma>/<id>.png` (+ o `.html` que a gerou) e
 * `<saída>/folha/index.html`, que lista todas.
 *
 * A composição é HTML fotografado pelo Chromium do Playwright — o host não tem
 * Pillow nem ImageMagick, e a imagem do Playwright já está na bancada. A
 * página e as imagens são `file://`: o Chromium carrega imagem de arquivo a
 * partir de página de arquivo, e nada sai da máquina.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
};

const SAIDA = resolve(arg("--saida", join(RAIZ, ".claude/paridade/saida")));
const REFS = arg("--refs", null) ? resolve(arg("--refs")) : null;
const ARQ_TELAS = resolve(arg("--telas", join(RAIZ, "scripts/paridade/telas.json")));
const ONDA = arg("--onda", null);
const SO = new Set(
  (arg("--so", "") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
);
const ESCALA_DESKTOP = Number(arg("--escala-desktop", "0.5"));
const MAX_REFS = 2;

function acharReferencias() {
  const explicito = arg("--referencias", null);
  const candidatos = [
    explicito && resolve(explicito),
    join(RAIZ, "scripts/paridade/referencias.json"),
    REFS && join(REFS, "scripts/paridade/referencias.json"),
  ].filter(Boolean);
  for (const c of candidatos) if (existsSync(c)) return c;
  return null;
}

const exigir = createRequire(import.meta.url);
const { chromium } = exigir(process.env.PW_CORE || "playwright-core");

/** Mesmo recurso do capturar.mjs: o playwright-core tem de achar o Chromium da imagem. */
function executavelDoChromium() {
  try {
    const padrao = chromium.executablePath();
    if (padrao && existsSync(padrao)) return undefined;
  } catch {
    // revisão desconhecida
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/ms-playwright";
  if (!existsSync(base)) return undefined;
  for (const pasta of readdirSync(base).sort().reverse()) {
    for (const rel of ["chrome-linux/headless_shell", "chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const caminho = join(base, pasta, rel);
      if (existsSync(caminho)) return caminho;
    }
  }
  return undefined;
}

/**
 * As referências de uma tela. Aceita as duas formas do `referencias.json`:
 * a plana do cartão (`{ "<id>": [...] }`) e a aninhada por plataforma que o
 * cartão 0.7c gravou (`{ "desktop": { "<id>": [...] }, "celular": {...} }`),
 * onde uma tela sem imagem boa vem como `{ "lacuna": "por quê" }`.
 */
function referenciasDe(referencias, plataforma, id) {
  const bruto = referencias?.[plataforma]?.[id] ?? referencias?.[id];
  if (Array.isArray(bruto)) return { lista: bruto.filter((r) => r && typeof r === "object"), lacuna: null };
  if (bruto && typeof bruto === "object" && bruto.lacuna) return { lista: [], lacuna: String(bruto.lacuna) };
  return { lista: [], lacuna: null };
}

/**
 * Onde está o arquivo de uma referência. Absoluto vale como está (os prints
 * 1:1 de `/opt/stack/streamz/docs/Reference`, que o `bancada.sh` monta no mesmo
 * caminho). Relativo pode ser à raiz do repositório de referências
 * (`docs/referencias-discord/…`) ou à própria `docs/referencias-discord/` — o
 * 0.7c escreveu da segunda forma; os dois são tentados.
 */
function resolverArquivo(arquivo) {
  if (!arquivo) return null;
  const candidatos = arquivo.startsWith("/")
    ? [arquivo]
    : REFS
      ? [join(REFS, arquivo), join(REFS, "docs/referencias-discord", arquivo)]
      : [];
  for (const c of candidatos) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch {
      // caminho inválido: tenta o próximo
    }
  }
  return null;
}

const html = (t) =>
  String(t ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Medidas de uma coluna por plataforma: a nossa captura inteira, sem corte. */
function medidas(plataforma, telas) {
  const t = telas[plataforma];
  if (plataforma === "desktop") {
    const largura = Math.round(t.largura * ESCALA_DESKTOP);
    return { largura, alturaMax: Math.round(t.altura * ESCALA_DESKTOP * 1.6) };
  }
  return { largura: t.largura, alturaMax: Math.round(t.altura * 1.25) };
}

function carregarJson(arq, padrao) {
  if (!arq || !existsSync(arq)) return padrao;
  return JSON.parse(readFileSync(arq, "utf8"));
}

function paginaDaFolha({ plataforma, tela, nossa, falhou, erroDaCaptura, refs, lacuna, col, pastaDoHtml }) {
  const colunas = [];
  const legendaNossa = falhou
    ? `<span class="selo falha">captura falhou</span> ${html(erroDaCaptura ?? "")}`
    : nossa
      ? `<span class="selo nosso">Streamz</span> ${html(relative(SAIDA, nossa))}`
      : `<span class="selo falha">sem captura</span> rode o capturar.mjs para esta tela`;
  // caminho relativo para a nossa captura: o .html continua abrindo fora do
  // contêiner (a saída é a mesma pasta no host); as referências vêm de um
  // volume montado só aqui dentro, e por isso ficam absolutas
  const imagemNossa = nossa
    ? `<img src="${html(encodeURI(relative(pastaDoHtml, nossa)))}" style="width:${col.largura}px">`
    : `<div class="vazio" style="width:${col.largura}px;height:${Math.round(col.largura * 0.6)}px">sem captura</div>`;
  colunas.push(`<figure>${imagemNossa}<figcaption>${legendaNossa}</figcaption></figure>`);

  if (refs.length === 0) {
    const motivo = lacuna ? `lacuna de referência: ${lacuna}` : "sem referência no referencias.json";
    colunas.push(
      `<figure><div class="vazio texto" style="width:${col.largura}px;min-height:${Math.round(col.largura * 0.6)}px">${html(motivo)}</div><figcaption><span class="selo ref">Discord</span> —</figcaption></figure>`,
    );
  }
  for (const [i, r] of refs.entries()) {
    const corpo = r.existe
      ? `<img src="${pathToFileURL(r.caminho).href}" style="max-width:${col.largura}px;max-height:${col.alturaMax}px">`
      : `<div class="vazio" style="width:${col.largura}px;height:${Math.round(col.largura * 0.6)}px">arquivo não encontrado${REFS || r.arquivo?.startsWith("/") ? "" : " (faltou --refs)"}</div>`;
    const escala = r.escala ? ` <span class="escala">escala ${html(r.escala)}</span>` : "";
    colunas.push(
      `<figure>${corpo}<figcaption><span class="selo ref">Discord ${i + 1}</span>${escala} ${html(r.nota ?? "")}<br><code>${html(r.arquivo)}</code></figcaption></figure>`,
    );
  }

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${html(tela.id)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #111214; color: #dbdee1;
         font: 14px/1.45 "Noto Sans", "DejaVu Sans", system-ui, sans-serif; display: inline-block; }
  header { margin-bottom: 16px; }
  h1 { margin: 0 0 4px; font-size: 22px; color: #fff; }
  h1 small { font-size: 14px; font-weight: 500; color: #9BE31F; margin-left: 10px; }
  header p { margin: 0; color: #b5bac1; }
  main { display: flex; gap: 20px; align-items: flex-start; }
  figure { margin: 0; display: flex; flex-direction: column; gap: 8px; }
  figure img { display: block; outline: 1px solid #3f4147; background: #000; }
  figcaption { max-width: ${col.largura}px; font-size: 13px; color: #b5bac1; }
  code { font-size: 11px; color: #949ba4; word-break: break-all; }
  .selo { display: inline-block; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px; margin-right: 4px; }
  .nosso { background: #9BE31F; color: #111214; }
  .ref { background: #5865F2; color: #fff; }
  .falha { background: #da373c; color: #fff; }
  .vazio { display: grid; place-items: center; border: 2px dashed #4e5058; color: #949ba4; }
  .vazio.texto { padding: 24px; text-align: left; line-height: 1.5; }
  .escala { color: #949ba4; font-size: 11px; }
</style></head>
<body>
  <header>
    <h1>${html(tela.id)}<small>onda ${html(tela.onda)} · ${html(plataforma)}</small></h1>
    <p>${html(tela.o_que)}</p>
  </header>
  <main>${colunas.join("\n")}</main>
</body></html>`;
}

function paginaDoIndice(linhas, meta) {
  const porPlataforma = new Map();
  for (const l of linhas) porPlataforma.set(l.plataforma, [...(porPlataforma.get(l.plataforma) ?? []), l]);
  const secoes = [...porPlataforma.entries()]
    .map(([plataforma, itens]) => {
      const cartoes = itens
        .map((l) => {
          const selos = [
            l.falhou ? '<span class="selo falha">captura falhou</span>' : l.nossa ? "" : '<span class="selo falha">sem captura</span>',
            l.refs === 0 ? `<span class="selo aviso">${l.lacuna ? "lacuna de referência" : "sem referência"}</span>` : "",
            l.refsFaltando ? `<span class="selo aviso">${l.refsFaltando} ref. não encontrada(s)</span>` : "",
          ].join("");
          return `<a class="cartao" href="${html(l.png)}">
  <img loading="lazy" src="${html(l.png)}" alt="">
  <div><strong>${html(l.id)}</strong> <small>onda ${html(l.onda)}</small> ${selos}<br><span>${html(l.o_que)}</span></div>
</a>`;
        })
        .join("\n");
      return `<h2>${html(plataforma)} <small>${itens.length} tela(s)</small></h2><div class="grade">${cartoes}</div>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Folhas do passeio de paridade</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #111214; color: #dbdee1; font: 14px/1.45 system-ui, sans-serif; }
  h1 { margin: 0 0 4px; color: #fff; }
  h2 { margin: 28px 0 12px; color: #fff; } h2 small { color: #949ba4; font-weight: 400; font-size: 14px; }
  p.meta { color: #949ba4; margin: 0; }
  .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }
  .cartao { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 8px; background: #1e1f22; color: inherit; text-decoration: none; }
  .cartao:hover { outline: 2px solid #9BE31F; }
  .cartao img { width: 100%; height: 220px; object-fit: contain; object-position: left top; background: #000; border-radius: 4px; }
  .cartao small { color: #9BE31F; } .cartao span { color: #b5bac1; }
  .selo { display: inline-block; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px; margin-left: 4px; }
  .falha { background: #da373c; color: #fff; } .aviso { background: #f0b232; color: #111214; }
</style></head>
<body>
  <h1>Folhas do passeio de paridade</h1>
  <p class="meta">${html(meta)}</p>
  ${secoes}
</body></html>`;
}

async function principal() {
  const telas = carregarJson(ARQ_TELAS, null);
  if (!telas) throw new Error(`telas.json não encontrado: ${ARQ_TELAS}`);
  const arqRefs = acharReferencias();
  const referencias = carregarJson(arqRefs, {});
  if (!arqRefs) console.warn("! referencias.json não encontrado: as folhas saem só com a nossa captura");
  if (!REFS) console.warn("! sem --refs: os caminhos das referências não têm onde ser resolvidos");
  const resumo = carregarJson(join(SAIDA, "resumo.json"), { telas: [] });
  const erros = new Map((resumo.telas ?? []).filter((t) => !t.ok).map((t) => [`${t.plataforma}/${t.id}`, t.erro]));

  /** O que existe em disco para uma tela: a nossa captura (ou a da falha) e as referências. */
  function estadoDaTela(plataforma, tela) {
    const png = join(SAIDA, plataforma, `${tela.id}.png`);
    const pngFalha = join(SAIDA, plataforma, `${tela.id}.falha.png`);
    const temNossa = existsSync(png);
    const falhou = !temNossa && existsSync(pngFalha);
    const nossa = temNossa ? png : falhou ? pngFalha : null;
    const { lista, lacuna } = referenciasDe(referencias, plataforma, tela.id);
    const refs = lista.slice(0, MAX_REFS).map((r) => {
      const caminho = resolverArquivo(r.arquivo);
      return { ...r, caminho, existe: Boolean(caminho) };
    });
    return { nossa, falhou, refs, lacuna, faltando: refs.filter((r) => !r.existe).length };
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: executavelDoChromium(),
    args: ["--font-render-hinting=none", "--disable-lcd-text", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  let geradas = 0;
  let semRef = 0;
  let refsFaltando = 0;
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const plataforma of ["desktop", "celular"]) {
      if (!telas[plataforma]) continue;
      const col = medidas(plataforma, telas);
      const pasta = join(SAIDA, "folha", plataforma);
      mkdirSync(pasta, { recursive: true });
      for (const tela of telas[plataforma].telas) {
        if (SO.size && !SO.has(tela.id)) continue;
        if (ONDA !== null && String(tela.onda) !== String(ONDA)) continue;

        const { nossa, falhou, refs, lacuna, faltando } = estadoDaTela(plataforma, tela);
        if (refs.length === 0) semRef++;
        refsFaltando += faltando;

        const arqHtml = join(pasta, `${tela.id}.html`);
        const saidaPng = join(pasta, `${tela.id}.png`);
        writeFileSync(
          arqHtml,
          paginaDaFolha({
            plataforma,
            tela,
            nossa,
            falhou,
            erroDaCaptura: erros.get(`${plataforma}/${tela.id}`),
            refs,
            lacuna,
            col,
            pastaDoHtml: pasta,
          }),
        );
        const colunas = 1 + Math.max(1, refs.length);
        await page.setViewportSize({ width: 48 + colunas * col.largura + (colunas - 1) * 20, height: 400 });
        await page.goto(pathToFileURL(arqHtml).href, { waitUntil: "load" });
        await page.evaluate(() =>
          Promise.all(
            [...document.images].map((i) =>
              i.complete ? true : new Promise((ok) => ((i.onload = ok), (i.onerror = ok))),
            ),
          ),
        );
        await page.screenshot({ path: saidaPng, fullPage: true });
        geradas++;
        console.log(
          `✔ ${plataforma}/${tela.id}${nossa ? "" : " (sem captura)"}${refs.length ? "" : " (sem referência)"}${faltando ? ` (${faltando} ref. não encontrada)` : ""}`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  // O índice lista toda folha que existe em disco, e não só as desta rodada:
  // gerar a onda 2 com `--onda 2` não pode apagar da lista as da onda 1.
  const linhas = [];
  for (const plataforma of ["desktop", "celular"]) {
    for (const tela of telas[plataforma]?.telas ?? []) {
      if (!existsSync(join(SAIDA, "folha", plataforma, `${tela.id}.png`))) continue;
      const { nossa, falhou, refs, lacuna, faltando } = estadoDaTela(plataforma, tela);
      linhas.push({
        plataforma,
        id: tela.id,
        onda: tela.onda,
        o_que: tela.o_que,
        png: `${plataforma}/${tela.id}.png`,
        nossa: Boolean(nossa),
        falhou,
        refs: refs.length,
        lacuna: Boolean(lacuna),
        refsFaltando: faltando,
      });
    }
  }

  const meta = [
    `${linhas.length} folha(s) no índice, ${geradas} gerada(s) agora`,
    `referências: ${arqRefs ? relative(RAIZ, arqRefs) || arqRefs : "nenhuma"}`,
    `raiz das referências: ${REFS ?? "—"}`,
    ONDA !== null ? `onda ${ONDA}` : "todas as ondas",
    `gerado em ${new Date().toISOString()}`,
  ].join(" · ");
  writeFileSync(join(SAIDA, "folha", "index.html"), paginaDoIndice(linhas, meta));
  console.log(
    `\n${geradas} folha(s) gerada(s) em ${join(SAIDA, "folha")} · ${semRef} sem referência · ${refsFaltando} referência(s) não encontrada(s)`,
  );
  console.log(`Índice: ${join(SAIDA, "folha", "index.html")}`);
}

principal().catch((e) => {
  console.error(`✘ a folha falhou: ${e?.stack ?? e}`);
  process.exitCode = 1;
});
