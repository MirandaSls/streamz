import { describe, expect, it } from "vitest";
import {
  comoAbrir,
  ehHttp,
  extensaoDoTipo,
  nomeDeArquivoDaImagem,
  precisaConverterParaPng,
} from "./imagem-acoes";

/**
 * A URL de um anexo nosso é **assinada**: o nome do arquivo vem no caminho e a
 * assinatura vem na query. Salvar "foto.png?X-Amz-Signature=…" seria um nome
 * inválido no Windows e ilegível em qualquer lugar.
 */
const ASSINADA =
  "https://bucket.r2.cloudflarestorage.com/anexos/abc/gato%20de%20botas.png" +
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef";

describe("nomeDeArquivoDaImagem", () => {
  it("tira a query assinada e decodifica o nome do caminho", () => {
    expect(nomeDeArquivoDaImagem(ASSINADA)).toBe("gato de botas.png");
  });

  it("na URL do proxy o caminho termina no id: o nome do anexo é que vale", () => {
    expect(
      nomeDeArquivoDaImagem("https://api.streamz.chat/api/uploads/file/abc123?t=jwt", "print.png"),
    ).toBe("print.png");
  });

  it("alternativo sem cara de arquivo perde para o nome que está na URL", () => {
    expect(nomeDeArquivoDaImagem(ASSINADA, "Imagem do link")).toBe("gato de botas.png");
  });

  it("sem nada na URL, o alternativo sem extensão ainda serve de nome", () => {
    expect(nomeDeArquivoDaImagem("https://ex.com/i/", "Imagem do link", "image/gif")).toBe(
      "Imagem do link.gif",
    );
  });

  it("sem nome no caminho e sem alternativo, usa a extensão do content-type", () => {
    expect(nomeDeArquivoDaImagem("https://api.streamz.chat/api/uploads/file/", null, "image/jpeg")).toBe(
      "imagem.jpg",
    );
  });

  it("sem content-type nenhum o padrão é .png", () => {
    expect(nomeDeArquivoDaImagem("https://ex.com/foto/")).toBe("imagem.png");
  });

  it("nome sem extensão ganha a do tipo", () => {
    expect(nomeDeArquivoDaImagem("https://ex.com/varal/ontem", null, "image/webp")).toBe(
      "ontem.webp",
    );
  });

  it("respeita a extensão que o nome já tem, mesmo em caixa alta", () => {
    expect(nomeDeArquivoDaImagem("https://ex.com/FOTO.JPEG", null, "image/png")).toBe("FOTO.JPEG");
  });

  it("descarta o fragmento", () => {
    expect(nomeDeArquivoDaImagem("https://ex.com/a/b.gif#topo")).toBe("b.gif");
  });

  it("tira o que o Windows recusa num nome de arquivo", () => {
    expect(nomeDeArquivoDaImagem("https://ex.com/a%2Fb%3Ac%22d.png")).toBe("abcd.png");
  });

  it("percent-encoding quebrado não derruba a conta", () => {
    expect(nomeDeArquivoDaImagem("https://ex.com/100%.png")).toBe("100%.png");
  });

  it("corta nome absurdamente longo", () => {
    const gigante = "x".repeat(300);
    expect(nomeDeArquivoDaImagem(`https://ex.com/${gigante}`).length).toBeLessThanOrEqual(85);
  });
});

describe("precisaConverterParaPng", () => {
  it("PNG entra na área de transferência como está", () => {
    expect(precisaConverterParaPng("image/png")).toBe(false);
    expect(precisaConverterParaPng("image/png; charset=binary")).toBe(false);
  });

  it("JPEG, WEBP e GIF passam pelo canvas", () => {
    expect(precisaConverterParaPng("image/jpeg")).toBe(true);
    expect(precisaConverterParaPng("image/webp")).toBe(true);
    expect(precisaConverterParaPng("image/gif")).toBe(true);
  });

  it("sem content-type, converte — é o caso em que não dá para confiar", () => {
    expect(precisaConverterParaPng(undefined)).toBe(true);
    expect(precisaConverterParaPng("")).toBe(true);
  });
});

describe("extensaoDoTipo", () => {
  it("mapeia os tipos que o app aceita", () => {
    expect(extensaoDoTipo("image/jpeg")).toBe("jpg");
    expect(extensaoDoTipo("IMAGE/PNG")).toBe("png");
    expect(extensaoDoTipo("image/svg+xml")).toBe("svg");
  });

  it("devolve null para o que não é imagem conhecida", () => {
    expect(extensaoDoTipo("application/pdf")).toBe(null);
    expect(extensaoDoTipo(null)).toBe(null);
  });
});

/**
 * O "Abrir no navegador" do visualizador não fazia nada no app de desktop: o
 * WebView2 não abre aba, e `window.open`/`target="_blank"` morrem em silêncio.
 * A escolha do caminho é o que este teste trava — o efeito (chamar o plugin
 * `opener` ou `window.open`) mora em `lib/desktop.ts`.
 */
describe("comoAbrir", () => {
  it("no desktop entrega ao sistema", () => {
    expect(comoAbrir("https://api.streamz.chat/api/uploads/file/abc", true)).toEqual({
      via: "sistema",
      url: "https://api.streamz.chat/api/uploads/file/abc",
    });
  });

  it("no site abre aba nova sem dar window.opener para ela", () => {
    expect(comoAbrir("https://api.streamz.chat/x.png", false)).toEqual({
      via: "aba",
      url: "https://api.streamz.chat/x.png",
      features: "noopener,noreferrer",
    });
  });

  it("recusa o que não é http(s), nos dois ambientes", () => {
    for (const suja of ["javascript:alert(1)", "data:image/png;base64,AAAA", "file:///C:/x.png"]) {
      expect(comoAbrir(suja, true)).toBe(null);
      expect(comoAbrir(suja, false)).toBe(null);
    }
  });

  it("aceita maiúsculas e espaço em volta, e devolve a URL aparada", () => {
    expect(comoAbrir("  HTTPS://ex.com/a.png ", false)?.url).toBe("HTTPS://ex.com/a.png");
  });
});

describe("ehHttp", () => {
  it("só http e https", () => {
    expect(ehHttp("http://ex.com/a")).toBe(true);
    expect(ehHttp("https://ex.com/a")).toBe(true);
    expect(ehHttp("blob:https://ex.com/uuid")).toBe(false);
    expect(ehHttp("//ex.com/a")).toBe(false);
  });
});
