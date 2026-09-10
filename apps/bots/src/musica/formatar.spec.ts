import { describe, expect, it } from "vitest";
import {
  barraDeProgresso,
  ehLinkDoSpotify,
  escaparMarkdown,
  formatarDuracao,
  linhaDaFaixa,
  truncar,
} from "./formatar";

describe("formatarDuracao", () => {
  it("põe o zero à esquerda nos segundos", () => {
    expect(formatarDuracao(65_000)).toBe("1:05");
  });
  it("mostra a hora só quando existe", () => {
    expect(formatarDuracao(225_000)).toBe("3:45");
    expect(formatarDuracao(3_723_000)).toBe("1:02:03");
  });
  it("não quebra com lixo", () => {
    expect(formatarDuracao(Number.NaN)).toBe("0:00");
    expect(formatarDuracao(-1)).toBe("0:00");
  });
});

describe("barraDeProgresso", () => {
  it("tem sempre a largura pedida", () => {
    for (const p of [0, 1, 50_000, 99_999, 100_000, 200_000]) {
      expect([...barraDeProgresso(p, 100_000, 20)].length).toBe(20);
    }
  });
  it("põe o marcador no começo e no fim, sem estourar", () => {
    expect(barraDeProgresso(0, 100_000, 5).startsWith("🔘")).toBe(true);
    // posição além da duração (o Lavalink reporta com atraso) não empurra o
    // marcador para fora
    expect(barraDeProgresso(999_999, 100_000, 5).endsWith("🔘")).toBe(true);
  });
  it("sem duração (ao vivo) devolve a trilha lisa", () => {
    expect(barraDeProgresso(10, 0, 4)).toBe("▬▬▬▬");
  });
});

describe("escaparMarkdown", () => {
  it("desarma negrito e link de um título de terceiro", () => {
    expect(escaparMarkdown("**oferta**")).toBe("\\*\\*oferta\\*\\*");
    expect(escaparMarkdown("[clique](http://x)")).toBe("\\[clique\\]\\(http://x\\)");
  });
});

describe("truncar", () => {
  it("não mexe no que cabe", () => {
    expect(truncar("curto", 10)).toBe("curto");
  });
  it("corta com reticências, no tamanho pedido", () => {
    expect(truncar("abcdefghij", 5)).toBe("abcd…");
    expect([...truncar("abcdefghij", 5)].length).toBe(5);
  });
});

describe("linhaDaFaixa", () => {
  it("marca ao vivo em vez de duração", () => {
    const linha = linhaDaFaixa({ titulo: "Rádio", autor: "X", duracaoMs: 0, aoVivo: true });
    expect(linha).toContain("[ao vivo]");
  });
});

describe("ehLinkDoSpotify", () => {
  it("reconhece as duas formas de link", () => {
    expect(ehLinkDoSpotify("https://open.spotify.com/track/abc")).toBe(true);
    expect(ehLinkDoSpotify("spotify:track:abc")).toBe(true);
  });
  it("não confunde com uma busca comum", () => {
    expect(ehLinkDoSpotify("spotify mais tocadas")).toBe(false);
  });
});
