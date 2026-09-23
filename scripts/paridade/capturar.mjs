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
 * - **Bot figurante**: a semente não deixa bot rodando, e botão, modal e
 *   autocomplete de bot só existem com alguém respondendo à interação. Nas
 *   telas marcadas `bot`, este processo abre uma sessão no gateway compatível
 *   (`/gateway`) com o token do Pixel e responde ao `INTERACTION_CREATE` com o
 *   que a semente guardou em `aplicativo.respostas` (callback 9 e 8). Só
 *   nessas telas: com a sessão aberta o Pixel fica online na lista de membros.
 * - **Transmissão de tela**: o contêiner não tem monitor, e `getDisplayMedia` é
 *   a única API que enumera fontes. O `scriptInicial` a troca por um canvas com
 *   um padrão fixo, e daí para a frente o caminho é o de verdade — seletor,
 *   store, LiveKit e grade. A bancada tem LiveKit próprio (`bancada.sh`,
 *   `paridade-livekit`): sem servidor de mídia a grade não tem card de tela,
 *   porque ele nasce de uma **publicação**, não da bandeira `screen` do estado
 *   de voz. Assistir à transmissão de outra pessoa pede um segundo navegador
 *   (`abrirAcompanhante`), pelo mesmo motivo.
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
/**
 * O cliente do gateway compatível do bot figurante: o `ws` que a API já tem
 * instalado (é o mesmo pacote do lado do servidor, `gateway/servidor.ts`); o
 * `WebSocket` global do Node fica de reserva.
 */
const ClienteWs = (() => {
  try {
    return createRequire(join(RAIZ, "apps/api/package.json"))("ws");
  } catch {
    return globalThis.WebSocket ?? null;
  }
})();

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

/** `conta` é o dono por padrão; o acompanhante entra com outra (ver `abrirAcompanhante`). */
async function entrar(page, conta = s.dono) {
  await ir(page, "/login");
  await page.fill("#identificador", conta.username);
  await page.fill("#password", conta.senha);
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

/**
 * Leva a mensagem ao meio da lista — o que está acima do fim não aparece
 * sozinho. `bloco: "start"` a alinha no topo, para mensagem mais alta que meia
 * tela (a v2 do Pixel) sair inteira com o que vem logo depois dela.
 */
async function centralizar(page, chaveDaMensagem, bloco = "center") {
  const id = s.mensagens[chaveDaMensagem];
  if (!id) throw new Error(`mensagem "${chaveDaMensagem}" não está no manifesto (semente antiga? rode \`bancada.sh semear\`)`);
  const alvo = page.locator(`#mensagem-${id}`);
  await alvo.waitFor({ timeout: 20_000 });
  await alvo.evaluate((el, b) => el.scrollIntoView({ block: b }), bloco);
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
  // "Config. do servidor" é o rótulo do Discord (print `101733`) desde a onda 1;
  // o nome longo fica aceito para o passeio ainda rodar sobre a árvore antiga
  await page.getByRole("menuitem", { name: /^Config(\.|urações) do servidor$/ }).click();
  await page.locator('[role="dialog"]').first().waitFor();
  await page.getByText(aba, { exact: true }).first().click();
  await rede(page);
}

const campoDoComposer = (page, canal = "geral") =>
  page.locator(`textarea[aria-label="Mensagem para #${s.canais[canal].nome}"]`);

async function digitarNoComposer(page, texto, canal = "geral") {
  const campo = campoDoComposer(page, canal);
  await acionar(page, campo);
  await campo.pressSequentially(texto);
  await page.locator('[role="listbox"]').first().waitFor();
}

/**
 * Muda preferências pelo mesmo lugar em que o app as guarda (o `persist` da
 * store de configurações, `stores/settings.ts`) e recarrega: é o caminho de
 * quem abre o app já em Ash/Onyx ou no modo compacto, que é também o que o
 * script do `<head>` precisa pintar sem piscar o padrão.
 */
async function mudarConfiguracoes(page, valores) {
  await page.evaluate((v) => {
    const cru = localStorage.getItem("settings");
    const salvo = cru ? JSON.parse(cru) : { state: {}, version: 4 };
    salvo.state = { ...(salvo.state ?? {}), ...v };
    localStorage.setItem("settings", JSON.stringify(salvo));
  }, valores);
  await page.reload();
  await esperarShell(page);
}

async function escolherTema(page, tema) {
  await mudarConfiguracoes(page, { theme: tema });
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

/**
 * Traz de volta a moldura do palco — nome, controles e o botão de expandir.
 *
 * `useOcultarInativo` a apaga depois de 3 s de ponteiro parado, e apagada ela é
 * `pointer-events-none`: clicar em "Compartilhar tela" sem isto dá tempo
 * esgotado, não erro de seletor.
 */
async function acordarOPalco(page) {
  await page
    .locator("[data-voice-panel], [data-call-stage]")
    .first()
    .hover({ position: { x: 24, y: 24 } });
}

/**
 * Espera a moldura do palco se apagar, com o ponteiro fora dela.
 *
 * Os 3 s do `useOcultarInativo` caem **dentro** do prazo da foto: sem esperá-los
 * a mesma tela sai com a sobreposição numa rodada e sem ela na seguinte. Quem
 * quer os controles na foto faz o contrário — prende o ponteiro sobre eles, e
 * aí o `preso` do hook os mantém (ver `voz-controles-hover`).
 */
async function palcoSemMoldura(page) {
  const v = page.viewportSize();
  // Passar pela moldura **antes** de sair não é supérfluo: o `preso` do hook
  // só se solta com um `pointerleave`, e o seletor de tela é um portal para o
  // `body` — React conta o portal como filho de quem o renderizou (a cápsula
  // de controles), então fechar o modal com o ponteiro em cima dele nunca
  // gera esse `pointerleave` e a moldura fica acesa para sempre. Entrar no
  // cabeçalho e sair dele devolve o hook ao estado normal.
  await acordarOPalco(page);
  // agora fora do palco, na faixa vazia da coluna de canais acima do painel do
  // usuário: dentro, o próprio movimento reacenderia a moldura
  const palco = await page.locator("[data-voice-panel], [data-call-stage]").first().boundingBox();
  await page.mouse.move(Math.max(8, (palco?.x ?? 380) - 60), v.height - 200);
  // o botão em que se clicou continua **focado**, e a dica dele nasce também do
  // foco: sem isto a foto sai com um balão pendurado no canto da tela
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await dormir(3_500);
}

/**
 * O botão de tela **da cápsula de controles do palco**.
 *
 * Há um segundo igual no painel "Voz conectada", no rodapé da coluna da
 * esquerda (`ScreenShareButton variante="largo"`), e um `getByRole` solto pega
 * aquele: a dica sairia pendurada no canto da tela e o hover não prenderia a
 * moldura do palco, que é o que esta bancada precisa.
 */
const botaoDeTelaDoPalco = (page, rotulo) =>
  page
    .locator(
      `[data-voice-panel] button[aria-label="${rotulo}"], [data-call-stage] button[aria-label="${rotulo}"]`,
    )
    .first();

/**
 * Espera um `<video>` do palco ter quadro de verdade.
 *
 * O elemento nasce **antes** da faixa: assinar a tela de alguém é uma ida e
 * volta ao servidor de mídia, e esperar só o elemento aparecer fotografaria o
 * retângulo preto de "carregando a transmissão".
 */
async function esperarQuadroDeVideo(page, seletor) {
  await page.waitForFunction(
    (sel) => {
      const v = document.querySelector(sel);
      return !!v && v.readyState >= 2 && v.videoWidth > 0;
    },
    seletor,
    { timeout: 45_000 },
  );
}

/** Abre o seletor de transmissão pelo botão da barra de controles. */
async function abrirSeletorDeTela(page) {
  await acordarOPalco(page);
  await acionar(page, botaoDeTelaDoPalco(page, "Compartilhar tela"));
  const modal = page.getByRole("dialog", { name: "Compartilhar sua tela" });
  await modal.waitFor({ timeout: 20_000 });
  // o modal entra animado; sem esta pausa a foto pega o meio do fade
  await dormir(500);
  return modal;
}

/**
 * Vai ao ar pelo caminho do usuário: botão da barra → seletor → "Escolher
 * janela" (que é quem chama o `getDisplayMedia` falsificado do `scriptInicial`)
 * → clique na miniatura que voltou.
 *
 * Nada aqui é atalho: a store, o LiveKit e a grade recebem a mesma sequência
 * que recebem de uma tela de verdade — só a fonte é um canvas.
 */
async function irAoVivoComATelaFalsa(page) {
  const modal = await abrirSeletorDeTela(page);
  await modal.getByRole("button", { name: /^Escolher (janela|tela)$/ }).click();
  // a captura volta como a única miniatura da grade, e clicar nela é o "ir ao ar"
  await modal.locator("button:has(video)").first().click({ timeout: 20_000 });
  // o seletor só fecha depois de a transmissão subir de verdade (`screenOn`)
  await modal.waitFor({ state: "detached", timeout: 30_000 });
  await botaoDeTelaDoPalco(page, "Parar transmissão").waitFor({ timeout: 30_000 });
  await esperarQuadroDeVideo(page, "[data-voice-panel] video, [data-call-stage] video");
}

// ── figurantes que fazem alguma coisa durante uma tela ──────────────────────

/** Os sockets dos figurantes, por chave do manifesto (ver `subirFigurantes`). */
const figurantes = new Map();

/**
 * O que desfazer quando a foto sair, na ordem inversa de quem pediu.
 *
 * Mesma razão do `voice.leave` do ajudante: a bancada restaura o banco uma vez
 * por passeio, não por tela — um figurante que ficasse "ao vivo", ou um
 * acompanhante que ficasse na sala, apareceria em todas as telas seguintes.
 */
const desfazer = [];

function socketDoFigurante(chave) {
  const sock = figurantes.get(chave);
  if (!sock) throw new Error(`o figurante "${chave}" não está conectado (--sem-figurantes?)`);
  return sock;
}

/**
 * "Fulano atende" — o `call.accept` do figurante numa conversa direta.
 *
 * Sem alguém do outro lado a chamada passa 30 s em "Chamando…" e a foto seria a
 * tela de espera, não a chamada.
 */
function atenderComoFigurante(chave, channelId) {
  const sock = socketDoFigurante(chave);
  sock.emit("call.accept", { channelId });
  desfazer.push(async () => {
    sock.emit("voice.leave");
    await dormir(500);
  });
}

/**
 * Chamada de conversa direta **atendida**: eu ligo, o figurante atende.
 *
 * Sem o atendimento o palco fica em "Chamando…" — e é ele que traz o palco de
 * verdade, com tile, grade e a barra de controles onde mora o botão de tela.
 */
async function abrirChamadaNaConversa(page, chave) {
  await abrirConversa(page, chave);
  const sock = socketDoFigurante(chave);
  const channelId = s.conversas[chave].id;
  // um `call.accept` antes de o `POST /dms/:id/call` voltar é recusado calado
  // (a chamada ainda não "nasceu" no servidor). O `call.ring` é o próprio
  // servidor avisando o figurante de que a chamada nasceu e pode ser
  // atendida — mesma ideia do `voice.state` que `subirFigurantes` espera antes
  // de confirmar um `voice.join`. A escuta começa **antes** do clique: o
  // evento sai do servidor assim que o `POST` processa, o que pode acontecer
  // antes de a resposta HTTP voltar ao navegador — escutar só depois do
  // clique correria o risco de perder o evento por essa mesma corrida.
  const chamadaTocou = new Promise((ok) => {
    const aoTocar = (e) => {
      if (e?.channelId === channelId) {
        sock.off("call.ring", aoTocar);
        ok(true);
      }
    };
    sock.on("call.ring", aoTocar);
    setTimeout(() => {
      sock.off("call.ring", aoTocar);
      ok(false);
    }, 15_000);
  });
  await acionar(page, page.locator('button[aria-label="Iniciar chamada de voz"]').first());
  await page.locator("[data-call-stage]").first().waitFor({ timeout: 20_000 });
  if (!(await chamadaTocou)) {
    console.warn(`! ${chave}: não recebeu "call.ring" a tempo — atendendo mesmo assim`);
  }
  atenderComoFigurante(chave, channelId);
  await page
    .locator(`[data-call-stage] [aria-label="${esc(s.usuarios[chave].displayName)}"]`)
    .first()
    .waitFor({ timeout: 20_000 });
}

/**
 * Um **segundo navegador**, logado como outra pessoa, na mesma sala de voz e
 * transmitindo de verdade.
 *
 * É o único jeito de fotografar "assistindo": o card de tela da grade vem de
 * uma publicação do LiveKit, não da bandeira `screen` do estado de voz — um
 * socket figurante acende o "Ao vivo" da lista de canais e nada mais.
 *
 * A saída é pelo **botão de desconectar**, e não só fechando o contexto: a
 * queda do socket apenas *agenda* a saída da voz (carência de reconexão do
 * `chat.gateway.ts`), e a tela seguinte herdaria mais uma pessoa na sala.
 */
async function abrirAcompanhante(page, chave) {
  const ctx = await page.context().browser().newContext(opcoesDoContexto("desktop"));
  if (RELOGIO) await ctx.clock.setFixedTime(new Date(RELOGIO));
  await ctx.addInitScript(scriptInicial);
  const outra = await ctx.newPage();
  outra.celular = false;
  // o caminho é longo (login, servidor, voz, seletor, publicação) e roda dentro
  // do teto da tela que o pediu; os 15 s padrão não bastam para cada passo
  outra.setDefaultTimeout(30_000);
  desfazer.push(async () => {
    // se o clique falhar (seletor mudou, botão sumiu) a função cai para só
    // fechar o contexto — o que reintroduz a carência de 45 s e vaza a
    // figurante para a(s) tela(s) seguinte(s). Sem aviso aqui, esse defeito
    // não deixa pista nenhuma no console.
    await outra
      .locator('button[aria-label="Desconectar"]')
      .first()
      .click({ timeout: 5_000 })
      .catch((e) => console.warn(`! abrirAcompanhante: desconectar não clicou (${e.message})`));
    await dormir(800);
    await ctx.close().catch(() => {});
  });
  await entrar(outra, s.usuarios[chave]);
  await abrirServidor(outra);
  await entrarNaVoz(outra);
  await irAoVivoComATelaFalsa(outra);
  return outra;
}

// ── bot figurante ───────────────────────────────────────────────────────────

/** As respostas que a semente guardou para o Pixel (`RESPOSTAS_DO_BOT` do `semente.mjs`). */
function respostasDoBot() {
  const r = s.aplicativo?.respostas;
  if (!r) throw new Error("o manifesto não tem aplicativo.respostas (semente antiga? rode `bancada.sh semear`)");
  return r;
}

/** As escolhas do autocomplete de `comando`, filtradas pelo que se digitou — o que um bot de verdade faria. */
function escolhasDoAutocomplete(comando, termo) {
  const todas = respostasDoBot().autocomplete?.[comando] ?? [];
  const q = String(termo ?? "").trim().toLowerCase();
  const filtradas = q ? todas.filter((c) => c.name.toLowerCase().includes(q)) : todas;
  // até 25: o teto do Discord, que a API recusa acima disso
  return filtradas.slice(0, 25);
}

/**
 * O token do Pixel: o do manifesto; sem ele (manifesto de antes deste campo),
 * um novo pela rota do dono (`POST /applications/:id/token`), que revoga o
 * anterior — sem efeito fora da bancada, que restaura o banco a cada passeio.
 */
async function tokenDoBot() {
  if (s.aplicativo?.token) return s.aplicativo.token;
  const acesso = await loginRest(s.dono);
  const r = await fetch(`${API}/api/applications/${s.aplicativo.id}/token`, {
    method: "POST",
    headers: { authorization: `Bearer ${acesso}` },
  });
  if (!r.ok) throw new Error(`token do bot: HTTP ${r.status}`);
  return (await r.json()).token;
}

/**
 * Sessão de gateway do Pixel, do `HELLO` ao `READY`, respondendo às interações:
 *
 * - componente (3) cujo `custom_id` tem modal na semente → callback 9 (MODAL);
 * - outro componente → callback 6 (DEFERRED_UPDATE_MESSAGE): sem resposta em 3 s
 *   a web pintaria "a interação falhou" (`PRAZO_DA_RESPOSTA_DO_BOT_MS`);
 * - autocomplete (4) → callback 8 com `escolhasDoAutocomplete`.
 *
 * `INTERACTION_CREATE` não depende de intent (`interactions.service.ts`,
 * `despachar`), por isso o IDENTIFY vai com `intents: 0`.
 */
async function subirBotFigurante() {
  respostasDoBot();
  if (!ClienteWs) throw new Error("bot figurante: sem cliente WebSocket (nem o `ws` da API nem o global)");
  const token = await tokenDoBot();
  const sock = new ClienteWs(`${API.replace(/^http/, "ws")}/gateway?v=10&encoding=json`);
  let seq = null;
  let relogio = null;
  const enviar = (quadro) => {
    if (sock.readyState === 1) sock.send(JSON.stringify(quadro));
  };

  async function responder(i) {
    const modal = i.type === 3 ? respostasDoBot().modais?.[i.data?.custom_id] : undefined;
    let corpo = null;
    if (modal) corpo = { type: 9, data: modal };
    else if (i.type === 3) corpo = { type: 6 };
    else if (i.type === 4) {
      const foco = (i.data?.options ?? []).find((o) => o.focused);
      corpo = { type: 8, data: { choices: escolhasDoAutocomplete(i.data?.name, foco?.value) } };
    }
    if (!corpo) return;
    try {
      const r = await fetch(`${API}/api/v10/interactions/${i.id}/${i.token}/callback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) console.warn(`! bot figurante: callback ${corpo.type} → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } catch (e) {
      console.warn(`! bot figurante: callback ${corpo.type} falhou (${e.message})`);
    }
  }

  const fechar = () => {
    clearInterval(relogio);
    try {
      sock.close();
    } catch {
      // já fechado
    }
  };

  const conectado = new Promise((ok, falha) => {
    const limite = setTimeout(() => falha(new Error("bot figurante: sem READY em 15 s")), 15_000);
    const desistir = (motivo) => {
      clearTimeout(limite);
      clearInterval(relogio);
      falha(new Error(`bot figurante: ${motivo}`));
    };
    sock.addEventListener("error", (e) => desistir(e?.message ?? "erro no WebSocket"));
    sock.addEventListener("close", (e) => desistir(`o gateway fechou (${e?.code ?? "?"} ${e?.reason ?? ""})`));
    sock.addEventListener("message", (ev) => {
      let quadro;
      try {
        quadro = JSON.parse(String(ev.data));
      } catch {
        return; // quadro binário: só com compress, que não pedimos
      }
      if (typeof quadro.s === "number") seq = quadro.s;
      if (quadro.op === 10) {
        relogio = setInterval(() => enviar({ op: 1, d: seq }), quadro.d?.heartbeat_interval ?? 41_250);
        enviar({ op: 2, d: { token, intents: 0, properties: { os: "linux", browser: "paridade", device: "paridade" } } });
      } else if (quadro.op === 0 && quadro.t === "READY") {
        clearTimeout(limite);
        ok();
      } else if (quadro.op === 0 && quadro.t === "INTERACTION_CREATE") {
        void responder(quadro.d ?? {});
      }
    });
  });
  try {
    await conectado;
  } catch (e) {
    // sem READY a sessão não serve, e não pode ficar aberta até o fim do passeio
    fechar();
    throw e;
  }
  return { fechar };
}

// ── o mapa: tela → passos ───────────────────────────────────────────────────
//
// `logado: false` = contexto sem login. `mouse: true` = a foto quer o ponteiro
// onde o passo o deixou (hover, tooltip). `voz: true` = o passo entrou em voz,
// e a faxina tira o dono da sala antes da próxima tela. `bot: true` = o bot
// figurante fica conectado durante a tela (ver o cabeçalho).
//
// O que o passo pede de fora da página — um figurante que atende a chamada, um
// acompanhante que transmite — se registra em `desfazer`, e a faxina o desfaz
// antes da tela seguinte.

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
      // conectado, como a referência mapeada (`101842`): nome do canal claro,
      // cronômetro e "Convidar para voz". Sem entrar, "Geral" saía cinza
      // (#81828a em x=91–108, y=463 da captura de 2026-09-14) e a tela não
      // era comparável.
      voz: true,
      async fazer(page) {
        await abrirServidor(page);
        await entrarNaVoz(page);
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
    "voz-seletor-tela": {
      voz: true,
      async fazer(page) {
        await abrirServidor(page);
        await entrarNaVoz(page);
        await abrirSeletorDeTela(page);
      },
    },
    "voz-transmitindo": {
      voz: true,
      // o ponteiro fica onde `palcoSemMoldura` o deixou: mexer nele de novo na
      // hora da foto acenderia a sobreposição que esta tela não quer
      mouse: true,
      async fazer(page) {
        await abrirServidor(page);
        await entrarNaVoz(page);
        await irAoVivoComATelaFalsa(page);
        // a minha tela é mais um card da grade, com o selo "Ao vivo" — ela não
        // assume o palco (ver `telaQueAssumeOPalco`, em `VoiceGrid.tsx`)
        await page.locator('[aria-label$="— tela compartilhada"]').first().waitFor({ timeout: 20_000 });
        await esperarQuadroDeVideo(page, "[data-voice-panel] video");
        await palcoSemMoldura(page);
      },
    },
    "voz-assistindo": {
      voz: true,
      mouse: true,
      async fazer(page) {
        await abrirServidor(page);
        await entrarNaVoz(page);
        await abrirAcompanhante(page, "gabi");
        const nome = s.usuarios.gabi.displayName;
        const convite = page.locator(`button[aria-label="Assistir à transmissão de ${esc(nome)}"]`).first();
        await convite.waitFor({ timeout: 30_000 });
        await convite.click();
        await esperarQuadroDeVideo(page, "[data-voice-panel] video");
        await palcoSemMoldura(page);
      },
    },
    "voz-palco-expandido": {
      // O palco expandido é da **conversa direta**: lá ele nasce como faixa de
      // 199px sobre a conversa e o botão o promove à área inteira
      // (`ui.palcoExpandido`, em `CallStage`). Em canal de servidor não há o que
      // expandir — o chat do canal nasce fechado (`CHAT_ABERTO_POR_PADRAO`) e o
      // palco já ocupa a coluna toda, como mostra a `voz-transmitindo`.
      voz: true,
      mouse: true,
      async fazer(page) {
        await abrirChamadaNaConversa(page, "bia");
        await irAoVivoComATelaFalsa(page);
        await acordarOPalco(page);
        await acionar(page, page.getByRole("button", { name: "Expandir o palco" }).first());
        await palcoSemMoldura(page);
      },
    },
    "voz-controles-hover": {
      voz: true,
      mouse: true,
      async fazer(page) {
        await abrirServidor(page);
        await entrarNaVoz(page);
        await irAoVivoComATelaFalsa(page);
        // o ponteiro **sobre a cápsula** é o que prende a sobreposição no ar
        // (`preso`, em `useOcultarInativo`): fora dela os 3 s correriam e a
        // foto sairia limpa numa rodada e com os controles na outra
        await botaoDeTelaDoPalco(page, "Parar transmissão").hover();
        await dormir(800);
      },
    },
    "dm-chamada": {
      voz: true,
      mouse: true,
      async fazer(page) {
        await abrirChamadaNaConversa(page, "bia");
        await irAoVivoComATelaFalsa(page);
        await palcoSemMoldura(page);
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
        // o "+" da rail abre o modal direto, como no Discord (rodada de
        // correção); antes passava por um menu com "Criar um servidor"
        await page.locator('button[aria-label="Adicionar um servidor"]').click();
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
        // mensagem do próprio dono: "Excluir mensagem" pede confirmação (sem Shift).
        // O nome vai sem caixa no meio da frase de propósito: a onda 0 passou os
        // rótulos de menu para frase capitalizada, como o Discord — a regex é
        // insensível a caixa para não quebrar de novo numa troca dessas.
        const alvo = await centralizar(page, "resposta");
        await alvo.click({ button: "right", position: { x: 400, y: 30 } });
        // o menu diz "Excluir mensagem" (MessageItem.tsx:523) — não existe
        // "Apagar mensagem" em lugar nenhum do código.
        await page.getByRole("menuitem", { name: /excluir mensagem/i }).click();
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
    download: {
      logado: false,
      async fazer(page) {
        await ir(page, "/download");
        await page.locator("#download-titulo").waitFor({ timeout: 20_000 });
        await rede(page);
      },
    },
    "download-senha": {
      logado: false,
      async fazer(page) {
        await ir(page, "/download");
        await page.locator("#download-titulo").waitFor({ timeout: 20_000 });
        await rede(page);
        await page.getByRole("button", { name: /^Baixar para / }).first().click();
        await page.locator('[role="dialog"]').first().waitFor();
        await dormir(400);
      },
    },
    "tema-ash": {
      async fazer(page) {
        await escolherTema(page, "ash");
        await abrirServidor(page);
        await abrirCanal(page, "geral");
      },
    },
    "tema-onyx": {
      async fazer(page) {
        await escolherTema(page, "onyx");
        await abrirServidor(page);
        await abrirCanal(page, "geral");
      },
    },
    "config-acessibilidade": {
      async fazer(page) {
        await ir(page, "/app?settings=acessibilidade");
        await esperarShell(page);
        await page.locator('[role="dialog"]').first().waitFor();
      },
    },
    "mensagem-bot-v2": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "bots");
        // no topo, e não no meio: a v2 passa de meia tela, e centralizada ela
        // cortava em cima; abaixo dela vem o embed sem cor (`bot-sem-cor`)
        await centralizar(page, "bot-v2", "start");
      },
    },
    "mensagem-bot-compacta": {
      async fazer(page) {
        await mudarConfiguracoes(page, { compactMode: true });
        await abrirServidor(page);
        await abrirCanal(page, "bots");
        // a mesma mensagem da `mensagem-bot`, para as duas fotos se compararem
        await centralizar(page, "bot");
      },
    },
    "select-de-bot-aberto": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "bots");
        const msg = await centralizar(page, "bot-componentes");
        // o placeholder é o rótulo do gatilho e da lista (`SelectDeBot.tsx`);
        // o texto vem da mensagem `bot-componentes` da semente
        await msg.locator('[role="combobox"][aria-label="Escolha um serviço"]').first().click();
        await page.locator('ul[role="listbox"][aria-label="Escolha um serviço"]').first().waitFor();
        await dormir(300);
      },
    },
    "modal-de-bot": {
      bot: true,
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "bots");
        const msg = await centralizar(page, "bot-componentes");
        await msg.getByRole("button", { name: "Detalhes", exact: true }).first().click();
        const titulo = respostasDoBot().modais["status:detalhes"].title;
        await page.locator('[role="dialog"]').filter({ hasText: titulo }).first().waitFor({ timeout: 15_000 });
        await rede(page);
        await dormir(400);
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
        // a lista ainda assenta (imagens e prévias chegando) logo depois de
        // centralizar; tocar antes disso acerta outra coisa ou nada
        await dormir(1_000);
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
        // no celular o título do cabeçalho abre os detalhes do canal, que
        // começam na aba Membros (onda 8; antes era um diálogo só de membros)
        await page.locator("header button").filter({ hasText: s.canais.geral.nome }).first().tap();
        await page.getByRole("tab", { name: "Membros" }).first().waitFor();
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
    "m-download": {
      logado: false,
      async fazer(page) {
        await ir(page, "/download");
        await page.locator("#download-titulo").waitFor({ timeout: 20_000 });
        await rede(page);
      },
    },
    "m-gaveta": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        // a conversa entra animada (`anim-empilhar`, 220ms): antes disso o ponto
        // do dedo ainda cai na rail por baixo, e o gesto (com razão) não começa
        await dormir(700);
        // arrasto de DEDO parado no meio: a foto sai antes de soltar. Toque de
        // verdade pelo CDP — o mouse do Playwright seleciona texto no caminho, e
        // o gesto (com razão) não começa com seleção ativa
        const v = page.viewportSize();
        const y = Math.round(v.height / 2);
        const cdp = await page.context().newCDPSession(page);
        const toque = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
        await toque("touchStart", 60);
        for (let x = 60; x <= 60 + Math.round(v.width * 0.45); x += 8) {
          await toque("touchMove", x);
          await dormir(16);
        }
      },
    },
    "m-detalhes-canal": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await page.locator("header button").filter({ hasText: s.canais.geral.nome }).first().tap();
        await page.getByRole("tablist", { name: "Seções do canal" }).waitFor();
        await rede(page);
      },
    },
    "m-detalhes-fixadas": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await page.locator("header button").filter({ hasText: s.canais.geral.nome }).first().tap();
        await page.getByRole("tab", { name: "Fixadas" }).first().tap();
        await rede(page);
        await dormir(400);
      },
    },
    "m-busca": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "geral");
        await page.getByRole("button", { name: /^Buscar em / }).first().tap();
        await dormir(600);
        await page.keyboard.type("paridade");
        await page.keyboard.press("Enter");
        await rede(page);
        await dormir(600);
      },
    },
    "m-config": {
      async fazer(page) {
        await page.locator('nav[aria-label="Seções"] button').filter({ hasText: "Você" }).first().tap();
        await page.getByRole("button", { name: "Configurações do usuário" }).first().tap();
        await dormir(800);
      },
    },
    "m-mensagem-bot": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "bots");
        await centralizar(page, "bot");
      },
    },
    "m-select-de-bot": {
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "bots");
        // o select de usuário múltiplo da `bot-sem-cor`: é o que abre a folha
        // com título, Concluir e busca juntos (ver a semente)
        const msg = await centralizar(page, "bot-sem-cor");
        await msg.locator('[role="combobox"][aria-label="Quem revisa?"]').first().tap();
        await page.locator('ul[role="listbox"][aria-label="Quem revisa?"]').first().waitFor();
        // a folha sobe animada
        await dormir(600);
      },
    },
    "m-autocomplete-de-bot": {
      bot: true,
      async fazer(page) {
        await abrirServidor(page);
        await abrirCanal(page, "bots");
        const campo = campoDoComposer(page, "bots");
        await acionar(page, campo);
        // em duas partes: o espaço fecha o nome e já pede as sugestões da opção
        // (sem espera); o termo pede de novo depois dos 250 ms do composer
        await campo.pressSequentially("/buscar ");
        await campo.pressSequentially("lo", { delay: 40 });
        const primeira = escolhasDoAutocomplete("buscar", "lo")[0];
        if (!primeira) throw new Error("a semente não tem escolhas de autocomplete para /buscar");
        await page.locator('[role="option"]').filter({ hasText: primeira.name }).first().waitFor({ timeout: 15_000 });
        await dormir(400);
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
 * dispensado (`lib/instalacao.ts`, `CHAVE_DE_DISPENSA`), o cursor de texto fica
 * transparente — piscando, ele aparece em uma foto e não na outra — e
 * `getDisplayMedia` passa a devolver um canvas no lugar da tela do sistema.
 */
function scriptInicial() {
  try {
    localStorage.setItem("streamz:instalacao-dispensada", "1");
  } catch {
    // storage bloqueado: o aviso pode aparecer, e a foto mostra
  }

  /**
   * Compartilhar tela **sem tela**.
   *
   * O contêiner da captura não tem monitor nenhum, e `getDisplayMedia` é a
   * única API capaz de enumerar fontes: sem ela o seletor cai em "A captura de
   * tela não está disponível neste sistema" e a área que mais precisa de régua
   * fica sem nenhuma. Falsificar **só a fonte** mantém tudo o que interessa
   * medindo o caminho de verdade — o seletor, a store, o `publishTrack` no
   * LiveKit e a grade não sabem que do outro lado há um canvas.
   *
   * O padrão é sempre **o mesmo**: sem relógio, sem aleatório e sem animação,
   * porque a foto tem de sair igual em toda rodada. Ele é redesenhado num
   * intervalo, e isso não é enfeite: um canvas que ninguém suja só produz o
   * primeiro quadro, e o `captureStream` seca logo depois — quem transmitia
   * via o próprio quadro parado (a faixa é local), quem assistia recebia um
   * keyframe e mais nada, com o SFU pedindo PLI para sempre. Redesenhar o
   * idêntico mantém a faixa viva sem mexer um pixel.
   */
  const capturaFalsa = () => {
    const tela = document.createElement("canvas");
    tela.width = 1280;
    tela.height = 720;
    const p = tela.getContext("2d");
    const desenhar = () => {
      p.fillStyle = "#0f1116";
      p.fillRect(0, 0, 1280, 720);
      // "janela" com barra de título e três botões, para a miniatura ler como
      // uma tela compartilhada e não como um retângulo colorido qualquer
      p.fillStyle = "#1c1f27";
      p.fillRect(80, 60, 1120, 600);
      p.fillStyle = "#262a34";
      p.fillRect(80, 60, 1120, 44);
      const botoes = ["#e0656a", "#e3b341", "#5ec26a"];
      for (let i = 0; i < 3; i++) {
        p.beginPath();
        p.arc(110 + i * 26, 82, 7, 0, Math.PI * 2);
        p.fillStyle = botoes[i];
        p.fill();
      }
      // "linhas de código": larguras e recuos fixos, nada de aleatório
      const linhas = [520, 380, 640, 300, 720, 460, 240, 580, 340, 500];
      for (let i = 0; i < linhas.length; i++) {
        p.fillStyle = i % 3 === 0 ? "#7f8697" : i % 3 === 1 ? "#4f5563" : "#3a3f4b";
        p.fillRect(120 + (i % 2) * 28, 150 + i * 34, linhas[i], 14);
      }
      p.fillStyle = "#c8ff4d";
      p.font = "bold 56px sans-serif";
      p.fillText("TELA DE TESTE", 120, 560);
      p.fillStyle = "#7f8697";
      p.font = "28px sans-serif";
      p.fillText("bancada de paridade", 124, 606);
      // faixa de cores do rodapé: dá ao olho (e à folha de comparação) uma
      // referência de cor que não depende de fonte nem de antialiasing
      const cores = ["#e0656a", "#e3b341", "#5ec26a", "#4d9fff", "#b07cff", "#f0f2f5"];
      for (let i = 0; i < cores.length; i++) {
        p.fillStyle = cores[i];
        p.fillRect(80 + i * 186.66, 668, 176, 32);
      }
    };
    desenhar();
    setInterval(desenhar, 200);
    return tela.captureStream(5);
  };

  // `mediaDevices` existe em contexto seguro, e `localhost` é um: se um dia não
  // existir, o objeto mínimo abaixo mantém o seletor no caminho do navegador
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
  }
  navigator.mediaDevices.getDisplayMedia = async () => capturaFalsa();
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
      // por chave também: é assim que um passo pede "fulano começa a
      // transmitir" ou "fulano atende" (ver `atenderComoFigurante`)
      figurantes.set(chave, sock);
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

      let bot = null;
      const ctx = await browser.newContext(opcoesDoContexto(tela.plataforma));
      if (RELOGIO) await ctx.clock.setFixedTime(new Date(RELOGIO));
      await ctx.addInitScript(scriptInicial);
      const page = await ctx.newPage();
      page.celular = tela.plataforma === "celular";
      page.setDefaultTimeout(15_000);
      observar(page, registro);

      try {
        const execucao = (async () => {
          if (passo.bot) bot = await subirBotFigurante();
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
        // o que os passos pediram durante a tela (figurante ao vivo, chamada
        // atendida, acompanhante transmitindo) some antes da próxima
        while (desfazer.length) {
          await desfazer.pop()().catch((e) => console.warn(`! desfazer: ${e.message}`));
        }
        bot?.fechar();
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
    while (desfazer.length) await desfazer.pop()().catch(() => {});
    await browser.close().catch(() => {});
    for (const sock of conexoes) sock.close();
    figurantes.clear();
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
