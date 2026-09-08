import { describe, expect, it } from "vitest";
import { decodificarEntidades, extrairTags } from "./meta-tags";

const PAGINA = `<!doctype html>
<html><head>
  <TITLE>Título &amp; Cia</TITLE>
  <meta charset="utf-8">
  <meta property="og:title" content="Prévia do Streamz">
  <meta name='twitter:title' content='ignorado, og ganha'>
  <meta content="Descrição da página" property="og:description">
  <meta property="og:image" content="/capa.png">
  <meta property="og:site_name" content="Streamz">
  <meta name="description" content="a de baixo">
  <meta property="og:title" content="segunda, deve ser ignorada">
</head><body>corpo</body></html>`;

describe("extrairTags", () => {
  it("lê os campos que a prévia usa, em qualquer ordem de atributo", () => {
    const { metas, titulo } = extrairTags(PAGINA);
    expect(metas.get("og:title")).toBe("Prévia do Streamz");
    expect(metas.get("og:description")).toBe("Descrição da página");
    expect(metas.get("og:image")).toBe("/capa.png");
    expect(metas.get("og:site_name")).toBe("Streamz");
    expect(metas.get("twitter:title")).toBe("ignorado, og ganha");
    expect(metas.get("description")).toBe("a de baixo");
    expect(titulo).toBe("Título &amp; Cia");
  });

  it("fica com a primeira ocorrência de cada campo", () => {
    expect(extrairTags(PAGINA).metas.get("og:title")).toBe("Prévia do Streamz");
  });

  it("aceita tag em caixa alta sem estragar o valor", () => {
    const { metas } = extrairTags(`<META PROPERTY="OG:Title" CONTENT="Maiúsculas Preservadas">`);
    expect(metas.get("og:title")).toBe("Maiúsculas Preservadas");
  });

  it("não confunde <metadados> com <meta>", () => {
    const { metas } = extrairTags(`<metadados property="og:title" content="não é meta">`);
    expect(metas.size).toBe(0);
  });

  it("sem título e sem meta devolve vazio", () => {
    const { metas, titulo } = extrairTags("<html><body>nada aqui</body></html>");
    expect(metas.size).toBe(0);
    expect(titulo).toBeNull();
  });

  /**
   * Regressão do ReDoS: a versão antiga levava ~2 s com 40 KB destes, e a API
   * inteira parava junto (event loop único). Aqui é varredura linear, então
   * 100 KB de entrada hostil têm de sair em milissegundos.
   */
  it("não degrada com '<meta' repetido sem nenhum '>'", () => {
    const hostil = "<meta".repeat(20_000);
    const inicio = Date.now();
    const { metas, titulo } = extrairTags(hostil);
    const gasto = Date.now() - inicio;
    expect(metas.size).toBe(0);
    expect(titulo).toBeNull();
    expect(gasto).toBeLessThan(500);
  });

  it("não degrada com '<title' repetido sem nenhum '>'", () => {
    const inicio = Date.now();
    expect(extrairTags("<title".repeat(20_000)).titulo).toBeNull();
    expect(Date.now() - inicio).toBeLessThan(500);
  });

  it("continua correto quando o lixo vem antes de uma página de verdade", () => {
    const inicio = Date.now();
    const { metas, titulo } = extrairTags("<meta".repeat(20_000) + PAGINA);
    expect(metas.get("og:title")).toBe("Prévia do Streamz");
    expect(titulo).toBe("Título &amp; Cia");
    expect(Date.now() - inicio).toBeLessThan(500);
  });
});

describe("decodificarEntidades", () => {
  it("resolve as entidades que aparecem em título e descrição", () => {
    expect(decodificarEntidades("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#233;")).toBe(`a & b <c> "d" 'e' é`);
  });
});
