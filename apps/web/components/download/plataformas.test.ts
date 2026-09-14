import { describe, expect, it } from "vitest";
import type { DownloadCatalogo, DownloadDisponivel } from "@streamz/shared";
import { ApiError } from "@/lib/api-error";
import {
  dataDoInstalador,
  detectarSistema,
  disponivelPara,
  juntarComE,
  mensagemDeErroDoDownload,
  ofertaDoTopo,
  plataformaDaUrl,
  plataformasPorExtenso,
} from "./plataformas";

const UA = {
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

function item(plataforma: DownloadDisponivel["plataforma"]): DownloadDisponivel {
  return { plataforma, tamanho: 84_000_000, atualizadoEm: "2026-09-12T15:00:00.000Z" };
}

function pronto(catalogo: DownloadCatalogo) {
  return { tipo: "pronto" as const, catalogo };
}

describe("detectarSistema", () => {
  it("reconhece os quatro sistemas com instalador", () => {
    expect(detectarSistema(UA.windows)).toBe("windows");
    expect(detectarSistema(UA.mac)).toBe("macos");
    expect(detectarSistema(UA.linux)).toBe("linux");
    expect(detectarSistema(UA.android)).toBe("android");
  });

  it("dá Android, e não Linux, a um telefone Android (o UA traz os dois)", () => {
    expect(UA.android).toMatch(/Linux/);
    expect(detectarSistema(UA.android)).toBe("android");
  });

  it("não oferece macOS ao iPhone, cujo UA diz 'like Mac OS X'", () => {
    expect(detectarSistema(UA.iphone)).toBe("ios");
  });

  it("reconhece o iPad que finge ser Mac pelo toque", () => {
    expect(detectarSistema(UA.mac, 5)).toBe("ios");
    expect(detectarSistema(UA.mac, 0)).toBe("macos");
  });

  it("devolve null para o que não conhece", () => {
    expect(detectarSistema("curl/8.0")).toBeNull();
  });
});

describe("plataformaDaUrl", () => {
  it("aceita só plataforma do contrato", () => {
    expect(plataformaDaUrl("?plataforma=android")).toBe("android");
    expect(plataformaDaUrl("?plataforma=ios")).toBeNull();
    expect(plataformaDaUrl("?plataforma=<script>")).toBeNull();
    expect(plataformaDaUrl("")).toBeNull();
  });
});

describe("disponivelPara", () => {
  it("não oferece nada de catálogo não configurado, mesmo com itens", () => {
    const catalogo = { configurado: false, disponiveis: [item("windows")] };
    expect(disponivelPara(catalogo, "windows")).toBeNull();
  });

  it("acha o item da plataforma", () => {
    const catalogo = { configurado: true, disponiveis: [item("linux")] };
    expect(disponivelPara(catalogo, "linux")?.plataforma).toBe("linux");
    expect(disponivelPara(catalogo, "windows")).toBeNull();
    expect(disponivelPara(null, "linux")).toBeNull();
  });
});

describe("ofertaDoTopo", () => {
  it("repassa carregando e erro", () => {
    expect(ofertaDoTopo({ tipo: "carregando" }, "windows")).toEqual({ tipo: "carregando" });
    expect(ofertaDoTopo({ tipo: "erro" }, "windows")).toEqual({ tipo: "erro" });
  });

  it("explica o servidor sem senha configurada", () => {
    expect(ofertaDoTopo(pronto({ configurado: false, disponiveis: [] }), "windows").tipo).toBe(
      "nao-configurado",
    );
  });

  it("diz que não há instalador quando o catálogo está vazio", () => {
    expect(ofertaDoTopo(pronto({ configurado: true, disponiveis: [] }), "windows").tipo).toBe("vazio");
  });

  it("usa o sistema detectado quando ele tem instalador", () => {
    const oferta = ofertaDoTopo(
      pronto({ configurado: true, disponiveis: [item("linux"), item("windows")] }),
      "windows",
    );
    expect(oferta).toMatchObject({ tipo: "principal", disponivel: { plataforma: "windows" } });
  });

  it("oferece a lista, na ordem do contrato, quando o sistema não tem instalador", () => {
    const oferta = ofertaDoTopo(
      pronto({ configurado: true, disponiveis: [item("android"), item("windows")] }),
      "macos",
    );
    expect(oferta.tipo).toBe("lista");
    if (oferta.tipo !== "lista") return;
    expect(oferta.disponiveis.map((d) => d.plataforma)).toEqual(["windows", "android"]);
    expect(oferta.sistema).toBe("macos");
  });

  it("oferece a lista ao iPhone e a quem não foi detectado", () => {
    const catalogo = { configurado: true, disponiveis: [item("android")] };
    expect(ofertaDoTopo(pronto(catalogo), "ios").tipo).toBe("lista");
    expect(ofertaDoTopo(pronto(catalogo), null).tipo).toBe("lista");
  });
});

describe("textos", () => {
  it("junta a lista com vírgulas e 'e'", () => {
    expect(juntarComE([])).toBe("");
    expect(juntarComE(["Windows"])).toBe("Windows");
    expect(juntarComE(["Windows", "macOS"])).toBe("Windows e macOS");
    expect(plataformasPorExtenso()).toBe("Windows, macOS, Linux e Android");
  });

  it("formata a data do instalador e ignora lixo", () => {
    expect(dataDoInstalador("2026-09-12T15:00:00.000Z", "UTC")).toBe("12/09/2026");
    expect(dataDoInstalador("não é data")).toBeNull();
  });
});

describe("mensagemDeErroDoDownload", () => {
  it("traduz os casos da API como a página antiga", () => {
    expect(mensagemDeErroDoDownload(new ApiError(401, "x"))).toBe("Senha incorreta");
    expect(mensagemDeErroDoDownload(new ApiError(429, "x"))).toBe("Muitas tentativas — espere um minuto");
    expect(mensagemDeErroDoDownload(new ApiError(404, "Sem instalador para macOS"))).toBe(
      "Sem instalador para macOS",
    );
    expect(mensagemDeErroDoDownload(new ApiError(503, "Download desligado"))).toBe("Download desligado");
    expect(mensagemDeErroDoDownload(new Error("rede"))).toBe(
      "Não foi possível liberar o download. Tente de novo.",
    );
  });
});
