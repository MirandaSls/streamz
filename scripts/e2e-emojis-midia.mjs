/**
 * Passeio ponta a ponta do agente g-emojis-midia: emoji personalizado,
 * autocomplete do composer, figurinha, GIF, mídia e rascunho.
 *
 *   node scripts/e2e-emojis-midia.mjs --out C:/tmp/shots-g
 *
 * Pré-requisitos: API e web no ar (WEB_URL/API_URL apontando para elas) e o
 * banco do agente acessível por DATABASE_URL — o script **semeia pelo Prisma**
 * um emoji, uma figurinha e um anexo de GIF externo.
 *
 * Por que semear pelo banco: criar emoji/figurinha pela API exige o R2, que não
 * está configurado neste ambiente (responde 503, de propósito). O que dá para
 * verificar sem storage é tudo o que vem depois — o token `:nome:` virar
 * `<img>`, o seletor listar, a reação usar a forma interna, a figurinha ocupar
 * a mensagem. A imagem em si aparece quebrada; é o limite conhecido do ambiente.
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const outDir = resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "./e2e-shots-g",
);
mkdirSync(outDir, { recursive: true });

const WEB = process.env.WEB_URL ?? "http://localhost:3107";
const API = process.env.API_URL ?? "http://localhost:3407";
const sufixo = Date.now().toString(36).slice(-5);
/**
 * Conta fixa: o registro tem teto de 5 por hora por IP (`AUTH_REGISTER_THROTTLE`),
 * e um passeio que só roda cinco vezes por hora não serve para depurar. A
 * primeira execução cria a conta; as seguintes entram nela. Cada execução cria
 * um servidor novo, que é o que precisa estar limpo. `E2E_USER`/`E2E_PASS`
 * apontam para outra conta quando o teto de registro já tiver batido.
 */
const ANA = {
  user: process.env.E2E_USER ?? "e2e_g_midia",
  pass: process.env.E2E_PASS ?? "senha123",
};

let n = 0;
const shot = async (page, nome) => {
  n += 1;
  const file = resolve(outDir, `${String(n).padStart(2, "0")}-${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

/** Falha alto: um passo que "passou" sem o que deveria aparecer não vale nada. */
function conferir(condicao, oque) {
  if (!condicao) throw new Error(`esperava ${oque}`);
  console.log("✓", oque);
}

function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
}

/**
 * Cliente Prisma da API (o schema e o client gerado moram lá). A `DATABASE_URL`
 * é lida do `.env` da raiz na mão — o script não depende de `dotenv`.
 */
async function prismaDaApi() {
  if (!process.env.DATABASE_URL) {
    const env = readFileSync(resolve(import.meta.dirname, "../.env"), "utf8");
    const linha = env
      .split(String.fromCharCode(10))
      .find((l) => l.trimStart().startsWith("DATABASE_URL="));
    if (!linha) throw new Error("DATABASE_URL não encontrada no .env da raiz");
    const valor = linha.slice(linha.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
    process.env.DATABASE_URL = valor;
  }
  const { PrismaClient } = require(
    resolve(import.meta.dirname, "../apps/api/node_modules/@prisma/client"),
  );
  return new PrismaClient();
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const viewport = { width: 1440, height: 900 };
let prisma;

try {
  prisma = await prismaDaApi();

  // ── conta e servidor pela API (mais rápido que pela tela) ──
  const credenciais = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ANA.user, password: ANA.pass }),
  };
  let registro = await fetch(`${API}/api/auth/register`, credenciais).then((r) => r.json());
  // já existe (execução anterior) ou o teto de registros bateu: entra na conta
  if (!registro?.tokens) {
    registro = await fetch(`${API}/api/auth/login`, credenciais).then((r) => r.json());
  }
  if (!registro?.tokens) throw new Error(`sem sessão: ${JSON.stringify(registro)}`);
  const token = registro.tokens.accessToken;
  const guild = await fetch(`${API}/api/guilds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `Servidor de Mídia ${sufixo}` }),
  }).then((r) => r.json());
  console.log("servidor", guild.id, "usuário", registro.user.id);

  // ── fixtures: emoji, figurinha e GIF externo ──
  const emoji = await prisma.customEmoji.create({
    data: {
      guildId: guild.id,
      name: "festa",
      key: `emojis/${guild.id}/e2e-${sufixo}.png`,
      contentType: "image/png",
      size: 1024,
      animated: false,
      createdById: registro.user.id,
    },
  });
  await prisma.sticker.create({
    data: {
      guildId: guild.id,
      name: "abraco",
      tags: "carinho amizade",
      key: `stickers/${guild.id}/e2e-${sufixo}.png`,
      contentType: "image/png",
      size: 2048,
      createdById: registro.user.id,
    },
  });
  const gif = await prisma.attachment.create({
    data: {
      uploaderId: registro.user.id,
      key: `external/e2e-${sufixo}`,
      externalUrl: "https://media.tenor.com/exemplo/gato.gif",
      filename: "gato.gif",
      contentType: "image/gif",
      size: 0,
      width: 320,
      height: 240,
    },
  });
  console.log("fixtures prontos:", emoji.id, gif.id);

  // ── tela ──
  const ctx = await browser.newContext({ viewport, locale: "pt-BR" });
  const page = await ctx.newPage();
  observar(page, ANA.user);
  await page.goto(`${WEB}/login`);
  await page.fill("#username", ANA.user);
  await page.fill("#password", ANA.pass);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 120_000 });
  // o servidor recém-criado é o último do rail; abre por ele para não cair num
  // servidor de uma execução anterior
  await page.click(`nav[aria-label="Servidores"] button[aria-label^="Servidor de Mídia ${sufixo}"]`, {
    timeout: 30_000,
  });
  await page.waitForSelector("text=Bem-vindo a #geral!", { timeout: 20_000 });
  await shot(page, "app");

  const composer = 'textarea[aria-label="Mensagem para #geral"]';

  // 1. `:festa:` vira emoji personalizado (jumbo, porque é a mensagem inteira)
  await page.fill(composer, ":festa:");
  await page.press(composer, "Enter");
  await page.waitForSelector('img[alt=":festa:"]', { timeout: 15_000 });
  conferir(await page.locator('img[alt=":festa:"]').first().isVisible(), "emoji personalizado na mensagem");
  await shot(page, "emoji-personalizado");

  // 2. autocomplete de `:` mostra o do servidor e os unicode
  await page.fill(composer, ":fes");
  await page.waitForSelector('[role="listbox"][aria-label="Emojis"]', { timeout: 10_000 });
  conferir(
    await page.locator('[role="option"]', { hasText: ":festa:" }).first().isVisible(),
    "autocomplete de emoji com o do servidor",
  );
  await shot(page, "autocomplete-emoji");
  await page.press(composer, "Escape");
  await page.fill(composer, "");

  // 3. autocomplete de `@` lista membros e @everyone
  await page.fill(composer, "@");
  await page.waitForSelector('[role="listbox"][aria-label="Membros"]', { timeout: 10_000 });
  conferir(
    await page.locator('[role="option"]', { hasText: "@everyone" }).first().isVisible(),
    "autocomplete de menção com @everyone",
  );
  await shot(page, "autocomplete-mencao");
  await page.keyboard.press("Enter"); // escolhe o primeiro
  conferir((await page.inputValue(composer)).startsWith("@"), "menção inserida no campo");
  await page.fill(composer, "");

  // 4. autocomplete de `/` e o comando /shrug
  await page.fill(composer, "/shr");
  await page.waitForSelector('[role="listbox"][aria-label="Comandos"]', { timeout: 10_000 });
  await shot(page, "autocomplete-comando");
  await page.fill(composer, "/shrug deu ruim");
  await page.press(composer, "Enter");
  await page.waitForSelector("text=deu ruim ¯", { timeout: 15_000 });
  conferir(true, "/shrug acrescentou o sufixo");

  // 5. anexo: o arquivo só sobe no envio, e sem R2 o erro chega como aviso claro
  await page.setInputFiles('input[type="file"]', {
    name: "print.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.waitForSelector("text=spoiler", { timeout: 10_000 });
  await shot(page, "previa-anexo");
  await page.check('input[type="checkbox"]');
  await shot(page, "previa-anexo-spoiler");
  await page.fill(composer, "olha isso");
  await page.press(composer, "Enter");
  await page.waitForSelector("text=/R2.*não configurado|Armazenamento/", { timeout: 20_000 });
  conferir(true, "upload sem R2 avisa o motivo em vez de falhar calado");
  await shot(page, "upload-sem-r2");

  // 6. seletor de GIF sem chave do Tenor
  await page.click('button[aria-label="GIF"]');
  await page.waitForSelector("text=GIFs não configurados", { timeout: 15_000 });
  conferir(true, 'seletor de GIF mostra "não configurados"');
  await shot(page, "gif-nao-configurado");
  await page.keyboard.press("Escape");

  // 7. seletor de figurinha lista a do servidor
  await page.click('button[aria-label="Figurinha"]');
  await page.waitForSelector('[role="dialog"][aria-label="Escolher figurinha"]', { timeout: 15_000 });
  conferir(
    await page.locator('button[aria-label="abraco"]').first().isVisible(),
    "figurinha do servidor no seletor",
  );
  await shot(page, "seletor-figurinha");
  await page.click('button[aria-label="abraco"]');
  await page.waitForSelector('img[alt="abraco"]', { timeout: 15_000 });
  conferir(true, "figurinha enviada como mensagem");
  await shot(page, "figurinha-enviada");

  // 8. seletor de emoji: aba do servidor
  await page.click('button[aria-label="Emoji"]');
  await page.getByRole("tab", { name: /Do servidor/ }).click();
  await page.waitForTimeout(500);
  conferir(
    await page.locator('button[aria-label=":festa:"]').first().isVisible(),
    "aba do servidor no seletor de emoji",
  );
  await shot(page, "seletor-emoji-servidor");
  await page.keyboard.press("Escape");

  // 9. rascunho sobrevive ao recarregar a página
  await page.fill(composer, "rascunho que não pode sumir");
  await page.waitForTimeout(400);
  await page.reload();
  // ao recarregar, o app abre o primeiro servidor do rail — volta para o desta
  // execução antes de conferir o rascunho, que é por canal
  await page.click(`nav[aria-label="Servidores"] button[aria-label^="Servidor de Mídia ${sufixo}"]`, {
    timeout: 30_000,
  });
  await page.waitForSelector(composer, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  conferir(
    (await page.inputValue(composer)) === "rascunho que não pode sumir",
    "rascunho preservado ao recarregar",
  );
  await shot(page, "rascunho-preservado");
  await page.fill(composer, "");

  // 10. painel de mídia do canal
  await page.click('button[aria-label="Mídia do canal"]');
  await page.waitForSelector("text=Mídia", { timeout: 10_000 });
  await shot(page, "painel-midia");

  console.log("OK");
} catch (e) {
  console.log("FALHOU:", String(e.message ?? e).split(String.fromCharCode(10))[0]);
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) await shot(p, "erro");
  }
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect?.();
  await browser.close();
}
