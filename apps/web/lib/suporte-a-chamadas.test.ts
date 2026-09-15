import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avisoSemChamadas,
  destinoNoNavegador,
  esquecerSuporteAChamadas,
  suportaChamadas,
  temWebRTC,
} from "./suporte-a-chamadas";

/**
 * O app de Linux roda no WebKitGTK sem `ENABLE_WEB_RTC`: `RTCPeerConnection`
 * não existe e o LiveKit não abre sala. O que se trava aqui é a regra (por
 * capacidade, igual à do `isBrowserSupported` do SDK), o texto e o destino do
 * "Abrir no navegador".
 */

/** Um `RTCPeerConnection` falso com os métodos pedidos no protótipo. */
function construtorCom(...metodos: string[]) {
  function Falso() {}
  for (const m of metodos) (Falso.prototype as Record<string, unknown>)[m] = () => {};
  return Falso;
}

const UA_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const UA_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0";
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile";

describe("temWebRTC", () => {
  it("sem RTCPeerConnection (WebKitGTK das distros) não faz chamada", () => {
    expect(temWebRTC({})).toBe(false);
    expect(temWebRTC(undefined)).toBe(false);
    expect(temWebRTC({ RTCPeerConnection: "não é construtor" })).toBe(false);
  });

  it("com addTransceiver ou addTrack faz", () => {
    expect(temWebRTC({ RTCPeerConnection: construtorCom("addTransceiver") })).toBe(true);
    expect(temWebRTC({ RTCPeerConnection: construtorCom("addTrack") })).toBe(true);
  });

  it("um RTCPeerConnection oco não basta — o SDK também recusaria", () => {
    expect(temWebRTC({ RTCPeerConnection: construtorCom() })).toBe(false);
  });
});

describe("suportaChamadas", () => {
  afterEach(() => esquecerSuporteAChamadas());

  it("memoriza a primeira resposta", () => {
    vi.stubGlobal("window", {});
    expect(suportaChamadas()).toBe(false);
    // o motor do webview não ganha WebRTC com a página aberta
    vi.stubGlobal("window", { RTCPeerConnection: construtorCom("addTrack") });
    expect(suportaChamadas()).toBe(false);
    esquecerSuporteAChamadas();
    expect(suportaChamadas()).toBe(true);
  });
});

describe("avisoSemChamadas", () => {
  const canal = { guildId: "g1", channelId: "c1" };
  const conversa = { guildId: null, channelId: "dm1" };

  it("no app de Linux nomeia o Linux e oferece o navegador", () => {
    const aviso = avisoSemChamadas({ noApp: true, userAgent: UA_LINUX, alvo: canal });
    expect(aviso.titulo).toBe("Chamadas de voz ainda não funcionam no app para Linux");
    expect(aviso.abrirNoNavegador).toBe(true);
    expect(aviso.mensagem).toContain("este canal");
  });

  it("numa conversa o texto fala da conversa", () => {
    const aviso = avisoSemChamadas({ noApp: true, userAgent: UA_LINUX, alvo: conversa });
    expect(aviso.mensagem).toContain("esta conversa");
  });

  it("a decisão é da capacidade: outro sistema sem WebRTC recebe o aviso genérico", () => {
    for (const userAgent of [UA_WINDOWS, UA_ANDROID]) {
      const aviso = avisoSemChamadas({ noApp: true, userAgent, alvo: canal });
      expect(aviso.titulo).toBe("Chamadas de voz não funcionam neste app");
      expect(aviso.abrirNoNavegador).toBe(true);
    }
  });

  it("no navegador não manda abrir no navegador", () => {
    const aviso = avisoSemChamadas({ noApp: false, userAgent: UA_LINUX, alvo: canal });
    expect(aviso.abrirNoNavegador).toBe(false);
  });
});

describe("destinoNoNavegador", () => {
  const NO_DESKTOP = ["https://streamz.chat", "http://tauri.localhost"];

  it("abre o mesmo canal no domínio público, não no tauri.localhost", () => {
    expect(destinoNoNavegador({ guildId: "g1", channelId: "c1" }, NO_DESKTOP)).toBe(
      "https://streamz.chat/app/channels/g1/c1",
    );
  });

  it("conversa direta usa @me no lugar do servidor", () => {
    expect(destinoNoNavegador({ guildId: null, channelId: "dm1" }, NO_DESKTOP)).toBe(
      "https://streamz.chat/app/channels/@me/dm1",
    );
  });
});
