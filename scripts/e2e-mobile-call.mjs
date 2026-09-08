/**
 * A CHAMADA no leiaute de celular, com capturas — o complemento de
 * `e2e-mobile.mjs`, que fotografa tudo menos a call.
 *
 * Sobe **dois participantes de verdade** (dois contextos de browser, duas
 * conexões ao LiveKit): a Ana num iPhone emulado e o Beto numa janela de
 * desktop. O Beto liga a câmera e transmite a tela; a Ana é quem aparece nas
 * fotos, porque é o telefone que está sendo desenhado.
 *
 *   node scripts/e2e-mobile-call.mjs --out /out/mobile --web http://localhost:3003 --usuario xipwp
 *
 * Pré-requisitos, e eles são inegociáveis para esta foto valer:
 *   - API com `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` de um
 *     servidor LiveKit no ar, e a web com `NEXT_PUBLIC_LIVEKIT_URL`. Sem isso
 *     a sala tem gente mas não tem mídia, e o palco fotografa avatares.
 *   - Chromium com `--use-fake-device-for-media-stream` e
 *     `--use-fake-ui-for-media-stream` (câmera e microfone sintéticos, sem
 *     diálogo de permissão) e `--auto-select-desktop-capture-source` para o
 *     `getDisplayMedia` não parar num seletor que ninguém pode clicar.
 *
 * Quando o `getDisplayMedia` do headless não devolve fonte nenhuma — acontece,
 * porque não há desktop —, o script **diz isso** e publica uma faixa de câmera
 * como `ScreenShare` pela store, que exercita exatamente o mesmo caminho de
 * recepção (é a recepção que estas fotos estão verificando). O fallback é
 * anunciado no log, nunca em silêncio.
 */
import { chromium, devices } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
};

const outDir = resolve(arg("--out", "./e2e-shots-call"));
mkdirSync(outDir, { recursive: true });
const WEB = arg("--web", process.env.WEB_URL ?? "http://localhost:3000");

const IPHONE = {
  ...devices["iPhone 14"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
};
/** Paisagem: o mesmo aparelho deitado. */
const IPHONE_DEITADO = { width: 844, height: 390 };

const E2E_EMAIL_DOMINIO = "e2e.streamz.test";
const SENHA = "Xk9#vWq2pLm7!";
const sufixo = arg("--usuario", "xipwp");
const ANA = { user: `ana${sufixo}`, pass: SENHA };
const BETO = { user: `beto${sufixo}`, pass: SENHA };

const foto = async (page, nome) => {
  const file = resolve(outDir, `${nome}.png`);
  await page.screenshot({ path: file });
  console.log("📸", file);
};

function observar(page, nome) {
  page.on("console", (m) => m.type() === "error" && console.log(`[${nome} console]`, m.text()));
  page.on("pageerror", (e) => console.log(`[${nome} pageerror]`, e.message));
}

async function entrar(ctx, { user, pass }) {
  const page = await ctx.newPage();
  observar(page, user);
  await page.goto(`${WEB}/login`);
  await page.fill((await page.$("#identificador")) ? "#identificador" : "#username", user);
  await page.fill("#password", pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(app|verify-email)(\/|\?|#|$)/, { timeout: 45_000 });
  if (page.url().includes("/verify-email")) {
    await page.goto(new URL("/app", page.url()).toString());
    await page.waitForURL("**/app", { timeout: 45_000 });
  }
  await page.waitForTimeout(2000);
  return page;
}

/** Um toque de dedo de verdade (o `click` do Playwright é um mouse). */
async function tocar(page, ctx, locator) {
  const caixa = await locator.boundingBox();
  if (!caixa) throw new Error("elemento sem caixa para o toque");
  const x = caixa.x + caixa.width / 2;
  const y = caixa.y + caixa.height / 2;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({
  headless: true,
  args: [
    "--font-render-hinting=none",
    "--disable-lcd-text",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--auto-select-desktop-capture-source=Entire screen",
    "--auto-accept-this-tab-capture",
    "--autoplay-policy=no-user-gesture-required",
    // dois contextos com WebRTC num servidor compartilhado: sem estes o
    // renderizador morre por falta de memória no meio da captura
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--renderer-process-limit=4",
  ],
});

try {
  const ctxAna = await browser.newContext({
    ...IPHONE,
    locale: "pt-BR",
    permissions: ["microphone", "camera"],
  });
  const ctxBeto = await browser.newContext({
    viewport: { width: 1300, height: 900 },
    locale: "pt-BR",
    permissions: ["microphone", "camera"],
  });

  const ana = await entrar(ctxAna, ANA);
  const beto = await entrar(ctxBeto, BETO);

  // ── os dois entram no canal de voz ──────────────────────────────────────
  const aba = (nome) => ana.locator(`nav[aria-label="Seções"] button`).filter({ hasText: nome });
  await aba("Servidores").click();
  await ana.waitForTimeout(1000);
  await ana.click('nav[aria-label="Servidores"] button[aria-label^="Time de Produto"]');
  await ana.waitForTimeout(1200);
  // "Geral" com maiúscula é o canal de VOZ; o de texto é "geral"
  await ana.getByText("Geral", { exact: true }).first().click();
  await ana.waitForTimeout(4000);

  await beto.click('nav[aria-label="Servidores"] button[aria-label^="Time de Produto"]');
  await beto.waitForTimeout(1500);
  await beto.getByText("Geral", { exact: true }).first().click();
  await beto.waitForTimeout(5000);

  console.log("na sala:", await ana.locator("[data-voice-tile]").count(), "tiles no telefone");

  // O Beto liga a câmera: com dois avatares a foto não mostra nada do que
  // mudou, e a faixa sintética do Chromium é uma imagem em movimento de verdade
  await beto
    .locator('button[aria-label="Ligar câmera"]')
    .first()
    .click()
    .catch(() => console.log("(o Beto não achou o botão de câmera)"));
  await beto.waitForTimeout(3500);

  // e a Ana liga a dela pela barra nova do celular
  await tocar(ana, ctxAna, ana.locator('button[aria-label="Ligar câmera"]').first()).catch(() =>
    console.log("(a Ana não achou o botão de câmera)"),
  );
  await ana.waitForTimeout(3500);

  await foto(ana, "08-call");

  // ── o Beto transmite a tela ─────────────────────────────────────────────
  let transmitindo = false;
  const botaoDeTela = beto.locator('button[aria-label="Compartilhar tela"]').first();
  if (await botaoDeTela.count()) {
    await botaoDeTela.click();
    await beto.waitForTimeout(6000);
    transmitindo = (await beto.locator('button[aria-label="Parar transmissão"]').count()) > 0;
  }
  if (!transmitindo) {
    console.log(
      "AVISO: `getDisplayMedia` não devolveu fonte (o headless não tem desktop). Trocando SÓ A CAPTURA por uma faixa de câmera — o caminho do app (o botão, `publicarTela`, a faixa como `ScreenShare`, o convite de assistir do outro lado) continua sendo o de verdade, que é o que estas fotos verificam.",
    );
    await beto.evaluate(() => {
      // a substituição é do harness, não do app: `getDisplayMedia` mora no
      // protótipo de `MediaDevices` e aqui vira uma propriedade da instância
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        configurable: true,
        value: () => navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } }),
      });
    });
    await botaoDeTela.click();
    await beto.waitForTimeout(6000);
    transmitindo = (await beto.locator('button[aria-label="Parar transmissão"]').count()) > 0;
  }
  console.log("transmitindo:", transmitindo);
  await beto.waitForTimeout(4000);

  // ── a Ana assiste ───────────────────────────────────────────────────────
  const assistir = ana.locator('button[aria-label^="Assistir à transmissão"]').first();
  if (await assistir.count()) {
    await tocar(ana, ctxAna, assistir);
    await ana.waitForTimeout(5000);
  } else {
    console.log("(nenhum convite de 'assistir' na tela da Ana)");
  }
  await ana.waitForTimeout(3000);
  await foto(ana, "11-tela-compartilhada-retrato");

  // ── e gira o telefone ───────────────────────────────────────────────────
  await ana.setViewportSize(IPHONE_DEITADO);
  await ana.waitForTimeout(2500);
  await foto(ana, "12-tela-compartilhada-paisagem");

  // ── e abre em tela cheia, que é o item do enunciado ──────────────────────
  // A ordem importa: com a Fullscreen API ligada o Chromium recusa
  // `setWindowBounds` ("restore it to normal state first"), então gira-se
  // **antes** de expandir e sai-se da tela cheia **antes** de girar de volta.
  async function telaCheia(nome) {
    const botao = ana.locator('button[aria-label^="Ver "]').first();
    if (!(await botao.count())) {
      console.log(`(sem botão de expandir para ${nome}: não havia imagem no destaque)`);
      return;
    }
    await tocar(ana, ctxAna, botao);
    // o `attach` da faixa acontece no efeito de montagem e o primeiro quadro
    // leva um instante: fotografar antes dele dá um retângulo preto
    await ana.waitForTimeout(5000);
    await foto(ana, nome);
    await ana.locator('button[aria-label="Sair da tela cheia"]').first().click();
    await ana.waitForTimeout(2500);
  }

  await ana.setViewportSize(IPHONE.viewport);
  await ana.waitForTimeout(2000);
  await telaCheia("13-tela-cheia-retrato");

  await ana.setViewportSize(IPHONE_DEITADO);
  await ana.waitForTimeout(2000);
  await telaCheia("14-tela-cheia-paisagem");

  console.log("OK");
} catch (e) {
  console.log("FALHOU:", String(e?.stack ?? e).split("\n").slice(0, 8).join("\n"));
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) await foto(p, `erro-call-${Math.random().toString(36).slice(2, 6)}`);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
