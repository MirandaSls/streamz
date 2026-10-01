import { afterEach, describe, expect, it } from "vitest";
import {
  COR_AVISO,
  COR_PADRAO,
  COR_SPOTIFY,
  MENSAGEM_PLAYLIST_GERADA_SPOTIFY,
  botaoDoSite,
  embedDeAdicionado,
  embedDeAdicionados,
  embedDeInatividade,
  nomeDaFonte,
} from "./embeds";

const lote = { nome: "Rock", fonte: "Spotify", total: 3 };
const faixa = { titulo: "Música", autor: "Banda" as string | undefined, duracaoMs: 225_000, aoVivo: false, fonte: "YouTube" };

describe("nomeDaFonte", () => {
  it("reconhece pelo sourceName", () => {
    expect(nomeDaFonte("spotify")).toBe("Spotify");
    expect(nomeDaFonte("youtube")).toBe("YouTube");
    expect(nomeDaFonte("soundcloud")).toBe("SoundCloud");
    expect(nomeDaFonte("jiosaavn")).toBe("JioSaavn");
  });
  it("cai para o host da uri quando o sourceName falta", () => {
    expect(nomeDaFonte("", "https://open.spotify.com/track/1")).toBe("Spotify");
    expect(nomeDaFonte(null, "https://youtu.be/abc")).toBe("YouTube");
    expect(nomeDaFonte(undefined, "https://www.youtube.com/watch?v=1")).toBe("YouTube");
    expect(nomeDaFonte(null, "https://soundcloud.com/a/b")).toBe("SoundCloud");
  });
  it("devolve Outra fonte para o desconhecido ou uri inválida", () => {
    expect(nomeDaFonte("http", "https://exemplo.com/a.mp3")).toBe("Outra fonte");
    expect(nomeDaFonte(null, "não é url")).toBe("Outra fonte");
    expect(nomeDaFonte()).toBe("Outra fonte");
  });
});

describe("embedDeAdicionado", () => {
  it("é uma linha só, sem título, thumbnail, campos nem rodapé", () => {
    const e = embedDeAdicionado({ ...faixa, url: "https://y.com/v" });
    expect(e.description).toBe("▶️ Adicionado **[Banda - Música](https://y.com/v)** - `03:45` à fila.");
    expect(e.title).toBeUndefined();
    expect(e.thumbnail).toBeUndefined();
    expect(e.fields).toBeUndefined();
    expect(e.footer).toBeUndefined();
  });
  it("ícone e cor por fonte", () => {
    const sp = embedDeAdicionado({ ...faixa, fonte: "Spotify" });
    expect(sp.color).toBe(COR_SPOTIFY);
    expect(sp.description).toMatch(/^🟢 /);
    const outra = embedDeAdicionado({ ...faixa, fonte: "Outra fonte" });
    expect(outra.color).toBe(COR_PADRAO);
    expect(outra.description).toMatch(/^✅ /);
    expect(embedDeAdicionado({ ...faixa, fonte: "SoundCloud" }).description).toMatch(/^☁️ /);
  });
  it("topo da fila, ao vivo e horas", () => {
    expect(embedDeAdicionado({ ...faixa, noTopo: true }).description).toContain("ao topo da fila.");
    expect(embedDeAdicionado({ ...faixa, aoVivo: true }).description).toContain("`ao vivo`");
    expect(embedDeAdicionado({ ...faixa, duracaoMs: 3_723_000 }).description).toContain("`1:02:03`");
  });
  it("escapa markdown e não linka esquema inseguro", () => {
    const e = embedDeAdicionado({ ...faixa, titulo: "**x**", url: "javascript:alert(1)" });
    expect(e.description).toContain("\\*\\*x\\*\\*");
    expect(e.description).not.toContain("](");
    expect(embedDeAdicionado({ ...faixa, autor: undefined }).description).toContain("**Música**");
  });
  it("trunca o título e respeita o limite de descrição", () => {
    const e = embedDeAdicionado({ ...faixa, titulo: "a".repeat(9000), url: "https://a.com" });
    expect((e.description ?? "").length).toBeLessThanOrEqual(4096);
    expect(e.description).not.toContain("a".repeat(80));
  });
});

describe("embedDeAdicionados", () => {
  it("usa plural correto", () => {
    expect(embedDeAdicionados({ ...lote, total: 1 }).description).toContain("com 1 faixa à fila.");
    expect(embedDeAdicionados(lote).description).toContain("com 3 faixas à fila.");
    expect(embedDeAdicionados({ ...lote, noTopo: true }).description).toContain("ao topo da fila.");
  });
  it("linka só com http(s), escapa e usa a cor da fonte", () => {
    const e = embedDeAdicionados({ ...lote, nome: "**oferta**", url: "https://a.com/p" });
    expect(e.description).toBe("🟢 Adicionado **[\\*\\*oferta\\*\\*](https://a.com/p)** com 3 faixas à fila.");
    expect(e.color).toBe(COR_SPOTIFY);
    expect(embedDeAdicionados({ ...lote, url: "ftp://x" }).description).not.toContain("](");
    expect(embedDeAdicionados({ ...lote, fonte: "YouTube" }).color).toBe(COR_PADRAO);
  });
  it("respeita o limite de descrição", () => {
    const e = embedDeAdicionados({ ...lote, nome: "*".repeat(5000), url: "https://a.com" });
    expect((e.description ?? "").length).toBeLessThanOrEqual(4096);
  });
});

describe("embedDeInatividade", () => {
  it("é âmbar e cita o /24-7", () => {
    const e = embedDeInatividade();
    expect(e.color).toBe(COR_AVISO);
    expect(e.description).toContain("/24-7");
  });
});

describe("botaoDoSite", () => {
  const original = process.env.WEB_PUBLIC_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.WEB_PUBLIC_URL;
    else process.env.WEB_PUBLIC_URL = original;
  });
  it("sem env ou com URL inválida não há botão", () => {
    delete process.env.WEB_PUBLIC_URL;
    expect(botaoDoSite()).toBeUndefined();
    process.env.WEB_PUBLIC_URL = "javascript:alert(1)";
    expect(botaoDoSite()).toBeUndefined();
    process.env.WEB_PUBLIC_URL = "  ";
    expect(botaoDoSite()).toBeUndefined();
  });
  it("com env vira botão de link com 🌐, sem barra final", () => {
    process.env.WEB_PUBLIC_URL = "https://streamz.chat/";
    const linha = botaoDoSite()?.[0];
    expect(linha?.type).toBe(1);
    expect(linha?.components[0]).toMatchObject({
      type: 2,
      style: 5,
      emoji: { name: "🌐" },
      label: "Controle a música direto pelo nosso site",
      url: "https://streamz.chat",
    });
  });
});

describe("MENSAGEM_PLAYLIST_GERADA_SPOTIFY", () => {
  it("explica a restrição", () => {
    expect(MENSAGEM_PLAYLIST_GERADA_SPOTIFY).toContain("Daily Mix");
    expect(MENSAGEM_PLAYLIST_GERADA_SPOTIFY).toContain("pública");
  });
});
