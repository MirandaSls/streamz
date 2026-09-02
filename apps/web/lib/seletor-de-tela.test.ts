import { describe, expect, it } from "vitest";
import {
  descreverPreset,
  estimativaDeBanda,
  fontesDaAba,
  juntarPreset,
  montarPedido,
  perfilDoPreset,
  presetDoPerfil,
  rotuloDaFonte,
  separarPreset,
  type FonteDeTela,
} from "./seletor-de-tela";

describe("alternador SD / HD", () => {
  it("SD é só o 720p30; qualquer outro preset acende HD", () => {
    expect(perfilDoPreset("720p30")).toBe("sd");
    expect(perfilDoPreset("720p60")).toBe("hd");
    expect(perfilDoPreset("1440p30")).toBe("hd");
  });

  it("HD volta para o que a engrenagem definiu por último", () => {
    expect(presetDoPerfil("hd", "1440p60")).toBe("1440p60");
    expect(presetDoPerfil("hd", null)).toBe("1080p60");
    // o "último HD" nunca é o SD: trocar SD→HD tem que sair do 720p30
    expect(presetDoPerfil("hd", "720p30")).toBe("1080p60");
    expect(presetDoPerfil("sd", "1440p60")).toBe("720p30");
  });

  it("separa e junta a chave do preset", () => {
    expect(separarPreset("1440p30")).toEqual({ resolucao: "1440p", fps: "30" });
    expect(juntarPreset("1080p", "60")).toBe("1080p60");
    expect(juntarPreset("4k", "60")).toBe("1080p60");
  });
});

describe("rodapé", () => {
  it("descreve o preset em duas linhas", () => {
    expect(descreverPreset("720p30")).toEqual({
      titulo: "Definição padrão",
      resumo: "Texto mais nítido · 720p · 30fps",
    });
    expect(descreverPreset("1080p60")).toEqual({
      titulo: "Alta definição",
      resumo: "Vídeo mais suave · 1080p · 60fps",
    });
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
    expect(fontesDaAba(fontes, "dispositivos")).toEqual([]);
  });

  it("rotula pelo título, acrescentando o app só quando o título não o cita", () => {
    expect(rotuloDaFonte(fontes[0])).toBe("Tela 1 (principal)");
    expect(rotuloDaFonte(fontes[1])).toBe("Streamz - Google Chrome");
    expect(rotuloDaFonte(fontes[2])).toBe("main.rs – Code");
  });
});

describe("pedido para o Rust", () => {
  it("leva resolução, taxa e bitrate do contrato compartilhado", () => {
    expect(montarPedido("janela:1", "1080p60", { url: "wss://x", token: "t" })).toEqual({
      url: "wss://x",
      token: "t",
      fonteId: "janela:1",
      largura: 1920,
      altura: 1080,
      fps: 60,
      maxBitrate: 4_500_000,
    });
  });
});
