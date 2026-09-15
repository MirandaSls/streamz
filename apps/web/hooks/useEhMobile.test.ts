/**
 * A regra de "isto é um celular?" — a parte pura, que é onde ela mora.
 *
 * O caso que este arquivo existe para travar: **o mesmo `apps/web/out` roda em
 * três apps**. Antes de o Android existir, "dentro do Tauri" e "é desktop"
 * eram a mesma coisa, e o hook devolvia `false` sempre que `isTauri()` fosse
 * verdadeiro. Com o app de celular embutindo o mesmo export, essa igualdade
 * deixou de valer — e o sintoma seria o shell de quatro colunas com rolagem
 * horizontal num telefone, que é justamente o que o leiaute mobile veio tirar.
 *
 * Os UAs abaixo são os reais dos três webviews (WebView2, Android System
 * WebView, WKWebView), encurtados só no que não muda a decisão.
 */
import { describe, expect, it } from "vitest";
import { decidirMobile, ehTauriDeCelular, type AmbienteDeLeiaute } from "./useEhMobile";

const UA_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const UA_IPAD_DISFARCADO =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const UA_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

/** Atalho: só o que cada caso realmente muda. */
function ambiente(parcial: Partial<AmbienteDeLeiaute>): AmbienteDeLeiaute {
  return {
    tauri: false,
    userAgent: UA_WINDOWS,
    ponteiroGrosso: false,
    maxTouchPoints: 0,
    consultaMobile: false,
    ...parcial,
  };
}

describe("decidirMobile — dentro do app Tauri", () => {
  it("desktop (Windows) é falso mesmo com a janela estreita", () => {
    // A janela do desktop pode ser arrastada para menos de 768px; virar barra
    // de abas ali seria a regressão que o comentário do hook descreve. Por isso
    // `consultaMobile: true` NÃO pode mandar aqui.
    expect(
      decidirMobile(ambiente({ tauri: true, userAgent: UA_WINDOWS, consultaMobile: true })),
    ).toBe(false);
  });

  it("Android é verdadeiro mesmo com a consulta de mídia dizendo que não", () => {
    // Um tablet Android deitado passa dos 767px e dos 599 de altura: a consulta
    // de mídia responde `false` e ainda assim é um celular.
    expect(
      decidirMobile(
        ambiente({
          tauri: true,
          userAgent: UA_ANDROID,
          ponteiroGrosso: true,
          consultaMobile: false,
        }),
      ),
    ).toBe(true);
  });

  it("iOS é verdadeiro", () => {
    expect(
      decidirMobile(
        ambiente({ tauri: true, userAgent: UA_IPHONE, ponteiroGrosso: true, consultaMobile: false }),
      ),
    ).toBe(true);
  });

  it("iPad, que se diz um Mac, é desempatado pelo ponteiro grosso", () => {
    expect(ehTauriDeCelular(UA_IPAD_DISFARCADO, true, 0)).toBe(true);
    // e o Mac de verdade, com o mesmo UA, continua sendo desktop
    expect(ehTauriDeCelular(UA_MAC, false, 0)).toBe(false);
  });

  it("iPad com trackpad/Magic Keyboard (ponteiro fino) é desempatado por maxTouchPoints", () => {
    // iPadOS com trackpad reporta ponteiro primário fino, mas a tela continua
    // sensível ao toque — é isso que `maxTouchPoints > 0` denuncia aqui.
    expect(
      decidirMobile(
        ambiente({
          tauri: true,
          userAgent: UA_IPAD_DISFARCADO,
          ponteiroGrosso: false,
          maxTouchPoints: 5,
          consultaMobile: false,
        }),
      ),
    ).toBe(true);
  });

  it("Mac de verdade com ponteiro fino e sem pontos de toque continua desktop", () => {
    expect(
      decidirMobile(
        ambiente({
          tauri: true,
          userAgent: UA_MAC,
          ponteiroGrosso: false,
          maxTouchPoints: 0,
          consultaMobile: true,
        }),
      ),
    ).toBe(false);
  });
});

describe("decidirMobile — no navegador", () => {
  it("janela estreita é celular", () => {
    expect(decidirMobile(ambiente({ consultaMobile: true }))).toBe(true);
  });

  it("janela larga não é", () => {
    expect(decidirMobile(ambiente({ consultaMobile: false }))).toBe(false);
  });

  it("o UA não manda fora do Tauri: quem decide é a largura", () => {
    // Chrome no celular com a janela larga (aparelho dobrável aberto, modo
    // desktop) segue o leiaute de colunas; o site sempre respondeu à janela.
    expect(decidirMobile(ambiente({ userAgent: UA_ANDROID, consultaMobile: false }))).toBe(false);
    expect(decidirMobile(ambiente({ userAgent: UA_WINDOWS, consultaMobile: true }))).toBe(true);
  });
});
