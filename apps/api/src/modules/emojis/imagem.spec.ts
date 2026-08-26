import { describe, expect, it } from "vitest";
import { extensaoDe, temAnimacao, validarImagem } from "./imagem";
import { normalizarTags } from "./stickers.service";

/** PNG mínimo com as dimensões que o IHDR declara (o resto é preenchimento). */
function png(width: number, height: number, bytes = 64): Buffer {
  const b = Buffer.alloc(Math.max(bytes, 32));
  b.write("\x89PNG\r\n\x1a\n", 0, "binary");
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

/** GIF de `width`×`height`; com `laco`, carrega a extensão NETSCAPE2.0. */
function gif(width: number, height: number, laco = false): Buffer {
  const cabecalho = Buffer.alloc(32);
  cabecalho.write("GIF89a", 0, "ascii");
  cabecalho.writeUInt16LE(width, 6);
  cabecalho.writeUInt16LE(height, 8);
  return laco ? Buffer.concat([cabecalho, Buffer.from("NETSCAPE2.0", "ascii")]) : cabecalho;
}

/** WebP estendido (VP8X); `anim` liga o bit de animação nas flags. */
function webp(width: number, height: number, anim = false): Buffer {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b[20] = anim ? 0x02 : 0x00;
  const w = width - 1;
  const h = height - 1;
  b[24] = w & 0xff;
  b[25] = (w >> 8) & 0xff;
  b[26] = (w >> 16) & 0xff;
  b[27] = h & 0xff;
  b[28] = (h >> 8) & 0xff;
  b[29] = (h >> 16) & 0xff;
  return b;
}

const LIMITES = { maxBytes: 256 * 1024, maxLado: 128 };

describe("validarImagem", () => {
  it("aceita PNG dentro dos limites", () => {
    const r = validarImagem(png(128, 128), LIMITES);
    expect(r).toMatchObject({ ok: true, mime: "image/png", width: 128, height: 128 });
  });

  it("recusa arquivo vazio", () => {
    expect(validarImagem(Buffer.alloc(0), LIMITES)).toMatchObject({ ok: false });
  });

  it("recusa arquivo grande e sinaliza para virar 413", () => {
    const r = validarImagem(png(64, 64, 300 * 1024), LIMITES);
    expect(r).toMatchObject({ ok: false, grande: true });
  });

  it("recusa formato não reconhecido", () => {
    const texto = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>", "ascii");
    expect(validarImagem(texto, LIMITES)).toMatchObject({ ok: false });
  });

  it("recusa imagem maior que o lado máximo, dizendo a medida", () => {
    const r = validarImagem(png(512, 128), LIMITES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("512×128");
  });

  it("marca GIF com laço como animado e GIF simples como estático", () => {
    expect(validarImagem(gif(64, 64, true), LIMITES)).toMatchObject({ animated: true });
    expect(validarImagem(gif(64, 64), LIMITES)).toMatchObject({ animated: false });
  });

  it("marca WebP com o bloco ANIM como animado", () => {
    expect(temAnimacao(webp(64, 64, true), "image/webp")).toBe(true);
    expect(temAnimacao(webp(64, 64), "image/webp")).toBe(false);
  });

  it("PNG nunca é animado", () => {
    expect(temAnimacao(png(32, 32), "image/png")).toBe(false);
  });
});

describe("extensaoDe", () => {
  it("mapeia os três tipos aceitos", () => {
    expect(extensaoDe("image/png")).toBe("png");
    expect(extensaoDe("image/gif")).toBe("gif");
    expect(extensaoDe("image/webp")).toBe("webp");
  });
});

describe("normalizarTags", () => {
  it("baixa a caixa, tira repetição e limpa a pontuação", () => {
    expect(normalizarTags("Festa, festa  ALEGRIA!")).toBe("festa alegria");
  });

  it("aceita texto vazio", () => {
    expect(normalizarTags("")).toBe("");
  });

  it("para no teto de palavras-chave", () => {
    const muitas = "a1 b2 c3 d4 e5 f6 g7 h8 i9 j10";
    expect(normalizarTags(muitas).split(" ")).toHaveLength(8);
  });
});
