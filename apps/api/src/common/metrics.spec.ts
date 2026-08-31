import { describe, expect, it, beforeEach } from "vitest";
import {
  autorizarScrape,
  classeDeStatus,
  incrementar,
  registrarGauge,
  renderizarMetricas,
  zerarMetricas,
} from "./metrics";

describe("métricas", () => {
  beforeEach(() => zerarMetricas());

  it("acumula o contador por combinação de rótulos", async () => {
    incrementar("streamz_teste_total", { method: "GET", status: "2xx" });
    incrementar("streamz_teste_total", { method: "GET", status: "2xx" });
    incrementar("streamz_teste_total", { method: "POST", status: "4xx" });

    const texto = await renderizarMetricas();
    expect(texto).toContain('streamz_teste_total{method="GET",status="2xx"} 2');
    expect(texto).toContain('streamz_teste_total{method="POST",status="4xx"} 1');
    // um HELP/TYPE por família, não por série
    expect(texto.match(/# TYPE streamz_teste_total/g)).toHaveLength(1);
  });

  it("lê o gauge no momento do scrape", async () => {
    let valor = 1;
    registrarGauge("streamz_gauge", "ajuda", () => valor);

    expect(await renderizarMetricas()).toContain("streamz_gauge 1");
    valor = 7;
    expect(await renderizarMetricas()).toContain("streamz_gauge 7");
  });

  it("omite gauge que falha em vez de derrubar o scrape inteiro", async () => {
    registrarGauge("streamz_ok", "ajuda", () => 42);
    registrarGauge("streamz_quebrado", "ajuda", () => {
      throw new Error("banco fora");
    });

    const texto = await renderizarMetricas();
    expect(texto).toContain("streamz_ok 42");
    expect(texto).not.toContain("streamz_quebrado");
  });

  it("escapa aspas e quebras de linha no valor do rótulo", async () => {
    incrementar("streamz_escape_total", { origem: 'a"b\nc' });
    expect(await renderizarMetricas()).toContain('origem="a\\"b\\nc"');
  });

  it("agrupa status por classe para não abrir uma série por código", () => {
    expect(classeDeStatus(200)).toBe("2xx");
    expect(classeDeStatus(404)).toBe("4xx");
    expect(classeDeStatus(503)).toBe("5xx");
  });
});

describe("acesso ao /metrics", () => {
  const prod = { NODE_ENV: "production" };

  it("sem METRICS_TOKEN, fica aberto em dev e desligado em produção", () => {
    expect(autorizarScrape(undefined, { NODE_ENV: "development" })).toBe("liberado");
    expect(autorizarScrape(undefined, prod)).toBe("desligado");
  });

  it("com METRICS_TOKEN, exige o bearer certo", () => {
    const env = { ...prod, METRICS_TOKEN: "s3gr3d0" };
    expect(autorizarScrape("Bearer s3gr3d0", env)).toBe("liberado");
    expect(autorizarScrape("Bearer errado", env)).toBe("negado");
    expect(autorizarScrape(undefined, env)).toBe("negado");
    // token certo, esquema errado: não vale
    expect(autorizarScrape("s3gr3d0", env)).toBe("negado");
    expect(autorizarScrape("Basic s3gr3d0", env)).toBe("negado");
  });

  it("um prefixo correto não passa (a comparação é do valor inteiro)", () => {
    const env = { ...prod, METRICS_TOKEN: "abcdef" };
    expect(autorizarScrape("Bearer abc", env)).toBe("negado");
    expect(autorizarScrape("Bearer abcdefgh", env)).toBe("negado");
  });

  it("METRICS_TOKEN só com espaços conta como ausente", () => {
    expect(autorizarScrape("Bearer   ", { ...prod, METRICS_TOKEN: "   " })).toBe("desligado");
  });
});
