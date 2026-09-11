#!/usr/bin/env node
/**
 * Passeio de paridade — as capturas (onda 0.7 do `docs/PLANO-PARIDADE-DISCORD.md`).
 *
 * Fotografa cada tela de `scripts/paridade/telas.json` na bancada semeada, em
 * desktop 1920×1080 e celular 390×844, e grava `<saída>/<plataforma>/<id>.png`.
 * Quem chama é o `bancada.sh capturar`, dentro da imagem do Playwright:
 *
 *   node scripts/paridade/capturar.mjs --web http://localhost:43000 \
 *     --api http://localhost:43333 --semente .claude/paridade/semente.json \
 *     --saida .claude/paridade/saida [--so canal-texto,m-chat] [--plataforma desktop]
 *
 * Opções:
 *   --so <id,id>            só estas telas (ids do telas.json, das duas plataformas)
 *   --plataforma <p[,p]>    desktop, celular ou os dois (padrão)
 *   --relogio <ISO>         hora congelada no navegador (padrão: a do manifesto)
 *   --sem-relogio           não congela o relógio (para descartar o relógio como causa)
 *   --sem-figurantes        não conecta os membros (presença e voz somem)
 *   --escala-celular <n>    deviceScaleFactor do celular (padrão 1: medida 1:1, §6.3)
 *   --listar                imprime as telas e os passos conhecidos e sai
 *
 * ## Como a tela chega ao estado da foto
 *
 * - **Um contexto novo por tela**, com login pela tela de login: nenhum painel,
 *   rascunho ou rolagem de uma tela vaza para a próxima. O custo é um login por
 *   foto, e o `THROTTLE_DISABLED=1` da bancada é o que o permite.
 * - **Relógio congelado** no dia da semente (`context.clock.setFixedTime`), no
 *   fuso de São Paulo: a timeline sai "Hoje às 14:10" em qualquer dia em que o
 *   passeio rodar. Os timers continuam correndo — só `Date` fica parado.
 * - **Figurantes**: a presença do Streamz é ao vivo (ONLINE só com socket
 *   aberto, `chat.gateway.ts` `markOnline`), então este processo abre um
 *   socket por membro marcado `conectar` no manifesto e põe dois deles no canal
 *   de voz. O dono é o navegador.
 * - **Uma tela que falha não derruba as outras**: o erro vai para o resumo e a
 *   tela como estava vira `<id>.falha.png`, para depurar olhando.
 *
 * O §6.3 do PROCESSO manda medir em 1:1: `deviceScaleFactor` 1, fonte sem
 * hinting e sem subpixel. No celular o contexto é `isMobile` + `hasTouch` e os
 * gestos são **toque** (`tap`, e o toque longo por CDP): o `click` do
 * Playwright manda `pointerType: "mouse"`, e o toque longo do app ignora mouse
 * (`telas-de-conversa.tsx`, `AreaDeToqueLongo`).
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
};
const tem = (nome) => process.argv.includes(nome);

const WEB = arg("--web", "http://localhost:43000").replace(/\/$/, "");
const API = arg("--api", "http://localhost:43333").replace(/\/$/, "");
const SAIDA = resolve(arg("--saida", join(RAIZ, ".claude/paridade/saida")));
const ARQ_SEMENTE = resolve(arg("--semente", join(RAIZ, ".claude/paridade/semente.json")));
const ARQ_TELAS = resolve(arg("--telas", join(RAIZ, "scripts/paridade/telas.json")));
const SO = new Set(
  (arg("--so", "") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const PLATAFORMAS = (arg("--plataforma", "desktop,celular") ?? "desktop,celular")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ESCALA_CELULAR = Number(arg("--escala-celular", "1"));
const FUSO = "America/Sao_Paulo";
/** Teto de uma tela inteira (login + passos + foto). */
const TETO_DA_TELA_MS = 120_000;

// ── dependências ────────────────────────────────────────────────────────────

/**
 * O playwright-core **tem de casar com o Chromium da imagem**: cada versão
 * procura o navegador da sua revisão em `/ms-playwright`. O `bancada.sh`
 * instala a versão da imagem num volume e aponta `PW_CORE` para ela; sem isso
 * cai no da worktree e, se a revisão não existir, usa o Chromium que houver na
 * imagem (funciona na maioria das vezes, mas não é a combinação testada).
 */
const exigir = createRequire(import.meta.url);
const pw = exigir(process.env.PW_CORE || "playwright-core");
const { chromium, devices } = pw;
const { io } = createRequire(join(RAIZ, "apps/web/package.json"))("socket.io-client");

function executavelDoChromium() {
  try {
    const padrao = chromium.executablePath();
    if (padrao && existsSync(padrao)) return undefined;
  } catch {
    // revisão desconhecida: procura abaixo
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/ms-playwright";
  if (!existsSync(base)) return undefined;
  for (const pasta of readdirSync(base).sort().reverse()) {
    for (const rel of [
      "chrome-linux/headless_shell",
      "chrome-headless-shell-linux64/chrome-headless-shell",
      "chrome-linux/chrome",
      "chrome-linux64/chrome",
    ]) {
      const caminho = join(base, pasta, rel);
      if (existsSync(caminho)) {
        console.warn(`! playwright-core ${pw.version ?? ""} sem o Chromium da sua revisão; usando ${caminho}`);
        return caminho;
      }
    }
  }
  return undefined;
}

// ── entradas ────────────────────────────────────────────────────────────────

const telas = JSON.parse(readFileSync(ARQ_TELAS, "utf8"));
if (!existsSync(ARQ_SEMENTE) && !tem("--listar")) {
  console.error(`Manifesto da semente não encontrado: ${ARQ_SEMENTE}\nRode \`bancada.sh semear\` antes.`);
  process.exit(1);
}
const s = existsSync(ARQ_SEMENTE) ? JSON.parse(readFileSync(ARQ_SEMENTE, "utf8")) : null;
const RELOGIO = tem("--sem-relogio") ? null : arg("--relogio", s?.relogioSugerido ?? "2026-09-10T18:30:00-03:00");

// ── utilidades de página ────────────────────────────────────────────────────

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function ir(page, caminho) {
  await page.goto(`${WEB}${caminho}`, { waitUntil: "domcontentloaded" });
}

/** Rede quieta, sem transformar demora em erro (o socket do app nunca "acaba"). */
async function rede(page, ms = 8_000) {
  await page.waitForLoadState("networkidle", { timeout: ms }).catch(() => {});
}

/** Toque no celular, clique no desktop. */
async function acionar(page, locator) {
  if (page.celular) await locator.tap();
  else await locator.click();
}

async function esperarShell(page) {
  await page.waitForSelector(page.celular ? "[data-shell-mobile]" : "[data-shell-desktop]", { timeout: 45_000 });
  // a tela de abertura cobre o shell enquanto sessão e listas chegam
  // (`TelaDeAbertura.tsx`); a foto não pode pegar o fade dela
  await page
    .waitForSelector('[role="status"][data-tauri-drag-region]', { state: "detached", timeout: 20_000 })
    .catch(() => {});
  await page.locator(`nav[aria-label="Servidores"] button[aria-label^="${s.servidores.paridade.nome}"]`).first().waitFor({
    timeout: 30_000,
  });
  await rede(page);
}

async function entrar(page) {
  await ir(page, "/login");
  await page.fill("#identificador", s.dono.username);
  await page.fill("#password", s.dono.senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(app|verify-email)(\/|\?|#|$)/, { timeout: 45_000 });
  if (page.url().includes("/verify-email")) {
    await ir(page, "/app");
    await page.waitForURL(/\/app/, { timeout: 45_000 });
  }
  await esperarShell(page);
}

const railServidor = (page, nome) =>
  page.locator(`nav[aria-label="Servidores"] button[aria-label^="${nome}"]`).first();

async function abrirServidor(page, chave = "paridade") {
  await acionar(page, railServidor(page, s.servidores[chave].nome));
  await page.locator("[data-channel-button]").first().waitFor({ timeout: 20_000 });
  await rede(page);
}

/** O botão do canal pelo nome **exato** ("geral" ≠ "Geral", o de voz). */
const canalBotao = (page, nome) =>
  page
    .locator("[data-channel-button]")
    .filter({ hasText: new RegExp(`^\\s*${esc(nome)}\\s*$`) })
    .first();

async function abrirCanal(page, chave) {
  const canal = s.canais[chave];
  await acionar(page, canalBotao(page, canal.nome));
  if (canal.tipo !== "VOICE") {
    // o servidor abre sozinho no primeiro canal de texto (`stores/channels.ts`,
    // `loadForGuild`): sem conferir o título, as mensagens do #geral já na tela
    // passariam por "o canal carregou"
    if (!page.celular) {
      await page
        .locator("main header h1")
        .filter({ hasText: new RegExp(`^\\s*${esc(canal.nome)}\\s*$`) })
        .first()
        .waitFor({ timeout: 20_000 });
    }
    await page.locator('[id^="mensagem-"]').first().waitFor({ timeout: 20_000 });
    await page
      .locator('[role="status"][aria-label="Carregando mensagens"]')
      .first()
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => {});
  }
  await rede(page);
}

/** Leva a mensagem ao meio da lista — o que está acima do fim não aparece sozinho. */
async function centralizar(page, chaveDaMensagem) {
  const id = s.mensagens[chaveDaMensagem];
  if (!id) throw new Error(`mensagem "${chaveDaMensagem}" não está no manifesto`);
  const alvo = page.locator(`#mensagem-${id}`);
  await alvo.waitFor({ timeout: 20_000 });
  await alvo.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await dormir(500);
  return alvo;
}

/** Home (Amigos). É onde o app abre depois do login no desktop; o logo leva de volta. */
async function abrirAmigos(page) {
  await acionar(page, page.locator('nav[aria-label="Servidores"] button[aria-label^="Mensagens diretas"]').first());
  await page.locator('nav[aria-label="Filtrar amigos"]').waitFor({ timeout: 20_000 });
  await rede(page);
}

async function abrirConversa(page, chave) {
  await acionar(page, page.locator("[data-dm-button]").filter({ hasText: s.conversas[chave].titulo }).first());
  await page.locator('[id^="mensagem-"]').first().waitFor({ timeout: 20_000 });
  await rede(page);
}

async function abrirMenuDoServidor(page) {
  await page.locator('button[aria-haspopup="menu"]').filter({ hasText: s.servidores.paridade.nome }).first().click();
  await page.locator('[role="menu"]').first().waitFor();
}

async function abrirConfigDoServidor(page, aba) {
  await abrirServidor(page);
  await abrirMenuDoServidor(page);
  await page.getByRole("menuitem", { name: "Configurações do servidor" }).click();
  await page.locator('[role="dialog"]').first().waitFor();
  await page.getByText(aba, { exact: true }).first().click();
  await rede(page);
}

async function digitarNoComposer(page, texto) {
  const campo = page.locator(`textarea[aria-label="Mensagem para #${s.canais.geral.nome}"]`);
  await campo.click();
  await campo.pressSequentially(texto);
  await page.locator('[role="listbox"]').first().waitFor();
}

async function perfilDe(page, chave) {
  const nome = s.usuarios[chave].displayName;
  await page.locator(`aside[aria-label="Membros"] button[aria-label="Perfil de ${nome}"]`).first().click();
  const cartao = page.locator(`[role="dialog"][aria-label="Perfil de ${nome}"]`);
  await cartao.waitFor();
  await rede(page);
  return cartao;
}

/** Toque longo de verdade: `touchStart`, espera, `touchEnd` (o app arma o menu aos 450 ms). */
async function toqueLongo(page, locator, ms = 800) {
  const caixa = await locator.boundingBox();
  if (!caixa) throw new Error("elemento sem caixa para o toque longo");
  const x = caixa.x + Math.min(caixa.width / 2, 160);
  const y = caixa.y + caixa.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }],
  });
  await dormir(ms);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await dormir(500);
}

/**
 * Entrar em voz sem LiveKit funciona: o estado de voz vai pelo gateway antes
 * da mídia, e sem credencial a store fica "conectada, sem mídia"
 * (`stores/voice.ts`, `conectarMidia` → `sem-config`).
 */
async function entrarNaVoz(page) {
  await acionar(page, canalBotao(page, s.canais["voz-geral"].nome));
  if (page.celular) {
    await page.getByRole("button", { name: "Conversa do canal" }).waitFor({ timeout: 20_000 });
  } else {
    await page.locator('button[aria-label="Desconectar"]').first().waitFor({ timeout: 20_000 });
  }
  await rede(page);
}

// ── o mapa: tela → passos ───────────────────────────────────────────────────
//
// `logado: false` = contexto sem login. `mouse: true` = a foto quer o ponteiro
// onde o passo o deixou (hover, tooltip). `voz: true` = o passo entrou em voz,
// e a faxina tira o dono da sala antes da próxima tela.

const PASSOS = {
  desktop: {
    login: {
      logado: false,
      async fazer(page) {
        await ir(page, "/login");
        await page.waitForSelector("#identificador");
      },
    },
    registro: {
      logado: false,
      async fazer(page) {
        await ir(page, "/register");
        await page.waitForSelector("#email");
      },
    },
    "convite-pagina": {
      logado: false,
      async fazer(page) {
        await ir(page, `/invite/${s.servidores.paridade.convite}`);
        await page.getByText(s.servidores.paridade.nome).first().waitFor({ timeout: 20_000 });
      },
    },
    "amigos-online": {
      async fazer(page) {
        await abrirAmigos(page);
        await page.locator('nav[aria-label="Filtrar amigos"] button').filter({ hasText: "Disponível" }).first().click();
      },
    },
    "amigos-adicionar": {
      async fazer(page) {
        await abrirAmigos(page);
        await page.locator('nav[aria-label="Filtrar amigos"] button').filter({ hasText: "Adicionar amigo" }).first().click();
      },
    },
    "dm-conversa": {
      async fazer(page) {
        await abrirConversa(page, "bia");
      },
    },
    "dm-grupo": {
      async fazer(page) {
        await abrirConversa(page, "grupo");
      },
    },
    "canal-texto": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
      },
    },
    "mensagem-hover": {
      mouse: true,
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        const alvo = await centralizar(page, "contraste");
        await alvo.hover({ position: { x: 400, y: 10 } });
        await dormir(400);
      },
    },
    "mensagem-menu": {
      mouse: true,
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        const alvo = await centralizar(page, "contraste");
        await alvo.click({ button: "right", position: { x: 400, y: 10 } });
        await page.locator('[role="menu"]').first().waitFor();
      },
    },
    "composer-autocomplete": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await digitarNoComposer(page, "@");
      },
    },
    "composer-comandos": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await digitarNoComposer(page, "/");
      },
    },
    "seletor-emoji": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await page.getByRole("button", { name: "Emoji", exact: true }).first().click();
        await dormir(800);
      },
    },
    "seletor-gif": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await page.getByRole("button", { name: "GIF", exact: true }).first().click();
        await dormir(800);
      },
    },
    "mensagem-bot": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "bots");
        await centralizar(page, "bot");
      },
    },
    enquete: {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await centralizar(page, "enquete");
      },
    },
    "thread-painel": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        const raiz = await centralizar(page, "thread-raiz");
        await raiz.locator("button").filter({ hasText: "Revisão do leiaute" }).first().click();
        await page.locator('[aria-label="Thread"]').first().waitFor();
        await rede(page);
      },
    },
    fixadas: {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await page.getByRole("button", { name: "Mensagens fixadas" }).first().click();
        await page.locator('[role="dialog"]').first().waitFor();
        await rede(page);
      },
    },
    busca: {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        const campo = page.locator(`input[aria-label="Buscar mensagens em ${s.canais.geral.nome}"]`);
        await campo.fill("leiaute");
        await campo.press("Enter");
        await page.locator('[aria-label="Resultados da busca"]').waitFor();
        await rede(page);
      },
    },
    "caixa-de-entrada": {
      async fazer(page) {
        await abrirAmigos(page);
        // o do cabeçalho de Amigos (`InboxPopover`); a lista de conversas tem
        // outro com o mesmo rótulo, que só dispara o evento que abre este
        await page.locator('button[aria-label^="Caixa de entrada"]:visible').first().click();
        // "Caixa de Entrada" hoje (`InboxPopover`); a caixa-alta pode mudar na
        // migração para o `Popout` (0.8), por isso sem diferenciar maiúsculas
        await page.locator('[role="dialog"][aria-label*="caixa de entrada" i]').first().waitFor();
        await rede(page);
      },
    },
    "perfil-popout": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await perfilDe(page, "bia");
      },
    },
    "perfil-modal": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        const cartao = await perfilDe(page, "bia");
        await cartao.locator('button[aria-label="Mais opções"]').click();
        await page.getByRole("menuitem", { name: "Perfil", exact: true }).click();
        await cartao.waitFor({ state: "detached" }).catch(() => {});
        await page.locator('[role="dialog"]').first().waitFor();
        await rede(page);
      },
    },
    "menu-servidor": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirMenuDoServidor(page);
      },
    },
    "rail-tooltip": {
      mouse: true,
      async fazer(page) {
        await abrirServidor(page);
        await railServidor(page, s.servidores.oficina.nome).hover();
        await page.locator('[role="tooltip"]').first().waitFor();
      },
    },
    "voz-canal": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        // os figurantes em voz aparecem sob o canal de voz, na coluna de canais
        await page
          .locator('[aria-label="Canais"]')
          .getByText(s.usuarios.enzo.displayName)
          .first()
          .waitFor({ timeout: 10_000 });
      },
    },
    "voz-chamada": {
      voz: true,
      async fazer(page) {
        await abrirServidor(page);
        await entrarNaVoz(page);
        await dormir(800);
      },
    },
    "painel-usuario-voz": {
      voz: true,
      async fazer(page) {
        await abrirServidor(page);
        await entrarNaVoz(page);
        // a barra "Voz conectada" continua no painel com um canal de texto na tela
        await abrirCanal(page, "geral");
      },
    },
    "config-minha-conta": {
      async fazer(page) {
        // deep link das configurações (`hooks/useSettingsRoute.ts`)
        await ir(page, "/app?settings=conta");
        await esperarShell(page);
        await page.locator('[role="dialog"]').first().waitFor();
      },
    },
    "config-aparencia": {
      async fazer(page) {
        await ir(page, "/app?settings=aparencia");
        await esperarShell(page);
        await page.locator('[role="dialog"]').first().waitFor();
      },
    },
    "config-servidor-perfil": {
      async fazer(page) {
        await abrirConfigDoServidor(page, "Perfil do servidor");
      },
    },
    "config-servidor-cargos": {
      async fazer(page) {
        await abrirConfigDoServidor(page, "Cargos");
      },
    },
    "modal-criar-servidor": {
      async fazer(page) {
        await page.locator('button[aria-label="Adicionar um servidor"]').click();
        await page.getByRole("menuitem", { name: /Criar um servidor/ }).click();
        await page.locator('[role="dialog"]').first().waitFor();
      },
    },
    "modal-criar-canal": {
      async fazer(page) {
        await abrirServidor(page);
        await page.locator('button[aria-label="Criar canal em Canais de Texto"]').click();
        await page.locator('[role="dialog"]').first().waitFor();
      },
    },
    "modal-convite": {
      async fazer(page) {
        await abrirServidor(page);
        await page.locator(`button[aria-label="Convidar pessoas para ${s.servidores.paridade.nome}"]`).first().click();
        await page.locator('[role="dialog"]').first().waitFor();
        await rede(page);
      },
    },
    "modal-confirmacao": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        // mensagem do próprio dono: "Apagar Mensagem" pede confirmação (sem Shift)
        const alvo = await centralizar(page, "resposta");
        await alvo.click({ button: "right", position: { x: 400, y: 30 } });
        await page.getByRole("menuitem", { name: /Apagar Mensagem/ }).click();
        await page.locator('[role="dialog"]').first().waitFor();
      },
    },
    "troca-rapida": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await page.keyboard.press("Control+K");
        await page.locator('[role="dialog"]').first().waitFor();
      },
    },
    "visualizador-imagem": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        const msg = await centralizar(page, "imagem");
        await msg.locator("img").last().click();
        await page.locator('[role="dialog"]').first().waitFor();
        await rede(page);
      },
    },
  },

  celular: {
    "m-login": {
      logado: false,
      async fazer(page) {
        await ir(page, "/login");
        await page.waitForSelector("#identificador");
      },
    },
    "m-inicio": {
      async fazer(page) {
        await abrirServidor(page);
      },
    },
    "m-mensagens": {
      async fazer(page) {
        await acionar(page, page.locator('nav[aria-label="Servidores"] button[aria-label^="Mensagens diretas"]').first());
        await page.locator("[data-dm-button]").first().waitFor({ timeout: 20_000 });
        await rede(page);
      },
    },
    "m-chat": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
      },
    },
    "m-toque-longo": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        const alvo = await centralizar(page, "contraste");
        await toqueLongo(page, alvo);
        await page.locator('[role="menu"]').first().waitFor();
      },
    },
    "m-voce": {
      async fazer(page) {
        await page.locator('nav[aria-label="Seções"] button').filter({ hasText: "Você" }).first().tap();
        await dormir(600);
        await rede(page);
      },
    },
    "m-perfil-folha": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        const msg = await centralizar(page, "imagem");
        const nome = s.usuarios.bia.displayName;
        await msg.locator(`button[aria-label="Perfil de ${nome}"]`).first().tap();
        await page.locator(`[role="dialog"][aria-label="Perfil de ${nome}"]`).waitFor();
        await rede(page);
      },
    },
    "m-membros": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        // no celular a lista de membros abre pelo título do cabeçalho
        await page.locator("header button").filter({ hasText: s.canais.geral.nome }).first().tap();
        await page.locator('[role="dialog"][aria-label="Membros"]').waitFor();
        await rede(page);
      },
    },
    "m-voz": {
      voz: true,
      async fazer(page) {
        await abrirServidor(page);
        await entrarNaVoz(page);
        await dormir(800);
      },
    },
  },
};

// ── contexto e foto ─────────────────────────────────────────────────────────

function opcoesDoContexto(plataforma) {
  const comum = {
    locale: "pt-BR",
    timezoneId: FUSO,
    colorScheme: "dark",
    // o service worker do PWA faria cache entre contextos e ainda registraria
    // requisições fora do controle da página
    serviceWorkers: "block",
  };
  if (plataforma === "celular") {
    const tela = telas.celular;
    return {
      ...comum,
      userAgent: devices["iPhone 14"]?.userAgent,
      viewport: { width: tela.largura, height: tela.altura },
      screen: { width: tela.largura, height: tela.altura },
      deviceScaleFactor: ESCALA_CELULAR,
      isMobile: true,
      hasTouch: true,
    };
  }
  const tela = telas.desktop;
  return {
    ...comum,
    viewport: { width: tela.largura, height: tela.altura },
    screen: { width: tela.largura, height: tela.altura },
    deviceScaleFactor: 1,
  };
}

/**
 * Antes de qualquer script da página: o aviso de instalação do PWA fica
 * dispensado (`lib/instalacao.ts`, `CHAVE_DE_DISPENSA`) e o cursor de texto
 * fica transparente — piscando, ele aparece em uma foto e não na outra.
 */
function scriptInicial() {
  try {
    localStorage.setItem("streamz:instalacao-dispensada", "1");
  } catch {
    // storage bloqueado: o aviso pode aparecer, e a foto mostra
  }
  const aplicar = () => {
    const estilo = document.createElement("style");
    estilo.setAttribute("data-paridade", "");
    estilo.textContent = "*,*::before,*::after{caret-color:transparent!important}";
    document.documentElement.appendChild(estilo);
  };
  if (document.documentElement) aplicar();
  else document.addEventListener("DOMContentLoaded", aplicar, { once: true });
}

async function imagensProntas(page) {
  await page
    .evaluate(
      () =>
        new Promise((ok) => {
          const pendentes = [...document.images].filter((i) => !i.complete);
          if (pendentes.length === 0) return ok(true);
          let faltam = pendentes.length;
          const um = () => --faltam <= 0 && ok(true);
          for (const i of pendentes) {
            i.addEventListener("load", um, { once: true });
            i.addEventListener("error", um, { once: true });
          }
          setTimeout(() => ok(false), 5_000);
        }),
    )
    .catch(() => {});
}

async function foto(page, arquivo, { mouse = false } = {}) {
  // O clique deixa o ponteiro em cima do alvo, e o hover nasce dali. O canto
  // inferior direito cai na lista de membros / fundo de modal, onde não há
  // hover — o canto de cima à esquerda é a rail, e lá a pílula acenderia.
  if (!mouse && !page.celular) {
    const v = page.viewportSize();
    await page.mouse.move(v.width - 3, v.height - 3);
  }
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
  await rede(page, 5_000);
  await imagensProntas(page);
  await dormir(350);
  await page.screenshot({ path: arquivo, animations: "disabled", caret: "hide" });
}

function observar(page, registro) {
  page.on("console", (m) => {
    if (m.type() === "error") registro.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => registro.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("response", (r) => {
    // 503 da voz e do GIF é o esperado sem LiveKit/Giphy na bancada
    if (r.status() >= 400 && !/\/voice\/token|\/gifs\//.test(r.url())) {
      registro.push(`http ${r.status()}: ${r.url().replace(API, "").replace(WEB, "")}`);
    }
  });
}

// ── figurantes ──────────────────────────────────────────────────────────────

async function loginRest(conta) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identificador: conta.username, password: conta.senha }),
  });
  if (!r.ok) throw new Error(`login de ${conta.username}: HTTP ${r.status}`);
  const sessao = await r.json();
  return sessao.tokens.accessToken;
}

function conectarSocket(token, rotulo) {
  return new Promise((ok, falha) => {
    const sock = io(API, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: 15_000 });
    const limite = setTimeout(() => falha(new Error(`${rotulo}: sem conexão`)), 15_000);
    sock.once("connect", () => {
      clearTimeout(limite);
      ok(sock);
    });
    sock.once("connect_error", (e) => {
      clearTimeout(limite);
      falha(new Error(`${rotulo}: ${e.message}`));
    });
  });
}

/**
 * Um socket por membro com `conectar` (presença) e, para quem tem `voz`, a
 * entrada no canal pelo gateway — sem LiveKit, o estado de voz existe do mesmo
 * jeito (`voice.service.ts` `join`). O dono ganha um socket auxiliar: é por
 * ele que a faxina manda `voice.leave` depois de uma tela que entrou em voz.
 */
async function subirFigurantes() {
  const conexoes = [];
  let ajudante = null;
  if (tem("--sem-figurantes")) return { conexoes, ajudante };
  for (const [chave, u] of Object.entries(s.usuarios)) {
    if (!u.conectar) continue;
    try {
      const sock = await conectarSocket(await loginRest(u), u.username);
      conexoes.push(sock);
      if (u.voz) {
        // o gateway só conhece o usuário do socket depois de terminar o
        // `handleConnection` (assíncrono); um `voice.join` antes disso é
        // ignorado em silêncio. Por isso: espera, confirma pelo `voice.state`
        // e tenta de novo uma vez.
        const canalDeVoz = s.canais[u.voz].id;
        const confirmado = () =>
          new Promise((ok) => {
            const aoEstado = (e) => {
              if (e?.channelId === canalDeVoz && e?.user?.id === u.id && e?.connected) {
                sock.off("voice.state", aoEstado);
                ok(true);
              }
            };
            sock.on("voice.state", aoEstado);
            setTimeout(() => {
              sock.off("voice.state", aoEstado);
              ok(false);
            }, 5_000);
          });
        let entrou = false;
        for (let tentativa = 0; tentativa < 2 && !entrou; tentativa++) {
          await dormir(800);
          const espera = confirmado();
          sock.emit("voice.join", { channelId: canalDeVoz });
          entrou = await espera;
        }
        if (!entrou) console.warn(`! ${u.username} não confirmou a entrada em voz`);
        if (u.mudo) sock.emit("voice.update", { muted: true, deafened: false, video: false, screen: false });
      }
      console.log(`  figurante ${chave}: ${u.presenca}${u.voz ? ` · em voz${u.mudo ? " (mudo)" : ""}` : ""}`);
    } catch (e) {
      console.warn(`! figurante ${chave} não conectou: ${e.message}`);
    }
  }
  try {
    ajudante = await conectarSocket(await loginRest(s.dono), "dono (ajudante)");
  } catch (e) {
    console.warn(`! sem o socket auxiliar do dono (${e.message}): as telas de voz podem deixar o dono na sala`);
  }
  await dormir(1_000);
  return { conexoes, ajudante };
}

// ── passeio ─────────────────────────────────────────────────────────────────

function listar() {
  for (const plataforma of ["desktop", "celular"]) {
    console.log(`\n${plataforma} (${telas[plataforma].largura}×${telas[plataforma].altura})`);
    for (const t of telas[plataforma].telas) {
      const passo = PASSOS[plataforma][t.id];
      console.log(`  ${passo ? "✔" : "✘"} ${t.id.padEnd(24)} onda ${t.onda} — ${t.o_que}`);
    }
    const sobrando = Object.keys(PASSOS[plataforma]).filter((id) => !telas[plataforma].telas.some((t) => t.id === id));
    if (sobrando.length) console.log(`  passos sem tela no telas.json: ${sobrando.join(", ")}`);
  }
}

function carregarResumo() {
  const arq = join(SAIDA, "resumo.json");
  if (!existsSync(arq)) return { telas: [] };
  try {
    return JSON.parse(readFileSync(arq, "utf8"));
  } catch {
    return { telas: [] };
  }
}

async function principal() {
  if (tem("--listar")) {
    listar();
    return;
  }

  const escolhidas = [];
  for (const plataforma of PLATAFORMAS) {
    if (!telas[plataforma]) throw new Error(`plataforma desconhecida: ${plataforma}`);
    for (const t of telas[plataforma].telas) {
      if (SO.size && !SO.has(t.id)) continue;
      escolhidas.push({ plataforma, ...t });
    }
  }
  const desconhecidas = [...SO].filter((id) => !escolhidas.some((t) => t.id === id));
  if (desconhecidas.length) console.warn(`! --so com ids que não estão no telas.json: ${desconhecidas.join(", ")}`);
  if (escolhidas.length === 0) {
    console.error("Nenhuma tela escolhida.");
    process.exitCode = 1;
    return;
  }

  console.log(`Passeio de paridade: ${escolhidas.length} tela(s) · web ${WEB} · relógio ${RELOGIO ?? "real"}`);
  const { conexoes, ajudante } = await subirFigurantes();

  const browser = await chromium.launch({
    headless: true,
    executablePath: executavelDoChromium(),
    args: [
      "--font-render-hinting=none",
      "--disable-lcd-text",
      "--disable-gpu",
      // /dev/shm pequeno no contêiner derruba a aba com "page crashed"
      "--disable-dev-shm-usage",
    ],
    // O Playwright esconde as barras de rolagem em modo sem cabeça; o app tem
    // barra fina estilizada e as referências do Discord a mostram
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });

  const resumo = carregarResumo();
  const porChave = new Map((resumo.telas ?? []).map((t) => [`${t.plataforma}/${t.id}`, t]));
  const gravarResumo = () => {
    const tudo = {
      atualizadoEm: new Date().toISOString(),
      web: WEB,
      relogio: RELOGIO,
      escalaCelular: ESCALA_CELULAR,
      telas: [...porChave.values()],
    };
    writeFileSync(join(SAIDA, "resumo.json"), `${JSON.stringify(tudo, null, 2)}\n`);
  };

  try {
    for (const tela of escolhidas) {
      const passo = PASSOS[tela.plataforma][tela.id];
      const pasta = join(SAIDA, tela.plataforma);
      mkdirSync(pasta, { recursive: true });
      const arquivo = join(pasta, `${tela.id}.png`);
      const falha = join(pasta, `${tela.id}.falha.png`);
      const registro = [];
      const inicio = Date.now();
      const linha = { plataforma: tela.plataforma, id: tela.id, onda: tela.onda, ok: false, arquivo: null, erro: null };

      if (!passo) {
        linha.erro = "sem passos definidos no capturar.mjs";
        porChave.set(`${tela.plataforma}/${tela.id}`, linha);
        gravarResumo();
        console.log(`✘ ${tela.plataforma}/${tela.id} — ${linha.erro}`);
        continue;
      }

      const ctx = await browser.newContext(opcoesDoContexto(tela.plataforma));
      if (RELOGIO) await ctx.clock.setFixedTime(new Date(RELOGIO));
      await ctx.addInitScript(scriptInicial);
      const page = await ctx.newPage();
      page.celular = tela.plataforma === "celular";
      page.setDefaultTimeout(15_000);
      observar(page, registro);

      try {
        const execucao = (async () => {
          if (passo.logado !== false) await entrar(page);
          await passo.fazer(page);
          await foto(page, arquivo, { mouse: passo.mouse });
        })();
        let limite;
        const teto = new Promise((_, falhar) => {
          limite = setTimeout(() => falhar(new Error(`passou de ${TETO_DA_TELA_MS / 1000} s`)), TETO_DA_TELA_MS);
        });
        try {
          await Promise.race([execucao, teto]);
        } finally {
          clearTimeout(limite);
        }
        linha.ok = true;
        linha.arquivo = `${tela.plataforma}/${tela.id}.png`;
      } catch (e) {
        linha.erro = String(e?.message ?? e).split("\n")[0];
        await page.screenshot({ path: falha, animations: "disabled" }).catch(() => {});
      } finally {
        await ctx.close().catch(() => {});
        // a queda do socket do navegador só agenda a saída da voz (carência de
        // reconexão); o `voice.leave` pelo socket auxiliar a efetiva agora, e a
        // próxima tela não herda o dono dentro da sala
        if (passo.voz && ajudante) {
          ajudante.emit("voice.leave");
          await dormir(1_000);
        }
      }

      linha.duracaoMs = Date.now() - inicio;
      linha.avisos = registro.slice(0, 8);
      porChave.set(`${tela.plataforma}/${tela.id}`, linha);
      gravarResumo();
      const segundos = (linha.duracaoMs / 1000).toFixed(1);
      console.log(
        linha.ok
          ? `✔ ${tela.plataforma}/${tela.id} (${segundos} s)${registro.length ? ` · ${registro.length} aviso(s)` : ""}`
          : `✘ ${tela.plataforma}/${tela.id} (${segundos} s) — ${linha.erro}`,
      );
    }
  } finally {
    await browser.close().catch(() => {});
    for (const sock of conexoes) sock.close();
    ajudante?.close();
  }

  const destaRodada = escolhidas.map((t) => porChave.get(`${t.plataforma}/${t.id}`)).filter(Boolean);
  const ok = destaRodada.filter((t) => t.ok);
  const falhas = destaRodada.filter((t) => !t.ok);
  console.log(`\nResumo: ${ok.length} de ${destaRodada.length} tela(s) fotografada(s) em ${SAIDA}`);
  for (const f of falhas) console.log(`  ✘ ${f.plataforma}/${f.id}: ${f.erro}`);
  const comAvisos = ok.filter((t) => t.avisos?.length);
  if (comAvisos.length) {
    console.log("Telas com erro de console ou HTTP (a foto saiu, mas confira):");
    for (const t of comAvisos) console.log(`  ! ${t.plataforma}/${t.id}: ${t.avisos[0]}`);
  }
  console.log(`Resumo completo: ${join(SAIDA, "resumo.json")}`);
  if (falhas.length) process.exitCode = 2;
}

principal().catch((e) => {
  console.error(`✘ o passeio parou: ${e?.stack ?? e}`);
  process.exitCode = 1;
});
