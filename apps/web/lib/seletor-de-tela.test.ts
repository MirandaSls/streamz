import { describe, expect, it } from "vitest";
import { SCREEN_QUALITY } from "@streamz/shared";
import {
  RESOLUCOES,
  TAXAS,
  ehCancelamento,
  estimativaDeBanda,
  fontesDaAba,
  juntarPreset,
  mensagemDeErro,
  montarPedido,
  restricoesDeCaptura,
  rotuloDaFonte,
  separarPreset,
  type FonteDeTela,
} from "./seletor-de-tela";

describe("seletores de qualidade", () => {
  it("separa e junta a chave do preset", () => {
    expect(separarPreset("1440p30")).toEqual({ resolucao: "1440p", fps: "30" });
    expect(separarPreset("720p60")).toEqual({ resolucao: "720p", fps: "60" });
    expect(juntarPreset("1080p", "60")).toBe("1080p60");
    // combinação que o contrato não tem: cai no padrão em vez de virar chave inválida
    expect(juntarPreset("4k", "60")).toBe("1440p30");
  });

  it("oferece o que os presets permitem, em ordem crescente", () => {
    expect(RESOLUCOES).toEqual(["720p", "1080p", "1440p"]);
    expect(TAXAS).toEqual(["30", "60"]);
  });

  it("toda combinação das duas listas é um preset de verdade", () => {
    for (const r of RESOLUCOES) {
      for (const f of TAXAS) {
        expect(`${r}${f}` in SCREEN_QUALITY).toBe(true);
      }
    }
  });

  it("estima a banda com vírgula decimal", () => {
    expect(estimativaDeBanda("720p30")).toBe("1,5 Mbps");
    expect(estimativaDeBanda("1440p60")).toBe("9,0 Mbps");
  });
});

const fontes: FonteDeTela[] = [
  { id: "monitor:\\\\.\\DISPLAY1", tipo: "monitor", titulo: "Tela 1 (principal)", app: null, icone: null, largura: 2560, altura: 1440, principal: true },
  { id: "janela:1", tipo: "janela", titulo: "Streamz - Google Chrome", app: "chrome", icone: null, largura: 1200, altura: 800, principal: false },
  { id: "janela:2", tipo: "janela", titulo: "main.rs", app: "Code", icone: null, largura: 1200, altura: 800, principal: false },
];

describe("fontes", () => {
  it("divide por aba na ordem em que o Rust entregou", () => {
    expect(fontesDaAba(fontes, "aplicativos").map((f) => f.id)).toEqual(["janela:1", "janela:2"]);
    expect(fontesDaAba(fontes, "telas").map((f) => f.id)).toEqual(["monitor:\\\\.\\DISPLAY1"]);
  });

  it("rotula pelo título, acrescentando o app só quando o título não o cita", () => {
    expect(rotuloDaFonte(fontes[0])).toBe("Tela 1 (principal)");
    expect(rotuloDaFonte(fontes[1])).toBe("Streamz - Google Chrome");
    expect(rotuloDaFonte(fontes[2])).toBe("main.rs – Code");
  });
});

describe("pedido para o Rust", () => {
  it("leva resolução, taxa e bitrate do contrato compartilhado", () => {
    expect(montarPedido("janela:1", "1080p60", { url: "wss://x", token: "t" }, true)).toEqual({
      url: "wss://x",
      token: "t",
      fonteId: "janela:1",
      largura: 1920,
      altura: 1080,
      fps: 60,
      maxBitrate: 4_500_000,
      audio: true,
      audioMaxBitrate: 160_000,
    });
  });
});

describe("captura do navegador", () => {
  it("leva o preset e o áudio de sistema sem processamento de voz", () => {
    expect(restricoesDeCaptura("1080p60", true)).toEqual({
      video: { displaySurface: "monitor", width: 1920, height: 1080, frameRate: 60 },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
      },
    });
  });

  it("sem áudio do sistema, pede vídeo só", () => {
    expect(restricoesDeCaptura("720p30", false)).toEqual({
      video: { displaySurface: "monitor", width: 1280, height: 720, frameRate: 30 },
      audio: false,
    });
  });

  it("cancelar o diálogo não é erro; bloqueio do sistema é", () => {
    // o usuário fechou o seletor do navegador: nada acontece, sem aviso
    const cancelou = new DOMException(
      "The request is not allowed by the user agent or the platform in the current context.",
      "NotAllowedError",
    );
    expect(ehCancelamento(cancelou)).toBe(true);
    // permissão de gravação de tela negada no sistema operacional
    const bloqueio = new DOMException("System policy denies screen capture", "NotAllowedError");
    expect(ehCancelamento(bloqueio)).toBe(false);
    expect(mensagemDeErro(bloqueio)).toMatch(/permissões do sistema/);
    expect(ehCancelamento(new Error("qualquer outra coisa"))).toBe(false);
  });

  it("traduz os erros que o navegador sabe dar", () => {
    expect(mensagemDeErro(new DOMException("", "NotFoundError"))).toBe(
      "Nenhuma fonte de captura disponível.",
    );
    expect(mensagemDeErro(new DOMException("", "NotReadableError"))).toBe(
      "Outro aplicativo está usando essa fonte.",
    );
    expect(mensagemDeErro(new Error("boom"))).toBe(
      "Não foi possível iniciar o compartilhamento de tela.",
    );
  });
});
