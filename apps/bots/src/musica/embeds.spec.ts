import { describe, expect, it } from "vitest";
import {
  COR_DO_EMBED,
  MENSAGEM_PLAYLIST_GERADA_SPOTIFY,
  embedDeFaixa,
  embedDeLote,
  nomeDaFonte,
} from "./embeds";

const lote = { nome: "Rock", fonte: "Spotify", total: 3, duracaoTotalMs: 600_000 };
const faixa = { titulo: "Música", autor: "Banda", duracaoMs: 225_000, aoVivo: false, fonte: "YouTube" };

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

describe("embedDeLote", () => {
  it("usa plural correto", () => {
    expect(embedDeLote({ ...lote, total: 1 }).description).toContain("1 faixa ·");
    expect(embedDeLote({ ...lote, total: 1 }).description).not.toContain("1 faixas");
    expect(embedDeLote(lote).description).toContain("3 faixas ·");
  });
  it("escapa markdown no nome e linka só com http(s)", () => {
    const e = embedDeLote({ ...lote, nome: "**oferta** [x](http://m)", url: "https://a.com/p" });
    expect(e.description).toContain("\\*\\*oferta\\*\\*");
    expect(e.description).toContain("](https://a.com/p)");
    const sem = embedDeLote({ ...lote, url: "javascript:alert(1)" });
    expect(sem.description).not.toContain("](");
    expect(embedDeLote(lote).description).toContain("**Rock**");
  });
  it("mostra horas acima de 1h e de 24h", () => {
    const f = (ms: number) => embedDeLote({ ...lote, duracaoTotalMs: ms }).fields?.[1]?.value;
    expect(f(3_723_000)).toBe("1:02:03");
    expect(f(25 * 3_600_000)).toBe("25:00:00");
  });
  it("monta author, cor, thumbnail, pedido e rodapé", () => {
    const e = embedDeLote({ ...lote, capaUrl: "https://c/1.png", pediuPor: "42", nota: "obs" });
    expect(e.color).toBe(COR_DO_EMBED);
    expect(e.author?.name).toBe("Playlist do Spotify");
    expect(e.title).toBe("Playlist na fila");
    expect(e.thumbnail?.url).toBe("https://c/1.png");
    expect(e.fields?.map((x) => x.name)).toEqual(["Faixas", "Duração total", "Pedido por"]);
    expect(e.fields?.[2]?.value).toBe("<@42>");
    expect(e.footer?.text).toBe("obs");
    expect(embedDeLote(lote).fields).toHaveLength(2);
    expect(embedDeLote(lote).footer).toBeUndefined();
  });
  it("respeita os limites do Discord", () => {
    const e = embedDeLote({ ...lote, nome: "*".repeat(5000), url: "https://a.com" });
    expect((e.title ?? "").length).toBeLessThanOrEqual(250);
    expect((e.description ?? "").length).toBeLessThanOrEqual(4096);
  });
});

describe("embedDeFaixa", () => {
  it("títulos por estado", () => {
    expect(embedDeFaixa("tocando", faixa).title).toBe("Tocando agora");
    expect(embedDeFaixa("fila", { ...faixa, posicaoNaFila: 4 }).title).toBe("Na fila, posição 4");
  });
  it("descrição linkada, autor, fonte e campos", () => {
    const e = embedDeFaixa("tocando", { ...faixa, url: "https://y.com/v", pediuPor: "7", capaUrl: "https://c/i.png" });
    expect(e.description).toBe("**[Música](https://y.com/v)**\nBanda");
    expect(e.author?.name).toBe("YouTube");
    expect(e.fields?.[0]).toEqual({ name: "Duração", value: "3:45", inline: true });
    expect(e.fields?.[1]?.value).toBe("<@7>");
    expect(e.thumbnail?.url).toBe("https://c/i.png");
  });
  it("ao vivo e link ausente", () => {
    const e = embedDeFaixa("tocando", { ...faixa, aoVivo: true });
    expect(e.fields?.[0]?.value).toBe("ao vivo");
    expect(e.description).toContain("**Música**");
  });
  it("respeita limites com título enorme", () => {
    const e = embedDeFaixa("fila", { ...faixa, titulo: "a".repeat(9000), autor: "b".repeat(9000), nota: "n".repeat(500) });
    expect((e.title ?? "").length).toBeLessThanOrEqual(250);
    expect((e.description ?? "").length).toBeLessThanOrEqual(4096);
    expect((e.footer?.text ?? "").length).toBeLessThanOrEqual(200);
  });
});

describe("MENSAGEM_PLAYLIST_GERADA_SPOTIFY", () => {
  it("explica a restrição", () => {
    expect(MENSAGEM_PLAYLIST_GERADA_SPOTIFY).toContain("Daily Mix");
  });
});
