import { describe, expect, it } from "vitest";
import {
  MAX_AVATAR_SIZE,
  MAX_BANNER_SIZE,
  MAX_IMAGEM_DE_PERFIL_GIF,
  MAX_LADO_IMAGEM_DE_PERFIL_GIF,
  TIPOS_DE_IMAGEM_DE_PERFIL,
  ehGifDeclarado,
  maxDaImagemDePerfil,
  maxUploadDeImagemDePerfil,
} from "@streamz/shared";
import { assinaturaGif } from "../uploads/media";
import {
  contentTypeDaChave,
  extensaoDe,
  validarImagemDePerfil,
} from "./imagem-de-perfil";

const AVATAR = { maxEstatico: MAX_AVATAR_SIZE, rotulo: "Avatar" };
const BANNER = { maxEstatico: MAX_BANNER_SIZE, rotulo: "Banner" };

/** GIF de `largura`×`altura`; `versao` e `laco` (NETSCAPE2.0) são o que varia. */
function gif(
  largura: number,
  altura: number,
  { versao = "GIF89a", laco = false, bytes = 32 } = {},
): Buffer {
  const cabecalho = Buffer.alloc(Math.max(bytes, 16));
  cabecalho.write(versao, 0, "ascii");
  cabecalho.writeUInt16LE(largura, 6);
  cabecalho.writeUInt16LE(altura, 8);
  return laco ? Buffer.concat([cabecalho, Buffer.from("NETSCAPE2.0", "ascii")]) : cabecalho;
}

/** PNG mínimo com as dimensões declaradas no IHDR. */
function png(largura: number, altura: number, bytes = 64): Buffer {
  const b = Buffer.alloc(Math.max(bytes, 32));
  b.write("\x89PNG\r\n\x1a\n", 0, "binary");
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  return b;
}

describe("assinatura do GIF", () => {
  it("reconhece as duas versões que existem", () => {
    expect(assinaturaGif(gif(64, 64, { versao: "GIF87a" }))).toBe("GIF87a");
    expect(assinaturaGif(gif(64, 64))).toBe("GIF89a");
  });

  it("recusa arquivo que só começa com as três letras", () => {
    // é o caso que o content-type declarado não pega: "image/gif" num arquivo
    // que não é GIF nenhum
    const falso = Buffer.alloc(32);
    falso.write("GIF00x", 0, "ascii");
    expect(assinaturaGif(falso)).toBeNull();
    expect(validarImagemDePerfil(falso, AVATAR)).toMatchObject({ ok: false });
  });

  it("recusa cabeçalho truncado", () => {
    expect(assinaturaGif(Buffer.from("GIF89a", "ascii"))).toBeNull();
  });
});

describe("validarImagemDePerfil", () => {
  it("aceita GIF animado e o marca como animado", () => {
    expect(validarImagemDePerfil(gif(256, 256, { laco: true }), AVATAR)).toMatchObject({
      ok: true,
      mime: "image/gif",
      extensao: "gif",
      width: 256,
      height: 256,
      animado: true,
    });
  });

  it("aceita GIF parado (não é erro, só não anima)", () => {
    expect(validarImagemDePerfil(gif(120, 120), BANNER)).toMatchObject({
      ok: true,
      mime: "image/gif",
      animado: false,
    });
  });

  it("dá ao GIF um teto de bytes maior que o do formato estático", () => {
    const grandeParaPng = MAX_AVATAR_SIZE + 1024;
    expect(validarImagemDePerfil(gif(64, 64, { bytes: grandeParaPng }), AVATAR)).toMatchObject({
      ok: true,
    });
    expect(validarImagemDePerfil(png(64, 64, grandeParaPng), AVATAR)).toMatchObject({
      ok: false,
      grande: true,
    });
  });

  it("recusa GIF acima de 8 MB, sinalizando 413", () => {
    const r = validarImagemDePerfil(gif(64, 64, { bytes: MAX_IMAGEM_DE_PERFIL_GIF + 1 }), AVATAR);
    expect(r).toMatchObject({ ok: false, grande: true });
    expect(r.ok === false && r.motivo).toContain("8 MB");
  });

  it("recusa GIF maior que o lado máximo (ninguém redimensiona depois)", () => {
    const lado = MAX_LADO_IMAGEM_DE_PERFIL_GIF + 1;
    const r = validarImagemDePerfil(gif(lado, 64), AVATAR);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.grande).toBeFalsy();
  });

  it("aceita GIF exatamente no lado máximo", () => {
    const lado = MAX_LADO_IMAGEM_DE_PERFIL_GIF;
    expect(validarImagemDePerfil(gif(lado, lado), BANNER)).toMatchObject({ ok: true });
  });

  it("continua aceitando os formatos estáticos de antes", () => {
    expect(validarImagemDePerfil(png(512, 512), AVATAR)).toMatchObject({
      ok: true,
      mime: "image/png",
      extensao: "png",
      animado: false,
    });
  });

  it("recusa arquivo vazio e arquivo que não é imagem", () => {
    expect(validarImagemDePerfil(Buffer.alloc(0), AVATAR)).toMatchObject({ ok: false });
    expect(validarImagemDePerfil(undefined, AVATAR)).toMatchObject({ ok: false });
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>", "ascii");
    expect(validarImagemDePerfil(svg, AVATAR)).toMatchObject({ ok: false });
  });

  it("usa o rótulo do formato na mensagem de erro", () => {
    const r = validarImagemDePerfil(png(64, 64, MAX_BANNER_SIZE + 1), BANNER);
    expect(r.ok === false && r.motivo).toContain("Banner");
  });
});

describe("content-type servido pelo proxy", () => {
  it("vem da extensão da chave", () => {
    expect(contentTypeDaChave("avatars/u1/abc.gif")).toBe("image/gif");
    expect(contentTypeDaChave("banners/u1/abc.png")).toBe("image/png");
    expect(contentTypeDaChave("avatars/u1/abc.jpg")).toBe("image/jpeg");
    expect(contentTypeDaChave("avatars/u1/abc.webp")).toBe("image/webp");
  });

  it("cai no genérico nas chaves antigas, que não têm extensão", () => {
    expect(contentTypeDaChave("avatars/u1/abc")).toBe("image/*");
  });

  it("casa com a extensão que o upload grava", () => {
    for (const mime of TIPOS_DE_IMAGEM_DE_PERFIL) {
      expect(contentTypeDaChave(`avatars/u1/x.${extensaoDe(mime)}`)).toBe(mime);
    }
  });
});

describe("contrato compartilhado", () => {
  it("reconhece GIF pelo tipo declarado ou pela extensão do nome", () => {
    expect(ehGifDeclarado({ type: "image/gif", name: "a.png" })).toBe(true);
    expect(ehGifDeclarado({ type: "", name: "festa.GIF" })).toBe(true);
    expect(ehGifDeclarado({ type: "image/png", name: "a.png" })).toBe(false);
  });

  it("dá ao GIF o teto de 8 MB nos dois formatos", () => {
    const arquivo = { type: "image/gif", name: "a.gif" };
    expect(maxDaImagemDePerfil(arquivo, MAX_AVATAR_SIZE)).toBe(MAX_IMAGEM_DE_PERFIL_GIF);
    expect(maxDaImagemDePerfil(arquivo, MAX_BANNER_SIZE)).toBe(MAX_IMAGEM_DE_PERFIL_GIF);
    expect(maxDaImagemDePerfil({ type: "image/png", name: "a.png" }, MAX_AVATAR_SIZE)).toBe(
      MAX_AVATAR_SIZE,
    );
  });

  it("o teto do multer cobre o maior dos dois — senão o GIF morria antes da validação", () => {
    expect(maxUploadDeImagemDePerfil(MAX_AVATAR_SIZE)).toBe(MAX_IMAGEM_DE_PERFIL_GIF);
    expect(maxUploadDeImagemDePerfil(MAX_BANNER_SIZE)).toBe(MAX_IMAGEM_DE_PERFIL_GIF);
    expect(maxUploadDeImagemDePerfil(MAX_IMAGEM_DE_PERFIL_GIF + 1)).toBe(
      MAX_IMAGEM_DE_PERFIL_GIF + 1,
    );
  });
});
